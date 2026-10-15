/**
 * «Vida» automática de la escena y cámara: que los personajes escuchen, respiren y reaccionen
 * sin tener que programarlo evento a evento. Funciones puras de t (reproducibles).
 */
import type { Catalog } from "@/lib/catalog/types";
import { findCharacter, findPose } from "@/lib/catalog";
import type { CameraEvent, DialogueEvent, Take } from "@/lib/schema/pocket";
import type { ActorState } from "./evaluate";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

function phase(uid: string): number {
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000;
}

/** Diálogos de actores en escena, por orden. */
function actorLines(take: Take): (DialogueEvent & { actorUid: string })[] {
  return take.events
    .filter((e): e is DialogueEvent & { actorUid: string } => e.track === "dialogue" && !!e.actorUid)
    .sort((a, b) => a.start - b.start);
}

/** A quién mira cada actor en t: al que habla; quien habla, a quien le habló antes (o al más cercano). */
function lookTargets(take: Take, t: number, actors: Map<string, ActorState>): Map<string, { target: string; since: number }> {
  const lines = actorLines(take);
  const out = new Map<string, { target: string; since: number }>();
  let prevSpeaker: string | undefined;
  for (const l of lines) {
    if (l.start > t) break;
    const speaker = l.actorUid;
    for (const uid of actors.keys()) {
      if (uid === speaker) {
        const to = prevSpeaker && prevSpeaker !== speaker ? prevSpeaker : nearest(uid, actors);
        if (to) out.set(uid, { target: to, since: l.start });
      } else {
        out.set(uid, { target: speaker, since: l.start });
      }
    }
    if (speaker !== prevSpeaker) prevSpeaker = speaker;
  }
  return out;
}

function nearest(uid: string, actors: Map<string, ActorState>): string | undefined {
  const me = actors.get(uid)!;
  let best: string | undefined;
  let d = Infinity;
  for (const [k, a] of actors) {
    if (k === uid || a.visible <= 0) continue;
    const dd = Math.abs(a.x - me.x);
    if (dd < d) {
      d = dd;
      best = k;
    }
  }
  return best;
}

/**
 * Aplica respiración, mirada al que habla, balanceo al hablar y asentimiento del que escucha.
 * `eyesUntil`: hasta cuándo manda una mirada puesta a mano (no se pisa).
 */
export function applyLife(take: Take, catalog: Catalog, t: number, actors: Map<string, ActorState>, eyesUntil: Map<string, number>) {
  // respiración (sin deformar: un vaivén vertical de 2 px)
  for (const a of actors.values()) {
    const ph = phase(a.uid);
    a.offY += Math.sin((t / 3.4 + ph) * Math.PI * 2) * 2;
  }
  // mirada al que habla
  const looks = lookTargets(take, t, actors);
  for (const [uid, { target, since }] of looks) {
    const me = actors.get(uid);
    const other = actors.get(target);
    if (!me || !other || (eyesUntil.get(uid) ?? -1) + 1.2 > t) continue;
    const ch = findCharacter(catalog, me.characterId);
    if (ch && ch.hasEyes === false) continue;
    const dir = Math.sign(other.x - me.x) || 1;
    const goal = 0.6 * dir * (me.flip ? -1 : 1);
    const p = ease(clamp01((t - since) / 0.25));
    me.gazeX = me.gazeX + (goal - me.gazeX) * p;
    me.gazeY = me.gazeY * (1 - p);
  }
  // quien habla se mueve un poco; quien le escuchaba asiente al terminar la frase
  const lines = actorLines(take);
  let prev: string | undefined;
  for (const l of lines) {
    const end = l.start + l.duration;
    const sp = actors.get(l.actorUid);
    if (sp && t >= l.start && t < end) sp.offX += Math.sin((t + phase(l.actorUid) * 3) * 2.2) * 3;
    if (prev && prev !== l.actorUid) {
      const lis = actors.get(prev);
      const k = (t - (end - 0.15)) / 0.4;
      if (lis && k > 0 && k < 1) lis.offY += Math.sin(Math.PI * k) * 7;
    }
    if (l.actorUid !== prev) prev = l.actorUid;
  }
}

// ---------------------------------------------------------------- cámara

export interface CameraState {
  zoom: number;
  /** Centro del encuadre en px del lienzo. */
  cx: number;
  cy: number;
}

const WIDE: CameraState = { zoom: 1, cx: 540, cy: 960 };

function actorHeight(catalog: Catalog, a: ActorState): number {
  const pose = findPose(catalog, a.characterId, a.poseId);
  return (pose?.height ?? 600) * (pose?.displayScale ?? 1) * a.scale;
}

function frameShot(catalog: Catalog, shot: CameraEvent["shot"], a: ActorState | undefined, zoomOverride?: number): CameraState {
  if (shot === "wide" || !a) return WIDE;
  const h = actorHeight(catalog, a);
  const zoom = zoomOverride ?? (shot === "close" ? Math.min(2.4, 1920 / (h * 1.25)) : Math.min(1.7, 1920 / (h * 2.1)));
  const cy = a.y + a.offY - h * (shot === "close" ? 0.74 : 0.5);
  return clampCam({ zoom: Math.max(1, zoom), cx: a.x + a.offX, cy });
}

function clampCam(c: CameraState): CameraState {
  const hw = 540 / c.zoom;
  const hh = 960 / c.zoom;
  return { zoom: c.zoom, cx: Math.min(1080 - hw, Math.max(hw, c.cx)), cy: Math.min(1920 - hh, Math.max(hh, c.cy)) };
}

/** Planos automáticos: general, plano medio de quien habla y primer plano en el remate. */
export function autoShots(take: Take): CameraEvent[] {
  const lines = actorLines(take);
  const out: CameraEvent[] = [{ id: "auto_cam_0", track: "camera", start: 0, duration: 0.1, shot: "wide" }];
  if (take.actors.length === 0) return out;
  let n = 0;
  lines.forEach((l, i) => {
    const last = i === lines.length - 1;
    const solo = take.actors.length === 1;
    let shot: CameraEvent["shot"];
    if (last) shot = "close";
    else if (solo) shot = n % 2 ? "close" : "medium";
    else shot = n % 3 === 0 ? "wide" : "medium";
    // una pregunta seguida de respuesta del mismo plano se queda; si cambia el que habla, corte
    const prevShot = out[out.length - 1];
    if (!(prevShot.shot === shot && prevShot.actorUid === l.actorUid)) {
      out.push({ id: `auto_cam_${i + 1}`, track: "camera", start: Math.max(0, l.start - 0.08), duration: 0.1, shot, actorUid: shot === "wide" ? undefined : l.actorUid });
    }
    n++;
  });
  return out;
}

/** Encuadre en t: eventos de cámara de la toma (cortes secos) o automáticos si la toma lo pide. */
export function cameraAt(take: Take, catalog: Catalog, t: number, actors: Map<string, ActorState>): CameraState {
  const manual = take.events.filter((e): e is CameraEvent => e.track === "camera");
  const shots = manual.length ? manual.sort((a, b) => a.start - b.start) : take.camera === "auto" ? autoShots(take) : [];
  let cur: CameraEvent | undefined;
  for (const s of shots) {
    if (s.start <= t) cur = s;
    else break;
  }
  if (!cur) return WIDE;
  if (cur.x !== undefined && cur.y !== undefined) return clampCam({ zoom: cur.zoom ?? 1.5, cx: cur.x, cy: cur.y });
  return frameShot(catalog, cur.shot, cur.actorUid ? actors.get(cur.actorUid) : undefined, cur.zoom);
}
