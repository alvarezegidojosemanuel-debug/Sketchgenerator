"use client";
/**
 * Motor de voz Piper en el navegador (gratis, sin claves, sin servidor).
 * - onnxruntime-web y el fonemizador (espeak-ng compilado a WASM) se cargan desde CDN.
 * - Los modelos de voz se descargan una vez de HuggingFace y quedan en la caché del navegador.
 * - Cada frase generada se guarda en IndexedDB: reproducir o editar no vuelve a sintetizar.
 */
import { castFor, findPiperVoice, PIPER_BASE, type CastEntry } from "./catalog";
import { envelope, resample, trimSilence } from "./dsp";
import { clipCache } from "@/lib/storage/projects";
import { stripAudioTags } from "./tags";

const ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/";
const PHON = "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";
const MODEL_CACHE = "pocket-piper-models-v1";

export interface Clip {
  samples: Float32Array;
  sampleRate: number;
  env: Float32Array;
  duration: number;
}

export interface Progress {
  stage: "runtime" | "model" | "generate";
  label: string;
  /** 0..1 */
  ratio: number;
}

type OrtNs = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  InferenceSession: { create(buf: ArrayBuffer): Promise<{ run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>> }> };
  Tensor: new (type: string, data: unknown, dims?: number[]) => unknown;
};
type PiperConfig = { audio: { sample_rate: number }; espeak: { voice: string }; inference: { noise_scale: number; length_scale: number; noise_w: number } };

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => res();
        s.onerror = () => rej(new Error(`No se pudo cargar ${src}`));
        document.head.appendChild(s);
      }),
    );
  }
  return scripts.get(src)!;
}

async function ort(): Promise<OrtNs> {
  await loadScript(ORT + "ort.min.js");
  const o = (window as unknown as { ort: OrtNs }).ort;
  o.env.wasm.wasmPaths = ORT;
  o.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1);
  return o;
}

async function fetchCached(url: string, onProgress?: (r: number) => void): Promise<ArrayBuffer> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(url);
    if (hit) return hit.arrayBuffer();
  } catch {
    /* sin Cache Storage (modo privado): se descarga cada vez */
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Descarga fallida (${res.status}): ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress?.(got / total);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  try {
    await cache?.put(url, new Response(buf.slice().buffer, { headers: { "content-type": "application/octet-stream" } }));
  } catch {
    /* cuota llena: se usará igualmente esta vez */
  }
  return buf.buffer;
}

interface Loaded {
  cfg: PiperConfig;
  session: Awaited<ReturnType<OrtNs["InferenceSession"]["create"]>>;
}
const models = new Map<string, Promise<Loaded>>();

function loadVoice(voiceId: string, onProgress?: (p: Progress) => void): Promise<Loaded> {
  if (!models.has(voiceId)) {
    const v = findPiperVoice(voiceId);
    if (!v) return Promise.reject(new Error(`Voz desconocida: ${voiceId}`));
    const p = (async () => {
      onProgress?.({ stage: "runtime", label: "Preparando el motor de voz…", ratio: 0 });
      const o = await ort();
      const cfg = JSON.parse(new TextDecoder().decode(await fetchCached(`${PIPER_BASE}/${v.path}.onnx.json`))) as PiperConfig;
      const model = await fetchCached(`${PIPER_BASE}/${v.path}.onnx`, (r) =>
        onProgress?.({ stage: "model", label: `Descargando voz «${v.label}» (${v.sizeMB} MB, solo la primera vez)`, ratio: r }),
      );
      const session = await o.InferenceSession.create(model);
      return { cfg, session };
    })();
    p.catch(() => models.delete(voiceId));
    models.set(voiceId, p);
  }
  return models.get(voiceId)!;
}

/** Texto → fonemas (varias frases en una sola pasada del fonemizador). */
async function phonemize(texts: string[], espeakVoice: string): Promise<number[][]> {
  await loadScript(PHON + ".js");
  const create = (window as unknown as { createPiperPhonemize: (m: Record<string, unknown>) => Promise<{ callMain(a: string[]): void }> }).createPiperPhonemize;
  const out: number[][] = [];
  await new Promise<void>(async (resolve, reject) => {
    const mod = await create({
      print: (line: string) => {
        try {
          out.push(JSON.parse(line).phoneme_ids);
          if (out.length === texts.length) resolve();
        } catch (e) {
          reject(e);
        }
      },
      printErr: () => {},
      locateFile: (f: string) => (f.endsWith(".wasm") ? `${PHON}.wasm` : f.endsWith(".data") ? `${PHON}.data` : f),
    });
    mod.callMain(["-l", espeakVoice, "--input", JSON.stringify(texts.map((text) => ({ text }))), "--espeak_data", "/espeak-ng-data"]);
  });
  return out;
}

const clipKeyOf = (text: string, c: CastEntry, rate: number) => `${c.voiceId}|${c.speaker ?? ""}|${c.pitch.toFixed(3)}|${(c.speed * rate).toFixed(3)}|${text.trim()}`;

export interface LineRequest {
  key: string;
  text: string;
  characterId: string;
  /** Multiplicador de velocidad del evento (voice.rate). */
  rate?: number;
}

/**
 * Genera (o recupera de la caché) el audio de varias frases. Agrupa por voz para cargar
 * cada modelo una vez y fonemizar en bloque.
 */
export async function generateLines(lines: LineRequest[], cast: Record<string, CastEntry> | undefined, onProgress?: (p: Progress) => void): Promise<Map<string, Clip>> {
  const result = new Map<string, Clip>();
  const todo: { req: LineRequest; c: CastEntry; ck: string }[] = [];
  for (let req of lines) {
    const c = castFor(req.characterId, cast);
    req = { ...req, text: stripAudioTags(req.text) };
    const ck = clipKeyOf(req.text, c, req.rate ?? 1);
    const hit = await clipCache.get(ck).catch(() => undefined);
    if (hit) result.set(req.key, { ...hit, env: envelope(hit.samples, hit.sampleRate), duration: hit.samples.length / hit.sampleRate });
    else todo.push({ req, c, ck });
  }
  const byVoice = new Map<string, typeof todo>();
  for (const t of todo) byVoice.set(t.c.voiceId, [...(byVoice.get(t.c.voiceId) ?? []), t]);
  let done = 0;
  for (const [voiceId, items] of byVoice) {
    const { cfg, session } = await loadVoice(voiceId, onProgress);
    const o = await ort();
    const ids = await phonemize(items.map((i) => i.req.text.trim()), cfg.espeak.voice);
    for (let k = 0; k < items.length; k++) {
      const { req, c, ck } = items[k];
      onProgress?.({ stage: "generate", label: `Generando voces ${done + 1}/${todo.length}`, ratio: done / Math.max(1, todo.length) });
      const pitch = Math.min(1.4, Math.max(0.7, c.pitch));
      const speed = Math.min(1.6, Math.max(0.6, c.speed * (req.rate ?? 1)));
      // tono sin cambiar velocidad: se sintetiza más lento (× pitch) y se remuestrea (÷ pitch)
      const lengthScale = (cfg.inference.length_scale * pitch) / speed;
      const ph = ids[k];
      const feeds: Record<string, unknown> = {
        input: new o.Tensor("int64", BigInt64Array.from(ph.map(BigInt)), [1, ph.length]),
        input_lengths: new o.Tensor("int64", BigInt64Array.from([BigInt(ph.length)])),
        scales: new o.Tensor("float32", Float32Array.from([cfg.inference.noise_scale, lengthScale, cfg.inference.noise_w])),
      };
      if (c.speaker !== undefined) feeds.sid = new o.Tensor("int64", BigInt64Array.from([BigInt(c.speaker)]));
      const out = await session.run(feeds);
      const sr = cfg.audio.sample_rate;
      const samples = trimSilence(resample(out.output.data, pitch), sr);
      await clipCache.put(ck, { samples, sampleRate: sr }).catch(() => {});
      result.set(req.key, { samples, sampleRate: sr, env: envelope(samples, sr), duration: samples.length / sr });
      done++;
    }
  }
  onProgress?.({ stage: "generate", label: "Voces listas", ratio: 1 });
  return result;
}

/* ---------- reproducción con Web Audio (tiempo exacto) ---------- */
let ctx: AudioContext | null = null;
export function audioContext(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

/** Debe llamarse desde un toque/clic (los navegadores bloquean el audio hasta entonces). */
export async function unlockAudio() {
  const c = audioContext();
  if (c.state !== "running") await c.resume().catch(() => {});
}

const playing = new Set<AudioBufferSourceNode>();

export function playClip(clip: Clip, handlers: { onStart?: () => void; onEnd?: () => void } = {}, destination?: AudioNode): () => void {
  const c = audioContext();
  const buf = c.createBuffer(1, clip.samples.length, clip.sampleRate);
  buf.copyToChannel(new Float32Array(clip.samples), 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(destination ?? c.destination);
  let ended = false;
  src.onended = () => {
    if (ended) return;
    ended = true;
    playing.delete(src);
    handlers.onEnd?.();
  };
  playing.add(src);
  src.start();
  handlers.onStart?.();
  return () => {
    try {
      src.stop();
    } catch {
      /* ya parado */
    }
  };
}

export function stopAllClips() {
  for (const s of [...playing]) {
    try {
      s.stop();
    } catch {
      /* ya parado */
    }
  }
  playing.clear();
}

export async function previewVoice(text: string, characterId: string, cast: Record<string, CastEntry> | undefined, onProgress?: (p: Progress) => void) {
  await unlockAudio();
  const clips = await generateLines([{ key: "preview", text, characterId }], cast, onProgress);
  stopAllClips();
  const clip = clips.get("preview");
  if (clip) playClip(clip);
}
