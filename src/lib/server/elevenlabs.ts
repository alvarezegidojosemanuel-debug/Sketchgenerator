/**
 * Lógica servidor de las voces ElevenLabs.
 *
 * - La clave (ELEVENLABS_API_KEY) solo vive en el servidor (Vercel).
 * - Protegido con un código de acceso (POCKET_ACCESS_CODE): sin él configurado, el endpoint
 *   no funciona; así una URL pública no permite gastar tus créditos.
 * - Límites: texto máximo por frase, peticiones por IP, tope diario de caracteres (en memoria,
 *   orientativo) además del límite de créditos que pusiste en la propia clave.
 * - Solo modelos de la lista blanca; nunca se reintenta.
 */
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";

export interface ElevenEnv {
  ELEVENLABS_API_KEY?: string;
  POCKET_ACCESS_CODE?: string;
  ELEVENLABS_DAILY_CHARS?: string;
  ELEVENLABS_RATE_PER_IP?: string;
}

export interface ElevenState {
  day: string;
  chars: number;
  perIp: Map<string, number[]>;
  voices: { at: number; data: unknown } | null;
}

export const createElevenState = (): ElevenState => ({ day: "", chars: 0, perIp: new Map(), voices: null });

export const ELEVEN_API = "https://api.elevenlabs.io";
export const ELEVEN_MODELS = ["eleven_multilingual_v2", "eleven_v3", "eleven_flash_v2_5"] as const;
export const MAX_LINE_CHARS = 400;
const WINDOW_MS = 10 * 60 * 1000;

const num = (v: string | undefined, d: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function elevenConfig(env: ElevenEnv) {
  return {
    hasKey: Boolean(env.ELEVENLABS_API_KEY?.trim()),
    hasCode: Boolean(env.POCKET_ACCESS_CODE?.trim()),
    dailyChars: num(env.ELEVENLABS_DAILY_CHARS, 8000),
    ratePerIp: num(env.ELEVENLABS_RATE_PER_IP, 120),
  };
}

function codeOk(env: ElevenEnv, given: string | null): boolean {
  const want = env.POCKET_ACCESS_CODE?.trim();
  if (!want || !given) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(given.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface Res {
  status: number;
  json?: Record<string, unknown>;
  audio?: ArrayBuffer;
}

function gate(env: ElevenEnv, code: string | null): Res | null {
  const c = elevenConfig(env);
  if (!c.hasKey) return { status: 503, json: { error: "no_key", message: "Falta ELEVENLABS_API_KEY en Vercel." } };
  if (!c.hasCode) return { status: 503, json: { error: "no_code", message: "Falta POCKET_ACCESS_CODE en Vercel (protege tus créditos)." } };
  if (!codeOk(env, code)) return { status: 401, json: { error: "bad_code", message: "Código de acceso incorrecto." } };
  return null;
}

export function elevenStatus(env: ElevenEnv, state: ElevenState, now: number) {
  const c = elevenConfig(env);
  const today = new Date(now).toISOString().slice(0, 10);
  return {
    enabled: c.hasKey && c.hasCode,
    hasKey: c.hasKey,
    hasCode: c.hasCode,
    dailyChars: c.dailyChars,
    usedToday: state.day === today ? state.chars : 0,
  };
}

export async function handleVoices(env: ElevenEnv, code: string | null, deps: { fetch: typeof fetch; now: () => number; state: ElevenState }): Promise<Res> {
  const g = gate(env, code);
  if (g) return g;
  if (deps.state.voices && deps.now() - deps.state.voices.at < 10 * 60 * 1000) return { status: 200, json: deps.state.voices.data as Record<string, unknown> };
  const r = await deps.fetch(`${ELEVEN_API}/v1/voices`, { headers: { "xi-api-key": env.ELEVENLABS_API_KEY! } });
  if (!r.ok) return { status: 502, json: { error: "upstream", message: `ElevenLabs respondió ${r.status} al listar voces (¿permiso «Voces: Leído» en la clave?).` } };
  const raw = (await r.json()) as { voices?: { voice_id: string; name: string; category?: string; labels?: Record<string, string>; preview_url?: string }[] };
  const data = {
    voices: (raw.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category ?? "", labels: v.labels ?? {}, preview: v.preview_url ?? "" })),
  };
  deps.state.voices = { at: deps.now(), data };
  return { status: 200, json: data };
}

const TtsBody = z.object({
  text: z.string().min(1).max(MAX_LINE_CHARS),
  voiceId: z.string().regex(/^[A-Za-z0-9]{8,40}$/),
  model: z.enum(ELEVEN_MODELS),
  settings: z.object({
    stability: z.number().min(0).max(1),
    similarity: z.number().min(0).max(1),
    style: z.number().min(0).max(1),
    speed: z.number().min(0.7).max(1.2),
  }),
  /** Frases vecinas (solo contexto de entonación; no se leen ni se cobran). */
  previousText: z.string().max(400).optional(),
  nextText: z.string().max(400).optional(),
});

export async function handleTts(body: unknown, ip: string, code: string | null, env: ElevenEnv, deps: { fetch: typeof fetch; now: () => number; state: ElevenState }): Promise<Res> {
  const g = gate(env, code);
  if (g) return g;
  const p = TtsBody.safeParse(body);
  if (!p.success) return { status: 400, json: { error: "bad_request", message: "Petición de voz no válida." } };
  const { text, voiceId, model, settings, previousText, nextText } = p.data;
  const cfg = elevenConfig(env);
  const now = deps.now();
  const hits = (deps.state.perIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= cfg.ratePerIp) return { status: 429, json: { error: "rate_limited", message: "Demasiadas peticiones seguidas; espera unos minutos." } };
  const today = new Date(now).toISOString().slice(0, 10);
  if (deps.state.day !== today) {
    deps.state.day = today;
    deps.state.chars = 0;
  }
  if (deps.state.chars + text.length > cfg.dailyChars) {
    return { status: 429, json: { error: "daily_cap", message: `Tope diario de ${cfg.dailyChars} caracteres alcanzado (ELEVENLABS_DAILY_CHARS).` } };
  }
  hits.push(now);
  deps.state.perIp.set(ip, hits);
  deps.state.chars += text.length;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const r = await deps.fetch(`${ELEVEN_API}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: model,
        language_code: model === "eleven_v3" ? undefined : "es",
        previous_text: model === "eleven_v3" ? undefined : previousText,
        next_text: model === "eleven_v3" ? undefined : nextText,
        // v3 solo admite 0 (creativa), 0,5 (natural) y 1 (robusta)
        voice_settings: { stability: model === "eleven_v3" ? (settings.stability < 0.25 ? 0 : settings.stability < 0.75 ? 0.5 : 1) : settings.stability, similarity_boost: settings.similarity, style: settings.style, use_speaker_boost: true, speed: settings.speed },
        // semilla fija por frase: la misma frase suena igual en cualquier dispositivo
        seed: seedOf(`${voiceId}|${model}|${text}`),
      }),
    });
    if (!r.ok) {
      deps.state.chars -= text.length;
      const detail = await r.text().catch(() => "");
      const quota = r.status === 401 && /quota|credit/i.test(detail);
      return {
        status: r.status === 429 || quota ? 429 : 502,
        json: {
          error: quota ? "quota" : "upstream",
          message: (quota ? "Se acabaron los créditos de ElevenLabs de este mes (o el límite de la clave)." : `ElevenLabs respondió ${r.status}.`) + upstreamReason(detail),
        },
      };
    }
    return { status: 200, audio: await r.arrayBuffer() };
  } catch {
    deps.state.chars -= text.length;
    return { status: 504, json: { error: "timeout", message: "ElevenLabs no respondió a tiempo." } };
  } finally {
    clearTimeout(timer);
  }
}

const DialogueBody = z.object({
  inputs: z
    .array(z.object({ text: z.string().min(1).max(MAX_LINE_CHARS), voiceId: z.string().regex(/^[A-Za-z0-9]{8,40}$/) }))
    .min(1)
    .max(40),
  stability: z.number().min(0).max(1).optional(),
});

/** El motivo que da ElevenLabs (p. ej. «exceeds your API key quota of 10000…»), para saber qué límite salta. */
function upstreamReason(detail: string): string {
  try {
    const d = (JSON.parse(detail) as { detail?: { message?: string } | string }).detail;
    const m = typeof d === "string" ? d : d?.message;
    return m ? ` ElevenLabs dice: «${m.slice(0, 300)}»` : "";
  } catch {
    return "";
  }
}

export interface DialogueSegment {
  index: number;
  start: number;
  end: number;
}

/**
 * Diálogo completo de una escena en UNA petición (ElevenLabs «text to dialogue», modelo v3): las frases se
 * entonan respondiéndose unas a otras. Devuelve el audio (base64) y dónde empieza y acaba cada frase.
 */
export async function handleDialogue(body: unknown, ip: string, code: string | null, env: ElevenEnv, deps: { fetch: typeof fetch; now: () => number; state: ElevenState }): Promise<Res> {
  const g = gate(env, code);
  if (g) return g;
  const p = DialogueBody.safeParse(body);
  if (!p.success) return { status: 400, json: { error: "bad_request", message: "Diálogo no válido (1–40 frases, máx. 400 caracteres cada una)." } };
  const chars = p.data.inputs.reduce((n, i) => n + i.text.length, 0);
  const cfg = elevenConfig(env);
  const now = deps.now();
  const hits = (deps.state.perIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= cfg.ratePerIp) return { status: 429, json: { error: "rate_limited", message: "Demasiadas peticiones seguidas; espera unos minutos." } };
  const today = new Date(now).toISOString().slice(0, 10);
  if (deps.state.day !== today) {
    deps.state.day = today;
    deps.state.chars = 0;
  }
  if (deps.state.chars + chars > cfg.dailyChars) return { status: 429, json: { error: "daily_cap", message: `Tope diario de ${cfg.dailyChars} caracteres alcanzado (ELEVENLABS_DAILY_CHARS).` } };
  hits.push(now);
  deps.state.perIp.set(ip, hits);
  deps.state.chars += chars;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const r = await deps.fetch(`${ELEVEN_API}/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify({
        inputs: p.data.inputs.map((i) => ({ text: i.text, voice_id: i.voiceId })),
        model_id: "eleven_v3",
        seed: seedOf(p.data.inputs.map((i) => `${i.voiceId}|${i.text}`).join("\n")),
        ...(p.data.stability !== undefined ? { settings: { stability: p.data.stability } } : {}),
      }),
    });
    if (!r.ok) {
      deps.state.chars -= chars;
      const detail = await r.text().catch(() => "");
      const quota = r.status === 401 && /quota|credit/i.test(detail);
      return { status: r.status === 429 || quota ? 429 : 502, json: { error: quota ? "quota" : "upstream", message: (quota ? "Se acabaron los créditos de ElevenLabs (o el límite de la clave)." : `ElevenLabs respondió ${r.status} al diálogo.`) + upstreamReason(detail) } };
    }
    const raw = (await r.json()) as {
      audio_base64?: string;
      voice_segments?: { start_time_seconds?: number; end_time_seconds?: number; dialogue_input_index?: number }[];
    };
    if (!raw.audio_base64) {
      deps.state.chars -= chars;
      return { status: 502, json: { error: "upstream", message: "ElevenLabs no devolvió audio del diálogo." } };
    }
    const segments: DialogueSegment[] = [];
    for (const v of raw.voice_segments ?? []) {
      if (typeof v.dialogue_input_index !== "number" || typeof v.start_time_seconds !== "number" || typeof v.end_time_seconds !== "number") continue;
      const cur = segments.find((x) => x.index === v.dialogue_input_index);
      if (cur) {
        cur.start = Math.min(cur.start, v.start_time_seconds);
        cur.end = Math.max(cur.end, v.end_time_seconds);
      } else segments.push({ index: v.dialogue_input_index, start: v.start_time_seconds, end: v.end_time_seconds });
    }
    return { status: 200, json: { audio: raw.audio_base64, segments } };
  } catch {
    deps.state.chars -= chars;
    return { status: 504, json: { error: "timeout", message: "ElevenLabs no respondió a tiempo." } };
  } finally {
    clearTimeout(timer);
  }
}

const DesignBody = z.object({
  description: z.string().min(20).max(1000),
  text: z.string().min(100).max(1000),
  model: z.enum(["eleven_ttv_v3", "eleven_multilingual_ttv_v2"]).optional(),
});

/** Casting: crea voces nuevas a partir de una descripción (ElevenLabs «voice design»). Devuelve 2–3 muestras. */
export async function handleVoiceDesign(body: unknown, ip: string, code: string | null, env: ElevenEnv, deps: { fetch: typeof fetch; now: () => number; state: ElevenState }): Promise<Res> {
  const g = gate(env, code);
  if (g) return g;
  const p = DesignBody.safeParse(body);
  if (!p.success) return { status: 400, json: { error: "bad_request", message: "Descripción (20–1000 caracteres) y frase de prueba (100–1000) obligatorias." } };
  const cfg = elevenConfig(env);
  const now = deps.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (deps.state.day !== today) {
    deps.state.day = today;
    deps.state.chars = 0;
  }
  const cost = p.data.text.length;
  if (deps.state.chars + cost > cfg.dailyChars) return { status: 429, json: { error: "daily_cap", message: "Tope diario alcanzado." } };
  const hits = (deps.state.perIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= cfg.ratePerIp) return { status: 429, json: { error: "rate_limited", message: "Demasiadas peticiones seguidas." } };
  hits.push(now);
  deps.state.perIp.set(ip, hits);
  deps.state.chars += cost;
  try {
    const r = await deps.fetch(`${ELEVEN_API}/v1/text-to-voice/design?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify({ voice_description: p.data.description, text: p.data.text, model_id: p.data.model ?? "eleven_ttv_v3" }),
    });
    if (!r.ok) {
      deps.state.chars -= cost;
      const detail = (await r.text().catch(() => "")).slice(0, 300);
      return { status: r.status === 429 ? 429 : 502, json: { error: "upstream", message: `ElevenLabs respondió ${r.status} al diseñar la voz (¿permiso de «Text to Voice» / voces en la clave?). ${detail}` } };
    }
    const raw = (await r.json()) as { previews?: { audio_base_64?: string; audio_base64?: string; generated_voice_id?: string; duration_secs?: number }[] };
    const previews = (raw.previews ?? [])
      .map((v) => ({ id: v.generated_voice_id ?? "", audio: v.audio_base_64 ?? v.audio_base64 ?? "" }))
      .filter((v) => /^[A-Za-z0-9_-]{4,80}$/.test(v.id) && v.audio);
    if (!previews.length) return { status: 502, json: { error: "upstream", message: "ElevenLabs no devolvió muestras." } };
    return { status: 200, json: { previews } };
  } catch {
    deps.state.chars -= cost;
    return { status: 504, json: { error: "timeout", message: "ElevenLabs no respondió a tiempo." } };
  }
}

const SaveVoiceBody = z.object({
  name: z.string().min(1).max(60),
  description: z.string().min(20).max(1000),
  generatedVoiceId: z.string().regex(/^[A-Za-z0-9_-]{4,80}$/),
});

/** Guarda en la cuenta la muestra elegida del casting y devuelve su voice_id. */
/** Semilla determinista (0…4 294 967 295) a partir del texto: ElevenLabs genera el mismo audio para la misma entrada. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export async function handleVoiceSave(body: unknown, code: string | null, env: ElevenEnv, deps: { fetch: typeof fetch }): Promise<Res> {
  const g = gate(env, code);
  if (g) return g;
  const p = SaveVoiceBody.safeParse(body);
  if (!p.success) return { status: 400, json: { error: "bad_request", message: "Datos de la voz no válidos." } };
  const r = await deps.fetch(`${ELEVEN_API}/v1/text-to-voice`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ voice_name: p.data.name, voice_description: p.data.description, generated_voice_id: p.data.generatedVoiceId }),
  });
  if (!r.ok) {
    const detail = (await r.text().catch(() => "")).slice(0, 300);
    return { status: 502, json: { error: "upstream", message: `ElevenLabs respondió ${r.status} al guardar la voz (¿hueco libre de voces en tu plan?). ${detail}` } };
  }
  const raw = (await r.json()) as { voice_id?: string; name?: string };
  if (!raw.voice_id || !/^[A-Za-z0-9]{8,40}$/.test(raw.voice_id)) return { status: 502, json: { error: "upstream", message: "ElevenLabs no devolvió el id de la voz." } };
  return { status: 200, json: { voiceId: raw.voice_id, name: raw.name ?? p.data.name } };
}

const SfxBody = z.object({
  text: z.string().min(2).max(300),
  duration: z.number().min(0.5).max(22).optional(),
});

/** Coste aproximado contado contra el tope diario por cada efecto generado. */
export const SFX_CHAR_COST = 200;

export async function handleSfx(body: unknown, ip: string, code: string | null, env: ElevenEnv, deps: { fetch: typeof fetch; now: () => number; state: ElevenState }): Promise<Res> {
  const g = gate(env, code);
  if (g) return g;
  const p = SfxBody.safeParse(body);
  if (!p.success) return { status: 400, json: { error: "bad_request", message: "Descripción de sonido no válida (2–300 caracteres, 0,5–22 s)." } };
  const cfg = elevenConfig(env);
  const now = deps.now();
  const hits = (deps.state.perIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= cfg.ratePerIp) return { status: 429, json: { error: "rate_limited", message: "Demasiadas peticiones seguidas." } };
  const today = new Date(now).toISOString().slice(0, 10);
  if (deps.state.day !== today) {
    deps.state.day = today;
    deps.state.chars = 0;
  }
  if (deps.state.chars + SFX_CHAR_COST > cfg.dailyChars) return { status: 429, json: { error: "daily_cap", message: "Tope diario alcanzado." } };
  hits.push(now);
  deps.state.perIp.set(ip, hits);
  deps.state.chars += SFX_CHAR_COST;
  try {
    const r = await deps.fetch(`${ELEVEN_API}/v1/sound-generation?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: p.data.text, duration_seconds: p.data.duration, prompt_influence: 0.5 }),
    });
    if (!r.ok) {
      deps.state.chars -= SFX_CHAR_COST;
      return { status: r.status === 429 ? 429 : 502, json: { error: "upstream", message: `ElevenLabs respondió ${r.status} (¿permiso «Efectos de sonido» en la clave?).` } };
    }
    return { status: 200, audio: await r.arrayBuffer() };
  } catch {
    deps.state.chars -= SFX_CHAR_COST;
    return { status: 504, json: { error: "timeout", message: "ElevenLabs no respondió." } };
  }
}
