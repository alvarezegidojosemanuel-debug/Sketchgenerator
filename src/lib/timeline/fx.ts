/** Animaciones de objetos, efectos corporales y de pantalla (funciones puras de t). */
import type { BodyEvent, PropsEvent, ScreenEvent } from "@/lib/schema/pocket";
import type { ExplosionState } from "@/lib/renderer/explosion";
import type { ComicKind, ComicState } from "@/lib/renderer/comic";

export interface PropAnim {
  dx: number;
  dy: number;
  scale: number;
  rot: number;
  opacity: number;
}

const ENTER = 0.35;
const EXIT = 0.3;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

function applyTransition(kind: PropsEvent["enter"], p: number, a: PropAnim) {
  // p: 0 = invisible, 1 = completamente presente
  switch (kind) {
    case "pop":
      a.scale *= Math.max(0, easeOutBack(p));
      a.opacity *= clamp01(p * 3);
      break;
    case "fade":
      a.opacity *= p;
      break;
    case "slide":
      a.dy += (1 - easeInOut(p)) * 260;
      a.opacity *= clamp01(p * 2);
      break;
    default:
      break;
  }
}

export function propAnim(e: PropsEvent, t: number): PropAnim {
  const local = Math.max(0, t - e.start);
  const a: PropAnim = { dx: 0, dy: 0, scale: 1, rot: e.rot ?? 0, opacity: 1 };
  // desplazamiento
  if (e.toX !== undefined || e.toY !== undefined) {
    const p = easeInOut(clamp01(local / e.duration));
    a.dx += ((e.toX ?? e.x) - e.x) * p;
    a.dy += ((e.toY ?? e.y) - e.y) * p;
  }
  // entrada / salida
  const enterDur = Math.min(ENTER, e.duration / 2);
  const exitDur = Math.min(EXIT, e.duration / 2);
  if (e.enter && e.enter !== "none" && local < enterDur) applyTransition(e.enter, local / enterDur, a);
  const remain = e.duration - local;
  if (e.exit && e.exit !== "none" && remain < exitDur) applyTransition(e.exit, remain / exitDur, a);
  // animación continua
  switch (e.loop) {
    case "shake": {
      // vibración de móvil: zumbido corto y rápido, a ráfagas (como el timbre)
      const on = local % 1.3 < 0.9 ? 1 : 0;
      a.dx += Math.sin(local * 150) * 2.5 * on;
      a.rot += Math.sin(local * 110) * 2 * on;
      break;
    }
    case "pulse":
      a.scale *= 1 + 0.09 * Math.sin(local * 9);
      break;
    case "blink":
      a.opacity *= Math.floor(local * 4) % 2 ? 0.2 : 1;
      break;
    case "float":
      a.dy += Math.sin(local * 2.6) * 16;
      a.rot += Math.sin(local * 1.7) * 3;
      break;
    case "spin":
      a.rot += local * 360;
      break;
    case "type":
      a.dx += Math.sin(local * 9) * 2;
      a.dy -= Math.abs(Math.sin(local * 16)) * 5;
      break;
    default:
      break;
  }
  return a;
}

/** Desplazamiento del actor por efecto corporal. */
export function bodyFx(e: BodyEvent, t: number): { dx: number; dy: number } {
  const local = t - e.start;
  if (!e.fx || local < 0 || local > e.duration) return { dx: 0, dy: 0 };
  if (e.fx === "shake") return { dx: Math.sin(local * 60) * 9, dy: 0 };
  if (e.fx === "type") return { dx: Math.sin(local * 9) * 2, dy: -Math.abs(Math.sin(local * 16)) * 5 };
  const p = local / e.duration;
  return { dx: 0, dy: -Math.sin(Math.PI * p) * 140 };
}

export interface ScreenFx {
  flash?: { color: string; alpha: number };
  shake?: { dx: number; dy: number };
  darken?: number;
  /** Pantallazo azul a pantalla completa con texto. */
  bluescreen?: { alpha: number; text: string };
  /** Explosiones activas (bola de fuego, metralla, humo, «¡BUM!»). */
  explosions?: ExplosionState[];
  /** Recursos de cómic activos (ya colocados sobre la cabeza de su actor). */
  comics?: ComicState[];
  /** Pendientes de colocar (se resuelven con la posición final del actor). */
  comicsPending?: { kind: ComicKind; actorUid?: string; local: number; duration: number; text?: string }[];
  rotulos?: { kind: ComicKind; actorUid?: string; local: number; duration: number; text?: string }[];
}

export type Presence = NonNullable<BodyEvent["appear"]>;
/** Duración de una entrada / salida de escena (s). */
export const PRESENCE_TIME = 0.4;

/** Opacidad y escala de un actor que entra (p: 0→1) o sale (p: 1→0) de escena. */
export function presence(kind: Presence, p: number): { opacity: number; scale: number } {
  p = clamp01(p);
  switch (kind) {
    case "pop":
      return { opacity: clamp01(p * 3), scale: Math.max(0.01, easeOutBack(p)) };
    case "fade":
      return { opacity: p, scale: 1 };
    case "flash":
      return { opacity: clamp01(p * 2), scale: 1 + (1 - p) * 0.15 };
    default:
      return { opacity: p >= 1 ? 1 : p > 0 ? 1 : 0, scale: 1 };
  }
}

export function screenFx(e: ScreenEvent, t: number, acc: ScreenFx) {
  const local = t - e.start;
  if (local < 0 || local > e.duration) return;
  const edge = clamp01(Math.min(local, e.duration - local) / 0.15);
  switch (e.effect) {
    case "flash":
      acc.flash = { color: e.color ?? "#ff2a2a", alpha: 0.45 * edge * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(local * 11))) };
      break;
    case "shake":
      acc.shake = { dx: Math.sin(local * 47) * 18 * edge, dy: Math.cos(local * 39) * 12 * edge };
      break;
    case "darken":
      acc.darken = 0.55 * edge;
      break;
    case "explosion": {
      let seed = 7;
      for (const ch of e.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      (acc.explosions ??= []).push({ x: e.x ?? 540, y: e.y ?? 1100, local, seed, text: e.text ?? "¡BUM!", scale: e.size ?? 1 });
      // destello blanco y temblor fuerte al principio
      if (local < 0.25) acc.flash = { color: "#ffffff", alpha: 0.85 * (1 - local / 0.25) };
      if (local < 0.7) {
        const f = 1 - local / 0.7;
        acc.shake = { dx: Math.sin(local * 61) * 34 * f, dy: Math.cos(local * 53) * 26 * f };
      }
      break;
    }
    case "comic":
      (acc.comicsPending ??= []).push({ kind: e.kind ?? "sorpresa", actorUid: e.actorUid, local, duration: e.duration, text: e.text });
      break;
    case "bluescreen":
      acc.bluescreen = { alpha: clamp01(Math.min(local, e.duration - local) / 0.08), text: e.text ?? "Tu equipo se ha puñetizado." };
      break;
  }
}
