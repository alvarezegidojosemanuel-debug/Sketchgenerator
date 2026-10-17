"use client";
/**
 * Exporta el proyecto a MP4 vertical 1080×1920 (H.264 + AAC) en el propio navegador, sin servidores:
 * dibuja cada fotograma (drawFrame), mezcla voces y sonidos (OfflineAudioContext) y lo codifica con
 * WebCodecs + mp4-muxer. Va más rápido que el tiempo real y el resultado es exacto fotograma a fotograma.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { Catalog } from "@/lib/catalog/types";
import type { PocketProject } from "@/lib/schema/pocket";
import { evaluateTake, projectSchedule } from "@/lib/timeline/evaluate";
import { projectImageUrls } from "@/lib/renderer/preload";
import { encodeWav, levelAt } from "@/lib/voice/dsp";
import { clipKey } from "@/lib/voice/fit";
import type { Clip } from "@/lib/voice/piper";
import { mixVolume, soundClip } from "@/lib/sfx/player";
import { drawFrame, H, W, type ImageMap } from "./draw";

export interface ExportProgress {
  stage: "imagenes" | "audio" | "video" | "listo";
  ratio: number;
}

const FPS = 30;
const SR = 48000;

export function exportSupported(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "AudioEncoder" in window && "VideoFrame" in window;
}

async function loadImages(urls: string[]): Promise<ImageMap> {
  const map: ImageMap = new Map();
  await Promise.all(
    urls.map(async (src) => {
      try {
        const blob = await (await fetch(src)).blob();
        map.set(src, await createImageBitmap(blob));
      } catch {
        // SVG (provisionales) y otros: vía <img>
        const img = await new Promise<HTMLImageElement | null>((resolve) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = src;
        });
        if (img) map.set(src, img);
      }
    }),
  );
  return map;
}

/** Mezcla voces (clips) y efectos en una pista estéreo a 48 kHz. */
async function mixAudio(project: PocketProject, catalog: Catalog, clips: Map<string, Clip> | null, total: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * SR)), SR);
  const { slots } = projectSchedule(project);
  const add = (clip: Clip, at: number, volume = 1, maxDur?: number) => {
    const buf = ctx.createBuffer(1, clip.samples.length, clip.sampleRate);
    buf.copyToChannel(new Float32Array(clip.samples), 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(ctx.destination);
    src.start(Math.max(0, at));
    if (maxDur !== undefined && maxDur < clip.duration - 0.05) {
      const end = Math.max(0, at) + Math.max(0.05, maxDur);
      g.gain.setValueAtTime(volume, Math.max(0, end - 0.25));
      g.gain.linearRampToValueAtTime(0, end);
      src.stop(end);
    }
  };
  for (const s of slots) {
    const take = project.takes[s.index];
    for (const e of take.events) {
      if (e.track === "dialogue") {
        const c = clips?.get(clipKey(take.id, e.id));
        if (c) add(c, s.offset + e.start);
      } else if (e.track === "sfx") {
        const c = await soundClip(catalog, e.soundId);
        if (c) add(c, s.offset + e.start, mixVolume(e.soundId, e.volume ?? 1), e.duration);
      }
    }
  }
  return ctx.startRendering();
}

/** H.264 primero (lo que piden redes sociales); si el navegador no lo tiene, VP9 dentro del MP4. */
async function pickVideoCodec(VW = W, VH = H, bitrate = 6_000_000): Promise<{ codec: string; mux: "avc" | "vp9" } | null> {
  const candidates: { codec: string; mux: "avc" | "vp9" }[] = [
    { codec: "avc1.640033", mux: "avc" },
    { codec: "avc1.640032", mux: "avc" },
    { codec: "avc1.4d0033", mux: "avc" },
    { codec: "avc1.42e033", mux: "avc" },
    { codec: "vp09.00.41.08", mux: "vp9" },
  ];
  for (const c of candidates) {
    const r = await VideoEncoder.isConfigSupported({ codec: c.codec, width: VW, height: VH, bitrate, framerate: FPS }).catch(() => null);
    if (r?.supported) return c;
  }
  return null;
}

/** Códec usado en la última exportación (para avisar si no es H.264). */
export let lastExportCodec: "avc" | "vp9" | null = null;
export let lastExportAudio: "aac" | "opus" | null = null;

export async function exportMp4(
  project: PocketProject,
  catalog: Catalog,
  clips: Map<string, Clip> | null,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
  /** «ligero»: 540×960 a ~1 Mbps (≈ 10 MB por minuto y medio) para compartir por WhatsApp o subir aquí. */
  quality: "alta" | "ligero" = "alta",
): Promise<Blob> {
  const k = quality === "ligero" ? 0.5 : 1;
  const VW = W * k;
  const VH = H * k;
  const BITRATE = quality === "ligero" ? 1_000_000 : 6_000_000;
  if (!exportSupported()) throw new Error("Este navegador no puede exportar vídeo. Usa Chrome (ordenador o Android) o Safari actualizado.");
  const { slots, total } = projectSchedule(project);

  onProgress({ stage: "imagenes", ratio: 0 });
  const images = await loadImages(projectImageUrls(project, catalog));

  onProgress({ stage: "audio", ratio: 0 });
  const audio = await mixAudio(project, catalog, clips, total);

  const picked = await pickVideoCodec(VW, VH, BITRATE);
  if (!picked) throw new Error("Este navegador no puede codificar vídeo 1080×1920. Prueba con Chrome.");
  const codec = picked.codec;
  lastExportCodec = picked.mux;
  // AAC primero (lo estándar); si el navegador no lo tiene, Opus dentro del MP4.
  let audioCfg: AudioEncoderConfig | null = null;
  let audioMux: "aac" | "opus" = "aac";
  for (const [codec, mux] of [["mp4a.40.2", "aac"], ["opus", "opus"]] as const) {
    const cfg = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: 160_000 };
    if ((await AudioEncoder.isConfigSupported(cfg).catch(() => null))?.supported) {
      audioCfg = cfg;
      audioMux = mux;
      break;
    }
  }
  const audioOk = audioCfg !== null;
  lastExportAudio = audioOk ? audioMux : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.mux, width: VW, height: VH, frameRate: FPS },
    ...(audioOk ? { audio: { codec: audioMux, sampleRate: SR, numberOfChannels: 2 } } : {}),
    fastStart: "in-memory",
  });
  let failure: unknown = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failure = e) });
  venc.configure({ codec, width: VW, height: VH, bitrate: BITRATE, framerate: FPS, ...(picked.mux === "avc" ? { avc: { format: "avc" as const } } : {}) });

  // --- audio (en bloques de 1024 muestras)
  if (audioOk) {
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failure = e) });
    aenc.configure(audioCfg!);
    const L = audio.getChannelData(0);
    const R = audio.getChannelData(1);
    const block = 1024;
    for (let i = 0; i < L.length; i += block) {
      const n = Math.min(block, L.length - i);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0);
      data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: "f32-planar", sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SR) * 1e6), data });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    aenc.close();
  }

  // --- vídeo
  const canvas = new OffscreenCanvas(VW, VH);
  const ctx = canvas.getContext("2d")!;
  const frames = Math.ceil(total * FPS);
  for (let i = 0; i < frames; i++) {
    if (signal?.aborted) throw new Error("Exportación cancelada.");
    if (failure) throw failure;
    const g = i / FPS;
    let slot = slots[slots.length - 1];
    for (const s of slots) if (g < s.offset + s.duration) { slot = s; break; }
    const take = project.takes[slot.index];
    const t = Math.min(take.duration, g - slot.offset);
    // boca según el volumen real de cada voz
    const levels = new Map<string, number>();
    if (clips) {
      for (const e of take.events) {
        if (e.track !== "dialogue") continue;
        const who = e.actorUid ?? (e.voiceOf ? `voice:${e.voiceOf}` : undefined);
        if (!who) continue;
        const c = clips.get(clipKey(take.id, e.id));
        if (c && t >= e.start && t < e.start + c.duration) levels.set(who, Math.max(levels.get(who) ?? 0, levelAt(c.env, t - e.start)));
      }
    }
    const frame = evaluateTake(take, catalog, t, clips ? { levels } : {});
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawFrame(ctx, catalog, frame, images);
    const vf = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(vf, { keyFrame: i % (FPS * 2) === 0 });
    vf.close();
    while (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
    if (i % 10 === 0) {
      onProgress({ stage: "video", ratio: i / frames });
      await new Promise((r) => setTimeout(r, 0)); // dejar respirar a la interfaz
    }
  }
  await venc.flush();
  venc.close();
  if (failure) throw failure;
  muxer.finalize();
  onProgress({ stage: "listo", ratio: 1 });
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}


/** Solo el audio del sketch (voces + efectos) en WAV mono 22 kHz: pesa poco y sirve para revisar las voces. */
export async function exportAudioWav(project: PocketProject, catalog: Catalog, clips: Map<string, Clip> | null): Promise<Blob> {
  const { total } = projectSchedule(project);
  const full = await mixAudio(project, catalog, clips, total);
  const SR2 = 22050;
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(full.duration * SR2)), SR2);
  const src = ctx.createBufferSource();
  src.buffer = full;
  src.connect(ctx.destination);
  src.start();
  const mono = await ctx.startRendering();
  return new Blob([encodeWav(mono.getChannelData(0), SR2)], { type: "audio/wav" });
}
