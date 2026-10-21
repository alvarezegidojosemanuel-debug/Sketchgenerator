"use client";
/** Voces ElevenLabs (a través de /api/voice/*, con la clave solo en el servidor). */
import { clipCache } from "@/lib/storage/projects";
import type { PocketProject } from "@/lib/schema/pocket";
import { dropEdgeBlobs, envelope, masterVoice, timeStretch, trimSilence } from "./dsp";
import { audioContext, type Clip, type LineRequest, type Progress } from "./piper";
import { stripAudioTags } from "./tags";

export type ElevenModel = "eleven_multilingual_v2" | "eleven_v3" | "eleven_flash_v2_5" | "dialogue_v3";
export type ElevenCastEntry = NonNullable<PocketProject["metadata"]["elevenVoices"]>[string];

export const ELEVEN_MODELS: { id: ElevenModel; label: string }[] = [
  { id: "dialogue_v3", label: "Conversación v3 (la más fluida: cada escena de una vez)" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 (natural, estable)" },
  { id: "eleven_v3", label: "v3 (más expresiva; entiende [laughs], [sighs]…)" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5 (rápida, gasta la mitad)" },
];

export interface ElevenVoice {
  id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview: string;
}

const CODE_KEY = "pocket:accessCode";
const MODEL_KEY = "pocket:elevenModel";
const safe = <T,>(f: () => T, d: T) => {
  try {
    return f();
  } catch {
    return d;
  }
};
export const accessCode = {
  get: () => safe(() => localStorage.getItem(CODE_KEY) ?? "", ""),
  set: (v: string) => safe(() => localStorage.setItem(CODE_KEY, v), undefined),
};
export const elevenModel = {
  get: (): ElevenModel => safe(() => (localStorage.getItem(MODEL_KEY) as ElevenModel) || "dialogue_v3", "dialogue_v3"),
  set: (v: ElevenModel) => safe(() => localStorage.setItem(MODEL_KEY, v), undefined),
};

export async function elevenStatus(): Promise<{ enabled: boolean; hasKey: boolean; hasCode: boolean; dailyChars: number; usedToday: number } | null> {
  try {
    const r = await fetch("/api/voice/tts", { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function listElevenVoices(code: string): Promise<ElevenVoice[]> {
  const r = await fetch("/api/voice/voices", { headers: { "x-pocket-code": code }, cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message ?? `Error ${r.status}`);
  return j.voices as ElevenVoice[];
}

/** Ajustes naturales: más estabilidad y poco «estilo» (el estilo alto suena teatral, como un anuncio). */
export const DEFAULT_ELEVEN = { stability: 0.5, similarity: 0.8, style: 0.1, speed: 1 };

/** Voz con acento de España según sus etiquetas (castellano, peninsular, Madrid, andaluz…). */
export function isSpainVoice(v: ElevenVoice): boolean {
  const t = `${v.labels.accent ?? ""} ${v.labels.language ?? ""} ${v.labels.description ?? ""} ${v.name}`;
  return /spain|españa|castil|peninsul|iberian|european spanish|madri|andalu|catal|galleg|canari|vasco/i.test(t);
}

/** Primero las voces de España, luego el resto. */
export function sortForSpain(voices: ElevenVoice[]): ElevenVoice[] {
  return [...voices].sort((a, b) => Number(isSpainVoice(b)) - Number(isSpainVoice(a)) || a.name.localeCompare(b.name));
}

/** Reparto automático: voz distinta por personaje según el género de la etiqueta (Sister → mujer). */
export function autoCast(voices: ElevenVoice[], characterIds: string[]): Record<string, ElevenCastEntry> {
  voices = sortForSpain(voices).filter((v, _i, all) => !all.some(isSpainVoice) || isSpainVoice(v));
  const female = voices.filter((v) => /female|mujer/i.test(v.labels.gender ?? ""));
  const male = voices.filter((v) => !/female|mujer/i.test(v.labels.gender ?? ""));
  const out: Record<string, ElevenCastEntry> = {};
  let m = 0;
  let f = 0;
  for (const c of characterIds) {
    const pool = c === "sister" ? (female.length ? female : voices) : male.length ? male : voices;
    const v = pool[(c === "sister" ? f++ : m++) % pool.length];
    if (v) out[c] = { voiceId: v.id, name: v.name, ...DEFAULT_ELEVEN };
  }
  return out;
}

/** Los «ah» que mete ElevenLabs aparecen entre frases seguidas del MISMO personaje: solo ahí se quitan. */
function sameNeighbours(group: { characterId: string }[], i: number) {
  return { head: group[i - 1]?.characterId === group[i].characterId, tail: group[i + 1]?.characterId === group[i].characterId };
}

async function decode(buf: ArrayBuffer): Promise<{ samples: Float32Array; sampleRate: number }> {
  const audio = await audioContext().decodeAudioData(buf.slice(0));
  const ch = audio.getChannelData(0);
  return { samples: trimSilence(new Float32Array(ch), audio.sampleRate), sampleRate: audio.sampleRate };
}

/**
 * Modo conversación: cada escena se genera de UNA vez con todas sus voces (ElevenLabs «text to dialogue», v3),
 * así las frases se responden con naturalidad; luego se corta en una pieza por frase usando los tiempos
 * que devuelve ElevenLabs, para que boca, bocadillos y ritmo sigan funcionando igual.
 */
export async function generateElevenDialogue(
  lines: LineRequest[],
  cast: Record<string, ElevenCastEntry> | undefined,
  code: string,
  onProgress?: (p: Progress) => void,
): Promise<Map<string, Clip>> {
  const out = new Map<string, Clip>();
  const groups = new Map<string, LineRequest[]>();
  for (const l of lines) {
    const take = l.key.slice(0, l.key.indexOf(":"));
    if (!groups.has(take)) groups.set(take, []);
    groups.get(take)!.push(l);
  }
  let g = 0;
  for (const [, group] of groups) {
    g++;
    const inputs = group.map((l) => {
      const c = cast?.[l.characterId];
      if (!c) throw new Error(`Falta la voz ElevenLabs de «${l.characterId}» en el reparto.`);
      return { text: withTag(l.text.trim(), c), voiceId: c.voiceId };
    });
    const stab = group.reduce((s, l) => s + (cast?.[l.characterId]?.stability ?? 0.5), 0) / group.length;
    const stability = stab < 0.34 ? 0 : stab < 0.67 ? 0.5 : 1; // v3: creativo / natural / robusto
    const base = `dlg3|${stability}|${JSON.stringify(inputs)}`;
    const cached = await Promise.all(group.map((_, i) => clipCache.get(`${base}|${i}`).catch(() => undefined)));
    if (cached.every(Boolean)) {
      group.forEach((l, i) => { const c = cached[i]!; out.set(l.key, toClip(shape({ samples: dropEdgeBlobs(trimSilence(c.samples, c.sampleRate, 0.006, 0.02, 0.1), c.sampleRate, 0.012, 0.07, 0.18, sameNeighbours(group, i)), sampleRate: c.sampleRate }, cast?.[l.characterId], l.characterId))); });
      continue;
    }
    onProgress?.({ stage: "generate", label: `Conversación: escena ${g}/${groups.size}`, ratio: (g - 1) / groups.size });
    const r = await fetch("/api/voice/dialogue", {
      method: "POST",
      headers: { "content-type": "application/json", "x-pocket-code": code },
      body: JSON.stringify({ inputs, stability }),
    });
    const j = (await r.json().catch(() => ({}))) as { audio?: string; segments?: { index: number; start: number; end: number }[]; message?: string };
    if (!r.ok || !j.audio) throw new Error(j.message ?? `Error ${r.status} en el diálogo`);
    const bin = Uint8Array.from(atob(j.audio), (c) => c.charCodeAt(0));
    const audio = await audioContext().decodeAudioData(bin.buffer.slice(0));
    const all = new Float32Array(audio.getChannelData(0));
    const sr = audio.sampleRate;
    const segs = [...(j.segments ?? [])].sort((a, b) => a.start - b.start);
    for (let i = 0; i < group.length; i++) {
      const seg = segs.find((x) => x.index === i);
      let piece: { samples: Float32Array; sampleRate: number };
      if (seg) {
        const next = segs.find((x) => x.start > seg.start + 1e-3);
        const a = Math.max(0, Math.floor((seg.start - 0.04) * sr));
        // los tiempos de ElevenLabs a veces acaban antes de la última palabra: se coge hasta que empieza la
        // frase siguiente (los silencios y los «ah» sueltos del final se quitan después)
        const endT = next ? Math.max(seg.end + 0.05, next.start - 0.03) : seg.end + 0.6;
        const b = Math.min(all.length, Math.ceil(endT * sr));
        const samples = all.slice(a, Math.max(a + 1, b));
        const fin = Math.min(samples.length, Math.round(sr * 0.006));
        for (let k = 0; k < fin; k++) samples[k] *= k / fin;
        const fout = Math.min(samples.length, Math.round(sr * 0.06));
        for (let k = 0; k < fout; k++) samples[samples.length - 1 - k] *= k / fout;
        piece = { samples, sampleRate: sr };
      } else {
        // ElevenLabs no devolvió tiempos para esta frase: se genera sola (v3)
        const single = await generateElevenLines([group[i]], cast, code, "eleven_v3");
        const c = single.get(group[i].key)!;
        piece = { samples: c.samples, sampleRate: c.sampleRate };
      }
      await clipCache.put(`${base}|${i}`, piece).catch(() => {});
      // en modo conversación ElevenLabs deja pausas entre frases: se recortan (el ritmo lo marca el guion)
      const tight = { samples: dropEdgeBlobs(trimSilence(piece.samples, piece.sampleRate, 0.006, 0.02, 0.1), piece.sampleRate, 0.012, 0.07, 0.18, sameNeighbours(group, i)), sampleRate: piece.sampleRate };
      out.set(group[i].key, toClip(shape(tight, cast?.[group[i].characterId], group[i].characterId)));
    }
  }
  onProgress?.({ stage: "generate", label: "Voces listas", ratio: 1 });
  return out;
}

/** Tono por defecto de cada personaje si no se ha tocado el ajuste (Usu nervioso; Reynaldo menos formal). */
export const DEFAULT_PITCH: Record<string, number> = { usu: 1.18 };
export const pitchOf = (cid: string, c?: { pitch?: number }) => c?.pitch ?? DEFAULT_PITCH[cid] ?? 1;
/** Ritmo por defecto: algo más ágil que lo que sale de ElevenLabs (cuyo tope de velocidad es 1,2). */
export const DEFAULT_TEMPO = 1.15;
export const tempoOf = (c?: { tempo?: number }) => c?.tempo ?? DEFAULT_TEMPO;
/** Tono y ritmo propios del personaje, aplicados en la app (no gastan créditos). */
const shape = (p: { samples: Float32Array; sampleRate: number }, c?: { pitch?: number; tempo?: number }, cid = "") => {
  const q = shiftPitch(p, pitchOf(cid, c));
  return { samples: timeStretch(q.samples, q.sampleRate, tempoOf(c)), sampleRate: q.sampleRate };
};

/** Sube o baja el tono (y el ritmo) remuestreando: 1.1 = 10 % más agudo y más rápido. */
export function shiftPitch(p: { samples: Float32Array; sampleRate: number }, k: number | undefined): { samples: Float32Array; sampleRate: number } {
  if (!k || Math.abs(k - 1) < 0.005) return p;
  const n = Math.max(1, Math.floor(p.samples.length / k));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * k;
    const i0 = Math.floor(x);
    const f = x - i0;
    out[i] = (p.samples[i0] ?? 0) * (1 - f) + (p.samples[i0 + 1] ?? 0) * f;
  }
  return { samples: out, sampleRate: p.sampleRate };
}

/** Aplica la acotación propia del personaje (si la tiene) en lugar de la automática del principio de la frase. */
export function withTag(text: string, c?: { tag?: string }): string {
  const t = c?.tag?.trim().replace(/[[\]]/g, "");
  if (!t) return text;
  return `[${t}] ${text.replace(/^\s*\[[^\]]*\]\s*/, "")}`;
}

function toClip(p: { samples: Float32Array; sampleRate: number }): Clip {
  const samples = masterVoice(p.samples, p.sampleRate);
  return { samples, sampleRate: p.sampleRate, env: envelope(samples, p.sampleRate), duration: samples.length / p.sampleRate };
}

/** Genera (o recupera de la caché) las frases con ElevenLabs. Cada frase se paga una sola vez. */
export async function generateElevenLines(
  lines: LineRequest[],
  cast: Record<string, ElevenCastEntry> | undefined,
  code: string,
  globalModel: ElevenModel,
  onProgress?: (p: Progress) => void,
): Promise<Map<string, Clip>> {
  const out = new Map<string, Clip>();
  let i = 0;
  for (const l of lines) {
    i++;
    // contexto: frase anterior y siguiente de la misma toma, para que la entonación encadene
    const take = l.key.slice(0, l.key.indexOf(":"));
    const prevL = lines[i - 2]?.key.startsWith(take + ":") ? lines[i - 2].text : undefined;
    const nextL = lines[i]?.key.startsWith(take + ":") ? lines[i].text : undefined;
    const c = cast?.[l.characterId];
    if (!c) throw new Error(`Falta la voz ElevenLabs de «${l.characterId}» en el reparto.`);
    const model = c.model ?? (globalModel === "dialogue_v3" ? "eleven_v3" : globalModel);
    const ctx: { previousText?: string; nextText?: string } =
      model === "eleven_v3" ? {} : { previousText: prevL ? stripAudioTags(prevL).slice(0, 400) : undefined, nextText: nextL ? stripAudioTags(nextL).slice(0, 400) : undefined };
    const text = model === "eleven_v3" ? withTag(l.text.trim(), c) : stripAudioTags(l.text);
    const speed = Math.min(1.2, Math.max(0.7, c.speed * (l.rate ?? 1)));
    const ck = `el3|${model}|${c.voiceId}|${c.stability}|${c.similarity}|${c.style}|${speed.toFixed(2)}|${text}|${ctx.previousText ?? ""}|${ctx.nextText ?? ""}`;
    let hit = await clipCache.get(ck).catch(() => undefined);
    if (!hit) {
      onProgress?.({ stage: "generate", label: `ElevenLabs: frase ${i}/${lines.length}`, ratio: (i - 1) / lines.length });
      const r = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json", "x-pocket-code": code },
        body: JSON.stringify({ text, voiceId: c.voiceId, model, settings: { stability: c.stability, similarity: c.similarity, style: c.style, speed }, ...ctx }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message ?? `Error ${r.status}`);
      }
      hit = await decode(await r.arrayBuffer());
      await clipCache.put(ck, hit).catch(() => {});
    }
    out.set(l.key, toClip(shape(hit, c, l.characterId)));
  }
  onProgress?.({ stage: "generate", label: "Voces listas", ratio: 1 });
  return out;
}

/** Escucha la muestra gratuita de una voz (no gasta créditos). */
let previewAudio: HTMLAudioElement | null = null;
export function playVoicePreview(url: string) {
  previewAudio?.pause();
  if (!url) return;
  previewAudio = new Audio(url);
  void previewAudio.play().catch(() => {});
}
