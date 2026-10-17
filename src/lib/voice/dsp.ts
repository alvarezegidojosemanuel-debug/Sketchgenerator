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
/**
 * Quita el silencio de los extremos SIN comerse la cola de la voz: decide por energía (ventanas de 10 ms),
 * deja margen (30 ms delante, 180 ms detrás) y hace fundidos cortos para que no haya «clic» ni corte seco.
 */
export function trimSilence(samples: Float32Array, sampleRate: number, threshold = 0.006, startPad = 0.03, endPad = 0.18): Float32Array {
  const win = Math.max(1, Math.round(sampleRate * 0.01));
  const n = Math.ceil(samples.length / win);
  const rms = new Float32Array(n);
  for (let w = 0; w < n; w++) {
    let s = 0;
    const end = Math.min(samples.length, (w + 1) * win);
    for (let i = w * win; i < end; i++) s += samples[i] * samples[i];
    rms[w] = Math.sqrt(s / Math.max(1, end - w * win));
  }
  let a = 0;
  let b = n - 1;
  while (a < n && rms[a] < threshold) a++;
  while (b > a && rms[b] < threshold) b--;
  if (a >= n) return samples.slice();
  const i0 = Math.max(0, a * win - Math.round(startPad * sampleRate));
  const i1 = Math.min(samples.length, (b + 1) * win + Math.round(endPad * sampleRate));
  const out = samples.slice(i0, i1);
  const fin = Math.min(out.length, Math.round(sampleRate * 0.008));
  for (let i = 0; i < fin; i++) out[i] *= i / fin;
  const fout = Math.min(out.length, Math.round(sampleRate * 0.12));
  for (let i = 0; i < fout; i++) out[out.length - 1 - i] *= i / fout;
  return out;
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

/**
 * Iguala el volumen de cada frase (todas las voces al mismo nivel percibido) y la «mete» en la sala
 * con un eco muy corto y apagado, para que no suene pegada encima del escenario.
 * El nivel se mide solo en los tramos con voz (ventanas de 20 ms), así los silencios no engañan.
 */
export const VOICE_TARGET_RMS = 0.09; // ≈ −21 dBFS: deja hueco a efectos y ambiente
export function masterVoice(samples: Float32Array, sampleRate: number): Float32Array {
  if (!samples.length) return samples;
  const win = Math.max(1, Math.round(sampleRate * 0.02));
  const rms: number[] = [];
  for (let i = 0; i < samples.length; i += win) {
    let s = 0;
    const end = Math.min(samples.length, i + win);
    for (let j = i; j < end; j++) s += samples[j]! * samples[j]!;
    rms.push(Math.sqrt(s / (end - i)));
  }
  const loud = Math.max(...rms);
  const active = rms.filter((r) => r > Math.max(0.003, loud * 0.1));
  if (!active.length) return samples;
  const level = Math.sqrt(active.reduce((a, r) => a + r * r, 0) / active.length);
  const gain = VOICE_TARGET_RMS / level;
  // Sala: dos reflexiones tempranas suavizadas (paso bajo de un polo) a −22 y −26 dB.
  const taps: [number, number][] = [[0.019, 0.08], [0.031, 0.05]];
  const out = new Float32Array(samples.length);
  const a = 0.35; // suavizado de las reflexiones (suenan «más lejos»)
  let lp = 0;
  for (let i = 0; i < samples.length; i++) {
    let wet = 0;
    for (const [d, g] of taps) wet += (samples[i - Math.round(d * sampleRate)] ?? 0) * g;
    lp += a * (wet - lp);
    out[i] = (samples[i]! + lp) * gain;
  }
  // Limitador suave: los gritos no saturan ni destacan tanto sobre el resto.
  for (let i = 0; i < out.length; i++) {
    const x = out[i]!;
    const ax = Math.abs(x);
    if (ax > 0.5) out[i] = Math.sign(x) * (0.5 + (0.45 * (ax - 0.5)) / (0.45 + (ax - 0.5)));
  }
  return out;
}

/** Lleva un sonido a un nivel estándar (medido en los tramos que suenan) sin pasar de 0,95 de pico. */
export function normalizeLevel(samples: Float32Array, sampleRate: number, targetRms = 0.12): Float32Array {
  const win = Math.max(1, Math.round(sampleRate * 0.05));
  const rms: number[] = [];
  let peak = 0;
  for (let i = 0; i < samples.length; i += win) {
    let s = 0;
    const end = Math.min(samples.length, i + win);
    for (let j = i; j < end; j++) {
      s += samples[j]! * samples[j]!;
      peak = Math.max(peak, Math.abs(samples[j]!));
    }
    rms.push(Math.sqrt(s / (end - i)));
  }
  if (peak < 1e-5) return samples;
  const loud = Math.max(...rms);
  const active = rms.filter((r) => r > loud * 0.1);
  const level = Math.sqrt(active.reduce((a, r) => a + r * r, 0) / Math.max(1, active.length));
  const gain = Math.min(targetRms / Math.max(level, 1e-6), 0.95 / peak, 200);
  return samples.map((x) => x * gain);
}
