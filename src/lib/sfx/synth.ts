/**
 * Sonidos incluidos, sintetizados en el propio dispositivo (sin archivos ni licencias de terceros).
 * Funciones puras: devuelven muestras mono a SR Hz.
 */
import type { Sound } from "@/lib/catalog/types";

export const SR = 44100;
type Gen = () => Float32Array;

const len = (s: number) => Math.round(s * SR);
const env = (i: number, n: number, a = 0.01, r = 0.05) => {
  const t = i / SR;
  const T = n / SR;
  return Math.min(1, t / a, (T - t) / r);
};

/** Móvil sonando: trinos de dos tonos, dos tandas. */
const telefono: Gen = () => {
  const n = len(2.6);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const on = t % 1.3 < 0.9;
    if (!on) continue;
    const f = Math.floor(t * 18) % 2 ? 1320 : 1660;
    out[i] = 0.32 * Math.sin(2 * Math.PI * f * t) * Math.min(1, (t % 1.3) / 0.01, (0.9 - (t % 1.3)) / 0.02);
  }
  return out;
};

/** Alarma / sirena: barrido grave-agudo repetido. */
const alarma: Gen = () => {
  const n = len(3);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const sweep = (t % 0.6) / 0.6;
    const f = 650 + 650 * sweep;
    ph += (2 * Math.PI * f) / SR;
    const tri = (2 / Math.PI) * Math.asin(Math.sin(ph));
    out[i] = 0.3 * tri * env(i, n, 0.02, 0.1);
  }
  return out;
};

/** Pop de aparición. */
const pop: Gen = () => {
  const n = len(0.16);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    ph += (2 * Math.PI * (950 - 750 * p)) / SR;
    out[i] = 0.55 * Math.sin(ph) * Math.pow(1 - p, 2);
  }
  return out;
};

/** Ruido filtrado con envolvente (whoosh). */
const whoosh: Gen = () => {
  const n = len(0.7);
  const out = new Float32Array(n);
  let lp = 0;
  let seed = 12345;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = seed / 0x7fffffff - 0.5;
    const p = i / n;
    const k = 0.04 + 0.25 * Math.sin(Math.PI * p);
    lp += k * (noise - lp);
    out[i] = 1.6 * lp * Math.sin(Math.PI * p);
  }
  return out;
};

/** Campanita (idea / notificación). */
const ding: Gen = () => {
  const n = len(1.2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const d = Math.exp(-t * 4);
    out[i] = 0.35 * d * (Math.sin(2 * Math.PI * 1320 * t) + 0.4 * Math.sin(2 * Math.PI * 2640 * t) + 0.2 * Math.sin(2 * Math.PI * 3960 * t)) * Math.min(1, t / 0.003);
  }
  return out;
};

/** Boing de dibujo animado. */
const boing: Gen = () => {
  const n = len(0.8);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 180 + 120 * Math.exp(-t * 3) * Math.sin(2 * Math.PI * 9 * t) + 60 * (1 - t);
    ph += (2 * Math.PI * f) / SR;
    out[i] = 0.45 * Math.sin(ph) * Math.exp(-t * 3.2) * Math.min(1, t / 0.005);
  }
  return out;
};

/** Golpe seco. */
const golpe: Gen = () => {
  const n = len(0.35);
  const out = new Float32Array(n);
  let ph = 0;
  let seed = 777;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    ph += (2 * Math.PI * (120 * Math.exp(-t * 8) + 50)) / SR;
    out[i] = (0.7 * Math.sin(ph) + 0.25 * (seed / 0x7fffffff - 0.5) * Math.exp(-t * 40)) * Math.exp(-t * 9);
  }
  return out;
};

/** «Tachán» cómico (dos notas descendentes de trombón triste). */
const fracaso: Gen = () => {
  const notes = [392, 370, 349, 294];
  const dur = [0.32, 0.32, 0.32, 0.9];
  const n = len(dur.reduce((a, b) => a + b, 0));
  const out = new Float32Array(n);
  let i0 = 0;
  let ph = 0;
  notes.forEach((f, k) => {
    const m = len(dur[k]);
    for (let i = 0; i < m && i0 + i < n; i++) {
      const t = i / SR;
      const vib = k === 3 ? 6 * Math.sin(2 * Math.PI * 5 * t) : 0;
      ph += (2 * Math.PI * (f + vib)) / SR;
      const saw = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
      out[i0 + i] = 0.22 * (0.6 * saw + 0.4 * Math.sin(ph)) * Math.min(1, t / 0.02, (dur[k] - t) / 0.05);
    }
    i0 += m;
  });
  return out;
};

/** Generador pseudoaleatorio determinista (mismo sonido siempre). */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Tecleo: clics de teclas a ritmo irregular, con alguna barra espaciadora. */
const teclado: Gen = () => {
  const n = len(3);
  const out = new Float32Array(n);
  const r = rng(7);
  let t = 0.03;
  while (t < 2.9) {
    const big = r() < 0.12;
    const i0 = len(t);
    const m = len(big ? 0.045 : 0.025);
    const f = big ? 900 : 2200 + r() * 1800;
    const amp = (big ? 0.5 : 0.32) * (0.7 + r() * 0.3);
    for (let i = 0; i < m && i0 + i < n; i++) {
      const p = i / m;
      out[i0 + i] += amp * ((r() * 2 - 1) * 0.6 + 0.4 * Math.sin((2 * Math.PI * f * i) / SR)) * Math.pow(1 - p, 3);
    }
    t += 0.06 + r() * 0.12 + (r() < 0.08 ? 0.3 : 0);
  }
  return out;
};

/** Pantallazo: chispazo eléctrico + apagón descendente. */
const pantallazo: Gen = () => {
  const n = len(2.2);
  const out = new Float32Array(n);
  const r = rng(11);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const spark = t < 0.35 ? (r() * 2 - 1) * (Math.floor(t * 40) % 2 ? 0.5 : 0.15) * (1 - t / 0.35) : 0;
    const f = 180 * Math.pow(0.25, t / 2.2) + 30;
    ph += (2 * Math.PI * f) / SR;
    const saw = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
    out[i] = spark + 0.3 * saw * Math.min(1, t / 0.02) * (1 - t / 2.2);
  }
  return out;
};

/** Zumbido grave de servidor con algún golpeteo. */
const servidor: Gen = () => {
  const n = len(3);
  const out = new Float32Array(n);
  const r = rng(5);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const hum = 0.22 * Math.sin(2 * Math.PI * 58 * t) + 0.12 * Math.sin(2 * Math.PI * 116 * t + 0.4) + 0.05 * (r() * 2 - 1);
    const knock = t % 0.9 < 0.05 ? (r() * 2 - 1) * 0.35 * (1 - (t % 0.9) / 0.05) : 0;
    out[i] = (hum * (0.8 + 0.2 * Math.sin(t * 3)) + knock) * env(i, n, 0.2, 0.3);
  }
  return out;
};

/** Explosión: estallido de ruido + retumbo grave que se apaga. */
const explosion: Gen = () => {
  const n = len(2.4);
  const out = new Float32Array(n);
  const r = rng(13);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const noise = r() * 2 - 1;
    lp += (noise - lp) * (0.02 + 0.25 * Math.exp(-t * 6)); // se va oscureciendo
    const boom = Math.sin(2 * Math.PI * (55 - 20 * t) * t) * Math.exp(-t * 2.2);
    const crack = t < 0.08 ? noise * (1 - t / 0.08) : 0;
    out[i] = (0.75 * lp * Math.exp(-t * 1.6) * 3 + 0.5 * boom + 0.6 * crack) * Math.min(1, t / 0.004);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < n; i++) out[i] *= 0.95 / Math.max(1e-6, peak);
  return out;
};


/** Murmullo de gente lejos: ruido en la banda de la voz con ritmo de sílabas (varias «voces» desfasadas). */
function murmullo(out: Float32Array, r: () => number, voices: number, amp: number) {
  const n = out.length;
  for (let v = 0; v < voices; v++) {
    let b1 = 0;
    let b2 = 0;
    const f0 = 2 + r() * 1.5; // ritmo de frase
    const fs = 4 + r() * 2.5; // sílabas
    const ph = r() * 10;
    const center = 0.06 + r() * 0.05;
    let gate = 0;
    let next = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      if (t >= next) {
        gate = r() < 0.65 ? 1 : 0; // a ratos hablan, a ratos callan
        next = t + 1.2 + r() * 2.5;
      }
      const noise = r() * 2 - 1;
      b1 += center * (noise - b1);
      b2 += center * 0.35 * (b1 - b2);
      const band = b1 - b2;
      const syl = Math.pow(Math.max(0, Math.sin(2 * Math.PI * fs * t + ph)), 2) * (0.6 + 0.4 * Math.sin(2 * Math.PI * f0 * t * 0.25 + ph));
      out[i] += amp * band * syl * gate;
    }
  }
}
/** Clics sueltos de teclado lejano. */
function teclas(out: Float32Array, r: () => number, amp: number, from: number, to: number) {
  let t = from;
  while (t < to) {
    const i0 = Math.round(t * SR);
    const m = Math.round(0.02 * SR);
    const f = 2000 + r() * 2000;
    for (let i = 0; i < m && i0 + i < out.length; i++) out[i0 + i] += amp * ((r() * 2 - 1) * 0.6 + 0.4 * Math.sin((2 * Math.PI * f * i) / SR)) * Math.pow(1 - i / m, 3);
    t += 0.07 + r() * 0.14;
  }
}
/** Pasos con eco (suelo duro). */
function pasos(out: Float32Array, r: () => number, amp: number, from: number, count: number) {
  for (let k = 0; k < count; k++) {
    const i0 = Math.round((from + k * 0.52) * SR);
    const m = Math.round(0.12 * SR);
    for (let e = 0; e < 2; e++) {
      const d = Math.round(e * 0.09 * SR);
      for (let i = 0; i < m && i0 + d + i < out.length; i++) {
        const t = i / SR;
        out[i0 + d + i] += amp * (e ? 0.3 : 1) * (Math.sin(2 * Math.PI * 140 * t) * 0.7 + (r() * 2 - 1) * 0.3) * Math.exp(-t * 45);
      }
    }
  }
}
function fundidoBucle(out: Float32Array) {
  const f = Math.round(0.4 * SR);
  for (let i = 0; i < f; i++) {
    out[i] *= i / f;
    out[out.length - 1 - i] *= i / f;
  }
  return out;
}
/** Ambiente de oficina: aire acondicionado, murmullo lejano, teclados y algún teléfono a lo lejos (bucle de 12 s). */
const ambiente_oficina: Gen = () => {
  const n = len(12);
  const out = new Float32Array(n);
  const r = rng(101);
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    lp += 0.02 * (w - lp);
    lp2 += 0.004 * (w - lp2);
    out[i] = lp * 0.5 + lp2 * 1.2 + 0.015 * Math.sin((2 * Math.PI * 100 * i) / SR); // aire + zumbido
  }
  murmullo(out, r, 4, 0.9);
  teclas(out, r, 0.07, 0.5, 3.2);
  teclas(out, r, 0.05, 6.1, 8.0);
  teclas(out, r, 0.06, 9.4, 11.2);
  // teléfono lejano
  for (let i = 0; i < len(1.1); i++) {
    const t = i / SR;
    const on = t % 0.55 < 0.38;
    const f = Math.floor(t * 18) % 2 ? 1320 : 1660;
    out[len(4.6) + i] += on ? 0.025 * Math.sin(2 * Math.PI * f * t) : 0;
  }
  return fundidoBucle(out);
};
/** Ambiente de recepción: vestíbulo amplio con eco, pasos, murmullo y el pitido de los tornos (bucle de 12 s). */
const ambiente_recepcion: Gen = () => {
  const n = len(12);
  const out = new Float32Array(n);
  const r = rng(202);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += 0.008 * (r() * 2 - 1 - lp);
    out[i] = lp * 1.4;
  }
  murmullo(out, r, 5, 0.7);
  pasos(out, r, 0.1, 0.8, 6);
  pasos(out, r, 0.07, 7.2, 5);
  // pitido de torno
  for (const at of [3.9, 9.8]) for (let i = 0; i < len(0.12); i++) out[len(at) + i] += 0.05 * Math.sin((2 * Math.PI * 1900 * i) / SR) * Math.min(1, i / 200, (len(0.12) - i) / 200);
  // eco del vestíbulo
  const d = len(0.11);
  for (let i = d; i < n; i++) out[i] += out[i - d] * 0.28;
  return fundidoBucle(out);
};

const GENERATORS: Record<string, { label: string; gen: Gen }> = {
  telefono: { label: "Teléfono sonando", gen: telefono },
  alarma: { label: "Alarma / sirena", gen: alarma },
  pop: { label: "Pop (aparecer)", gen: pop },
  whoosh: { label: "Whoosh (pasar rápido)", gen: whoosh },
  ding: { label: "Ding (idea)", gen: ding },
  boing: { label: "Boing", gen: boing },
  golpe: { label: "Golpe", gen: golpe },
  fracaso: { label: "Tachán triste (fracaso)", gen: fracaso },
  teclado: { label: "Tecleo en el ordenador", gen: teclado },
  pantallazo: { label: "Pantallazo (chispazo y apagón)", gen: pantallazo },
  servidor: { label: "Servidor con ruido raro", gen: servidor },
  explosion: { label: "Explosión", gen: explosion },
  ambiente_oficina: { label: "Ambiente: oficina (bucle)", gen: ambiente_oficina },
  ambiente_recepcion: { label: "Ambiente: recepción (bucle)", gen: ambiente_recepcion },
};

const cache = new Map<string, Float32Array>();
export function synthSamples(name: string): Float32Array | undefined {
  const g = GENERATORS[name];
  if (!g) return undefined;
  if (!cache.has(name)) cache.set(name, g.gen());
  return cache.get(name);
}

export const BUILTIN_SOUNDS: Sound[] = Object.entries(GENERATORS).map(([name, g]) => ({
  id: `sfx_${name}`,
  label: g.label,
  src: `synth:${name}`,
  duration: Math.round((synthSamples(name)!.length / SR) * 100) / 100,
  builtin: true,
}));
