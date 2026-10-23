"use client";
/** Carga y reproduce sonidos del catálogo (sintetizados o archivos de la biblioteca). */
import type { Catalog } from "@/lib/catalog/types";
import { findSound } from "@/lib/catalog";
import { envelope, normalizeLevel } from "@/lib/voice/dsp";
import { audioContext, playClip, type Clip } from "@/lib/voice/piper";
import { SR, synthSamples } from "./synth";

/** Volúmenes guardados en este dispositivo (ajustables en Ver; se aplican al reproducir y al exportar). */
function storedVolume(key: string, fallback: number) {
  return {
    get(): number {
      try {
        const raw = localStorage.getItem(key);
        const v = Number(raw);
        return raw !== null && Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : fallback;
      } catch {
        return fallback;
      }
    },
    set(v: number) {
      try {
        localStorage.setItem(key, String(v));
      } catch {
        /* sin almacenamiento */
      }
    },
  };
}
/** Ambiente de fondo (bucles «sfx_ambiente_*»); 1 = el del guion. Por defecto bajito: no debe tapar las voces. */
export const ambientVolume = storedVolume("pocket:ambientVolume2", 0.35);
/** Resto de efectos (golpes, «ding», whoosh…). */
export const effectsVolume = storedVolume("pocket:effectsVolume", 1);
export const mixVolume = (soundId: string, volume = 1) => volume * (soundId.startsWith("sfx_ambiente") ? ambientVolume.get() : effectsVolume.get());

const cache = new Map<string, Promise<Clip | null>>();

async function load(src: string): Promise<Clip | null> {
  if (src.startsWith("synth:")) {
    const s = synthSamples(src.slice(6));
    return s ? { samples: s, sampleRate: SR, env: new Float32Array(0), duration: s.length / SR } : null;
  }
  try {
    const buf = await (await fetch(src)).arrayBuffer();
    const a = await audioContext().decodeAudioData(buf);
    // los sonidos de la biblioteca llegan a volúmenes muy distintos (un ambiente generado puede salir casi mudo)
    const samples = normalizeLevel(new Float32Array(a.getChannelData(0)), a.sampleRate);
    return { samples, sampleRate: a.sampleRate, env: envelope(samples, a.sampleRate), duration: a.duration };
  } catch {
    return null;
  }
}

export function soundClip(catalog: Catalog, soundId: string): Promise<Clip | null> {
  const s = findSound(catalog, soundId);
  if (!s) return Promise.resolve(null);
  if (!cache.has(s.src)) cache.set(s.src, load(s.src));
  return cache.get(s.src)!;
}

/** Precarga todos los sonidos de un proyecto (antes de reproducir, para que suenen a tiempo). */
export async function preloadSounds(catalog: Catalog, soundIds: string[]) {
  await Promise.all([...new Set(soundIds)].map((id) => soundClip(catalog, id)));
}

/** Fundido de entrada de un sonido según lo largo que es (ambientes en bucle: medio segundo). */
export function fadeInFor(duration: number): number {
  return duration >= 15 ? 0.6 : 0.012;
}

/** maxDur: corta el sonido (con un fundido corto) al acabar su evento, p. ej. el ambiente en bucle al cambiar de escena. */
export async function playSound(catalog: Catalog, soundId: string, volume = 1, maxDur?: number): Promise<boolean> {
  const clip = await soundClip(catalog, soundId);
  if (!clip) return false;
  const ctx = audioContext();
  const g = ctx.createGain();
  // fundido de entrada: sin chasquido; los ambientes largos (que vuelven a empezar en cada toma) entran suaves
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(volume, ctx.currentTime + fadeInFor(clip.duration));
  g.connect(ctx.destination);
  const stop = playClip(clip, {}, g);
  if (maxDur !== undefined && maxDur < clip.duration - 0.05) {
    const end = ctx.currentTime + Math.max(0.05, maxDur);
    g.gain.setValueAtTime(volume, Math.max(ctx.currentTime, end - 0.25));
    g.gain.linearRampToValueAtTime(0, end);
    setTimeout(stop, Math.max(50, maxDur * 1000 + 50));
  }
  return true;
}
