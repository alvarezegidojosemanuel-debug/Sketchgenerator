"use client";
/** Voces ElevenLabs (a través de /api/voice/*, con la clave solo en el servidor). */
import { clipCache } from "@/lib/storage/projects";
import type { PocketProject } from "@/lib/schema/pocket";
import { envelope, trimSilence } from "./dsp";
import { audioContext, type Clip, type LineRequest, type Progress } from "./piper";
import { stripAudioTags } from "./tags";

export type ElevenModel = "eleven_multilingual_v2" | "eleven_v3" | "eleven_flash_v2_5";
export type ElevenCastEntry = NonNullable<PocketProject["metadata"]["elevenVoices"]>[string];

export const ELEVEN_MODELS: { id: ElevenModel; label: string }[] = [
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
  get: (): ElevenModel => safe(() => (localStorage.getItem(MODEL_KEY) as ElevenModel) || "eleven_multilingual_v2", "eleven_multilingual_v2"),
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

async function decode(buf: ArrayBuffer): Promise<{ samples: Float32Array; sampleRate: number }> {
  const audio = await audioContext().decodeAudioData(buf.slice(0));
  const ch = audio.getChannelData(0);
  return { samples: trimSilence(new Float32Array(ch), audio.sampleRate), sampleRate: audio.sampleRate };
}

/** Genera (o recupera de la caché) las frases con ElevenLabs. Cada frase se paga una sola vez. */
export async function generateElevenLines(
  lines: LineRequest[],
  cast: Record<string, ElevenCastEntry> | undefined,
  code: string,
  model: ElevenModel,
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
    const ctx = model === "eleven_v3" ? {} : { previousText: prevL ? stripAudioTags(prevL).slice(0, 400) : undefined, nextText: nextL ? stripAudioTags(nextL).slice(0, 400) : undefined };
    const c = cast?.[l.characterId];
    if (!c) throw new Error(`Falta la voz ElevenLabs de «${l.characterId}» en el reparto.`);
    const text = model === "eleven_v3" ? l.text.trim() : stripAudioTags(l.text);
    const speed = Math.min(1.2, Math.max(0.7, c.speed * (l.rate ?? 1)));
    const ck = `el2|${model}|${c.voiceId}|${c.stability}|${c.similarity}|${c.style}|${speed.toFixed(2)}|${text}|${ctx.previousText ?? ""}|${ctx.nextText ?? ""}`;
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
    out.set(l.key, { ...hit, env: envelope(hit.samples, hit.sampleRate), duration: hit.samples.length / hit.sampleRate });
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
