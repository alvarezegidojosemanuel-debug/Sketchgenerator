import type { Catalog } from "@/lib/catalog/types";
import { findCharacter } from "@/lib/catalog";
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
  mouthMode: "auto" | "calibrated";
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
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Eventos ordenados por inicio (estable). */
export function sortedEvents(take: Take): PocketEvent[] {
  return take.events
    .map((e, i) => [e, i] as const)
    .sort((a, b) => a[0].start - b[0].start || a[1] - b[1])
    .map(([e]) => e);
}

/** Boca aproximada: alterna abierta/cerrada ~8 veces/s y se cierra al final de la frase. */
export function mouthFlap(e: DialogueEvent, t: number): boolean {
  const local = t - e.start;
  if (local < 0 || local >= e.duration - 0.12) return false;
  const ch = e.text.length ? e.text[Math.min(e.text.length - 1, Math.floor((local / e.duration) * e.text.length))] : " ";
  if (/[\s,.;:!?¡¿…]/.test(ch)) return false;
  return Math.floor(local * 8) % 2 === 0;
}

/** Estado completo de una toma en el instante t (función pura, reproducible). */
export function evaluateTake(take: Take, catalog: Catalog, t: number): FrameState {
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
      mouthMode: "auto",
      mouthDx: 0,
      mouthDy: 0,
    });
  }
  const props: PropState[] = [];
  const subtitles: Subtitle[] = [];

  for (const e of sortedEvents(take)) {
    if (t < e.start) continue;
    const end = e.start + e.duration;
    const active = t < end;
    const st = e.actorUid ? actors.get(e.actorUid) : undefined;
    switch (e.track) {
      case "dialogue": {
        if (!st || !active) break;
        st.speaking = true;
        st.mouthOpen = st.mouthOpen || mouthFlap(e, t);
        subtitles.push({
          eventId: e.id,
          actorUid: e.actorUid,
          speaker: findCharacter(catalog, st.characterId)?.name ?? st.characterId,
          text: e.text,
        });
        break;
      }
      case "body": {
        if (!st) break;
        if (e.poseId) st.poseId = e.poseId;
        if (e.flip !== undefined) st.flip = e.flip;
        const raw = e.ease === "instant" ? 1 : clamp01((t - e.start) / e.duration);
        const p = e.ease === "linear" ? raw : easeInOut(raw);
        if (e.x !== undefined) st.x = lerp(st.x, e.x, p);
        if (e.y !== undefined) st.y = lerp(st.y, e.y, p);
        if (e.scale !== undefined) st.scale = lerp(st.scale, e.scale, p);
        break;
      }
      case "face":
        if (st && e.expressionId) st.expressionId = e.expressionId;
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
