/** Procesado de audio puro (sin navegador): cambio de tono, envolvente para la boca, WAV. */

/**
 * Sube/baja el tono por `factor` remuestreando. Para conservar la duración, la voz se
 * genera antes con velocidad / factor (la síntesis es más lenta y al remuestrear vuelve a su ritmo).
 */
export function resample(input: Float32Array, factor: number): Float32Array {
  if (Math.abs(factor - 1) < 1e-3) return input;
  const n = Math.max(1, Math.floor(input.length / factor));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * factor;
    const i0 = Math.floor(x);
    const f = x - i0;
    const a = input[i0] ?? 0;
    const b = input[i0 + 1] ?? a;
    out[i] = a + (b - a) * f;
  }
  return out;
}

/** Fotogramas de la envolvente por segundo (60 = un valor por fotograma de vídeo). */
export const ENVELOPE_FPS = 60;

/**
 * Volumen de la voz a lo largo del tiempo (RMS por ventana), normalizado 0..1 con el
 * percentil 95 para que gritos puntuales no aplasten el resto. Es lo que mueve la boca.
 */
export function envelope(samples: Float32Array, sampleRate: number, fps = ENVELOPE_FPS): Float32Array {
  const win = Math.max(1, Math.round(sampleRate / fps));
  const n = Math.ceil(samples.length / win);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const end = Math.min(samples.length, (i + 1) * win);
    for (let j = i * win; j < end; j++) s += samples[j] * samples[j];
    env[i] = Math.sqrt(s / Math.max(1, end - i * win));
  }
  const sorted = [...env].sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
  // suavizado corto (ataque rápido, caída suave) para que la boca no tiemble
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.min(1, env[i] / ref);
    prev = v > prev ? v : prev * 0.6 + v * 0.4;
    env[i] = prev;
  }
  return env;
}

export function levelAt(env: Float32Array, seconds: number, fps = ENVELOPE_FPS): number {
  const i = Math.floor(seconds * fps);
  return i >= 0 && i < env.length ? env[i] : 0;
}

/** Recorta silencios al principio y al final (deja un margen pequeño). */
export function trimSilence(samples: Float32Array, sampleRate: number, threshold = 0.01, padSeconds = 0.05): Float32Array {
  let a = 0;
  let b = samples.length - 1;
  while (a < samples.length && Math.abs(samples[a]) < threshold) a++;
  while (b > a && Math.abs(samples[b]) < threshold) b--;
  const pad = Math.round(padSeconds * sampleRate);
  return samples.slice(Math.max(0, a - pad), Math.min(samples.length, b + pad));
}

export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}
