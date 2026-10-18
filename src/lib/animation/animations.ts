/**
 * ANIMACIONES de cada personaje: una secuencia de sus poses con su tiempo (en bucle o de una vez) y un movimiento
 * de cuerpo opcional. Se crean en la pestaña Animación y se usan en las columnas del editor de guion.
 * Las de todos van en src/data/animations.json; las de este dispositivo, en el navegador. Al usar una en un guion,
 * se copia dentro del guion («animaciones»), así el proyecto funciona en cualquier dispositivo.
 */
import shared from "@/data/animations.json";

export interface AnimFrame {
  /** Pose sin prefijo («camina», «camina2»…). */
  pose: string;
  /** Segundos. */
  dur: number;
}
export type AnimMove = "ninguno" | "bote" | "tiembla" | "salto";
export interface Animation {
  nombre: string;
  frames: AnimFrame[];
  bucle: boolean;
  mov?: AnimMove;
}
/** Por id de personaje. */
export type AnimLibrary = Record<string, Animation[]>;

export const ANIM_MOVES: [AnimMove, string][] = [
  ["ninguno", "Ninguno"],
  ["bote", "Botecito (andar)"],
  ["tiembla", "Temblor"],
  ["salto", "Salto"],
];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Limpia una animación venida de fuera (guion, portapapeles…). */
export function cleanAnimation(v: unknown): Animation | undefined {
  if (!isObj(v) || typeof v.nombre !== "string" || !Array.isArray(v.frames)) return undefined;
  const frames = (v.frames as unknown[])
    .filter((f): f is Record<string, unknown> => isObj(f) && typeof f.pose === "string")
    .map((f) => ({ pose: String(f.pose).slice(0, 60), dur: Math.max(0.04, Math.min(5, Number(f.dur) || 0.2)) }))
    .slice(0, 40);
  if (!frames.length) return undefined;
  const mov = ANIM_MOVES.some(([m]) => m === v.mov) ? (v.mov as AnimMove) : undefined;
  return { nombre: v.nombre.slice(0, 40), frames, bucle: v.bucle !== false, ...(mov && mov !== "ninguno" ? { mov } : {}) };
}

export const animDuration = (a: Animation) => a.frames.reduce((n, f) => n + f.dur, 0);

/** Animaciones de un personaje: las de este dispositivo mandan sobre las comunes con el mismo nombre. */
export function animationsFor(cid: string, local?: AnimLibrary | null): Animation[] {
  const out = new Map<string, Animation>();
  for (const a of ((shared as AnimLibrary)[cid] ?? [])) out.set(a.nombre, a);
  for (const a of local?.[cid] ?? []) out.set(a.nombre, a);
  return [...out.values()];
}

/** La animación «nombre» de un personaje según el guion (primero la copia del guion, luego las comunes). */
export function resolveAnimation(cid: string, nombre: string, fromScript: unknown): Animation | undefined {
  const inScript = isObj(fromScript) && Array.isArray(fromScript[cid]) ? (fromScript[cid] as unknown[]).map(cleanAnimation).find((a) => a?.nombre === nombre) : undefined;
  return inScript ?? ((shared as AnimLibrary)[cid] ?? []).find((a) => a.nombre === nombre);
}

const LOCAL_KEY = "pocket:animations";
export const animationStore = {
  get(): AnimLibrary {
    try {
      const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}") as unknown;
      if (!isObj(v)) return {};
      const out: AnimLibrary = {};
      for (const [k, list] of Object.entries(v)) if (Array.isArray(list)) out[k] = list.map(cleanAnimation).filter((a): a is Animation => !!a);
      return out;
    } catch {
      return {};
    }
  },
  save(m: AnimLibrary) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(m));
    } catch {
      /* sin almacenamiento */
    }
  },
};
