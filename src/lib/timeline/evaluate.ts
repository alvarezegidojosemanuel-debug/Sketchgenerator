import type { Catalog } from "@/lib/catalog/types";
import { findCharacter, findExpression } from "@/lib/catalog";
import type { DialogueEvent, PocketEvent, PocketProject, PropsEvent, Take } from "@/lib/schema/pocket";

export interface ActorState {
  uid: string;
  characterId: string;
  poseId: string;
  x: number;
  y: number;
  scale: number;
  flip: boolean;
  zIndex: number;
  expressionId: string | undefined;
  gazeX: number;
  gazeY: number;
  speaking: boolean;
  mouthOpen: boolean;
  /** Boca concreta de este frame (lip-sync con las bocas "talk" de la expresión); undefined = reposo. */
  mouthAssetId: string | undefined;
  mouthMode: "auto" | "calibrated";
  /** Transición suave: pose anterior y mezcla 0→1 de la nueva (fundido). */
  prevPoseId?: string;
  poseMix: number;
  /** Fundido de expresión. */
  prevExpressionId?: string;
  exprMix: number;
  mouthDx: number;
  mouthDy: number;
}

export interface PropState {
  key: string;
  propId: string;
  layer: PropsEvent["layer"];
  x: number;
  y: number;
  scale: number;
  zIndex: number;
}

export interface Subtitle {
  eventId: string;
  actorUid: string;
  speaker: string;
  text: string;
}

export interface FrameState {
  backgroundId: string | null;
  actors: ActorState[];
  props: PropState[];
  subtitles: Subtitle[];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Duración del fundido entre poses y entre expresiones (s). */
export const POSE_FADE = 0.22;
export const EXPR_FADE = 0.15;
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Eventos ordenados por inicio (estable). */
export function sortedEvents(take: Take): PocketEvent[] {
  return take.events
    .map((e, i) => [e, i] as const)
    .sort((a, b) => a[0].start - b[0].start || a[1] - b[1])
    .map(([e]) => e);
}

/** Índice de forma de boca abierta (cambia ~4 veces/s) para variar entre las bocas "talk". */
export function mouthShapeIndex(e: DialogueEvent, t: number): number {
  return Math.floor((t - e.start) * 4);
}

/** Boca aproximada: alterna abierta/cerrada ~8 veces/s y se cierra al final de la frase. */
export function mouthFlap(e: DialogueEvent, t: number): boolean {
  const local = t - e.start;
  if (local < 0 || local >= e.duration - 0.12) return false;
  const ch = e.text.length ? e.text[Math.min(e.text.length - 1, Math.floor((local / e.duration) * e.text.length))] : " ";
  if (/[\s,.;:!?¡¿…]/.test(ch)) return false;
  return Math.floor(local * 8) % 2 === 0;
}

export interface EvaluateOptions {
  /**
   * Voz real sonando: actor → segundos que lleva hablando. Si se pasa, la boca la marca el
   * audio (se mueve solo mientras suena y se cierra cuando acaba), no la duración del bloque.
   */
  live?: Map<string, number>;
  /** Volumen real de la voz (0..1) por actor: la boca se abre según la onda del audio. */
  levels?: Map<string, number>;
}

/** Umbral de volumen por debajo del cual la boca se considera cerrada. */
export const MOUTH_THRESHOLD = 0.14;

/** Bocas de hablar ordenadas de más cerrada a más abierta (altura del dibujo original). */
function talkByOpenness(catalog: Catalog, characterId: string, talk: string[]): string[] {
  const ch = findCharacter(catalog, characterId);
  const h = (id: string) => {
    const a = ch?.face.mouths.find((m) => m.id === id);
    return a ? (a.bbox[3] - a.bbox[1]) / (a.normScale ?? 1) : 0;
  };
  return [...talk].sort((x, y) => h(x) - h(y));
}

/** Boca mientras suena la voz real: ~8 aperturas por segundo. */
export function liveMouthOpen(elapsed: number): boolean {
  return Math.floor(elapsed * 8) % 2 === 0;
}

/** Estado completo de una toma en el instante t (función pura, reproducible). */
export function evaluateTake(take: Take, catalog: Catalog, t: number, opts: EvaluateOptions = {}): FrameState {
  const actors = new Map<string, ActorState>();
  for (const a of take.actors) {
    actors.set(a.uid, {
      uid: a.uid,
      characterId: a.characterId,
      poseId: a.poseId,
      x: a.x,
      y: a.y,
      scale: a.scale ?? 1,
      flip: a.flip ?? false,
      zIndex: a.zIndex ?? 0,
      expressionId: a.expressionId ?? findCharacter(catalog, a.characterId)?.fallbackExpressionId,
      gazeX: 0,
      gazeY: 0,
      speaking: false,
      mouthOpen: false,
      mouthAssetId: undefined,
      poseMix: 1,
      exprMix: 1,
      mouthMode: "auto",
      mouthDx: 0,
      mouthDy: 0,
    });
  }
  const props: PropState[] = [];
  const subtitles: Subtitle[] = [];
  const talkIndex = new Map<string, number>();

  for (const e of sortedEvents(take)) {
    if (t < e.start) continue;
    const end = e.start + e.duration;
    const active = t < end;
    const st = e.actorUid ? actors.get(e.actorUid) : undefined;
    switch (e.track) {
      case "dialogue": {
        if (!st || !active) break;
        subtitles.push({
          eventId: e.id,
          actorUid: e.actorUid,
          speaker: findCharacter(catalog, st.characterId)?.name ?? st.characterId,
          text: e.text,
        });
        if (opts.live || opts.levels) break; // con voz real, la boca la decide el audio (abajo)
        st.speaking = true;
        if (mouthFlap(e, t)) {
          st.mouthOpen = true;
          talkIndex.set(st.uid, mouthShapeIndex(e, t));
        }
        break;
      }
      case "body": {
        if (!st) break;
        if (e.poseId && e.poseId !== st.poseId) {
          st.prevPoseId = st.poseId;
          st.poseId = e.poseId;
          st.poseMix = clamp01((t - e.start) / Math.min(POSE_FADE, e.duration));
          if (st.poseMix >= 1) st.prevPoseId = undefined;
        }
        if (e.flip !== undefined) st.flip = e.flip;
        const raw = e.ease === "instant" ? 1 : clamp01((t - e.start) / e.duration);
        const p = e.ease === "linear" ? raw : easeInOut(raw);
        if (e.x !== undefined) st.x = lerp(st.x, e.x, p);
        if (e.y !== undefined) st.y = lerp(st.y, e.y, p);
        if (e.scale !== undefined) st.scale = lerp(st.scale, e.scale, p);
        break;
      }
      case "face":
        if (st && e.expressionId && e.expressionId !== st.expressionId) {
          st.prevExpressionId = st.expressionId;
          st.expressionId = e.expressionId;
          st.exprMix = clamp01((t - e.start) / Math.min(EXPR_FADE, e.duration));
          if (st.exprMix >= 1) st.prevExpressionId = undefined;
        }
        break;
      case "eyes": {
        if (!st) break;
        const p = clamp01((t - e.start) / Math.min(e.duration, 0.25));
        st.gazeX = lerp(st.gazeX, e.gazeX, p);
        st.gazeY = lerp(st.gazeY, e.gazeY, p);
        break;
      }
      case "mouth":
        if (!st) break;
        st.mouthMode = e.mode;
        st.mouthDx = e.mode === "calibrated" ? e.dx ?? 0 : 0;
        st.mouthDy = e.mode === "calibrated" ? e.dy ?? 0 : 0;
        break;
      case "props":
        if (!active) break;
        props.push({
          key: e.id,
          propId: e.propId,
          layer: e.layer,
          x: e.x,
          y: e.y,
          scale: e.scale ?? 1,
          zIndex: e.zIndex ?? 0,
        });
        break;
    }
  }

  const levelDriven = new Set<string>();
  if (opts.levels) {
    for (const [uid, level] of opts.levels) {
      const st = actors.get(uid);
      if (!st) continue;
      st.speaking = true;
      levelDriven.add(uid);
      if (level > MOUTH_THRESHOLD) {
        const ex = st.expressionId ? findExpression(catalog, st.characterId, st.expressionId) : undefined;
        const ordered = ex?.talk.length ? talkByOpenness(catalog, st.characterId, ex.talk) : [];
        st.mouthOpen = true;
        if (ordered.length) {
          const k = Math.min(ordered.length - 1, Math.floor(((level - MOUTH_THRESHOLD) / (1 - MOUTH_THRESHOLD)) * ordered.length));
          st.mouthAssetId = ordered[k];
        }
      }
    }
  }
  if (opts.live) {
    for (const [uid, elapsed] of opts.live) {
      if (levelDriven.has(uid)) continue;
      const st = actors.get(uid);
      if (!st) continue;
      st.speaking = true;
      if (liveMouthOpen(elapsed)) {
        st.mouthOpen = true;
        talkIndex.set(uid, Math.floor(elapsed * 4));
      }
    }
  }

  // La boca se resuelve al final, con la expresión vigente en t.
  for (const st of actors.values()) {
    if (levelDriven.has(st.uid)) continue;
    const k = talkIndex.get(st.uid);
    if (k === undefined) continue;
    const ex = st.expressionId ? findExpression(catalog, st.characterId, st.expressionId) : undefined;
    if (ex?.talk.length) st.mouthAssetId = ex.talk[k % ex.talk.length];
  }

  return {
    backgroundId: take.backgroundId,
    actors: [...actors.values()].sort((a, b) => a.zIndex - b.zIndex),
    props: props.sort((a, b) => a.zIndex - b.zIndex),
    subtitles,
  };
}

export interface TakeSlot {
  index: number;
  offset: number;
  duration: number;
}

export function projectSchedule(project: PocketProject): { slots: TakeSlot[]; total: number } {
  let offset = 0;
  const slots = project.takes.map((t, index) => {
    const s = { index, offset, duration: t.duration };
    offset += t.duration;
    return s;
  });
  return { slots, total: offset };
}

/** Convierte tiempo global del proyecto → (toma, tiempo local). */
export function locate(project: PocketProject, globalT: number): { takeIndex: number; t: number } {
  const { slots, total } = projectSchedule(project);
  const g = Math.max(0, Math.min(globalT, total));
  for (const s of slots) {
    if (g < s.offset + s.duration) return { takeIndex: s.index, t: g - s.offset };
  }
  const last = slots[slots.length - 1];
  return { takeIndex: last.index, t: last.duration };
}
