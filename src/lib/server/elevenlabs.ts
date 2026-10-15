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
        voice_settings: { stability: settings.stability, similarity_boost: settings.similarity, style: settings.style, use_speaker_boost: true, speed: settings.speed },
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
          message: quota ? "Se acabaron los créditos de ElevenLabs de este mes (o el límite de la clave)." : `ElevenLabs respondió ${r.status}.`,
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
        ...(p.data.stability !== undefined ? { settings: { stability: p.data.stability } } : {}),
      }),
    });
    if (!r.ok) {
      deps.state.chars -= chars;
      const detail = await r.text().catch(() => "");
      const quota = r.status === 401 && /quota|credit/i.test(detail);
      return { status: r.status === 429 || quota ? 429 : 502, json: { error: quota ? "quota" : "upstream", message: quota ? "Se acabaron los créditos de ElevenLabs." : `ElevenLabs respondió ${r.status} al diálogo.` } };
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

const SfxBody = z.object({
  text: z.string().min(2).max(300),
  duration: z.number().min(0.5).max(10).optional(),
});

/** Coste aproximado contado contra el tope diario por cada efecto generado. */
export const SFX_CHAR_COST = 200;

export async function handleSfx(body: unknown, ip: string, code: string | null, env: ElevenEnv, deps: { fetch: typeof fetch; now: () => number; state: ElevenState }): Promise<Res> {
  const g = gate(env, code);
  if (g) return g;
  const p = SfxBody.safeParse(body);
  if (!p.success) return { status: 400, json: { error: "bad_request", message: "Descripción de sonido no válida (2–300 caracteres, 0,5–10 s)." } };
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
