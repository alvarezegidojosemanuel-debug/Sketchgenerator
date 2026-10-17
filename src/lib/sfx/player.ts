"use client";
/** Carga y reproduce sonidos del catálogo (sintetizados o archivos de la biblioteca). */
import type { Catalog } from "@/lib/catalog/types";
import { findSound } from "@/lib/catalog";
import { envelope, normalizeLevel } from "@/lib/voice/dsp";
import { audioContext, playClip, type Clip } from "@/lib/voice/piper";
import { SR, synthSamples } from "./synth";

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

/** maxDur: corta el sonido (con un fundido corto) al acabar su evento, p. ej. el ambiente en bucle al cambiar de escena. */
export async function playSound(catalog: Catalog, soundId: string, volume = 1, maxDur?: number): Promise<boolean> {
  const clip = await soundClip(catalog, soundId);
  if (!clip) return false;
  const ctx = audioContext();
  const g = ctx.createGain();
  g.gain.value = volume;
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
