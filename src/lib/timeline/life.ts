/**
 * «Vida» automática de la escena y cámara: que los personajes escuchen, respiren y reaccionen
 * sin tener que programarlo evento a evento. Funciones puras de t (reproducibles).
 */
import type { Catalog } from "@/lib/catalog/types";
import { findCharacter, findPose, poseScale } from "@/lib/catalog";
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
  // respiración: el cuerpo se estira y encoge un poco y se mece despacio, con los pies quietos
  for (const a of actors.values()) {
    const ph = phase(a.uid);
    const b = Math.sin((t / 3.4 + ph) * Math.PI * 2);
    a.sy *= 1 + b * 0.007;
    a.sx *= 1 - b * 0.004;
    a.skew += Math.sin((t / 5.3 + ph) * Math.PI * 2) * 0.3;
    a.headRot += Math.sin((t / 4.1 + ph * 2) * Math.PI * 2) * 0.6;
  }
  // mirada al que habla
  const looks = lookTargets(take, t, actors);
  // humanos dibujados enteros (todos mirando a la derecha del dibujo): se giran hacia quien les habla o a quien hablan
  const TURN = 0.2;
  for (const [uid, { target, since }] of looks) {
    const me = actors.get(uid);
    const other = actors.get(target);
    const pose = me ? findPose(catalog, me.characterId, me.poseId) : undefined;
    if (!me || !other || !pose?.flat || pose.facing !== "front" || other.x === me.x) continue;
    const want = other.x < me.x;
    const before = lookTargets(take, since - 0.01, actors).get(uid);
    const prevOther = before ? actors.get(before.target) : undefined;
    const was = prevOther && prevOther.x !== me.x ? prevOther.x < me.x : me.flip;
    const k = (t - since) / TURN;
    me.flip = want;
    if (was !== want && k >= 0 && k < 1) {
      // media vuelta: fundido rápido entre los dos lados con un pequeño saltito (como un cambio de peso)
      me.turnFrom = was;
      me.turnMix = ease(k);
      me.offY -= Math.sin(Math.PI * k) * 6;
    }
  }
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
    if (sp && t >= l.start && t < end) {
      // quien habla: se inclina hacia quien le escucha y «gesticula» con el cuerpo al ritmo de la frase
      const ph = phase(l.actorUid);
      const into = clamp01((t - l.start) / 0.3) * clamp01((end - t) / 0.3);
      const to = looks.get(l.actorUid)?.target;
      const other = to ? actors.get(to) : undefined;
      const dir = other ? Math.sign(other.x - sp.x) : 0;
      const loud = /[!¡]/.test(l.text) ? 1.3 : 1;
      sp.skew += (-dir * 0.3 + Math.sin((t + ph * 3) * Math.PI * 2 * 0.5) * 0.25 * loud) * into;
      // cabeza: se gira hacia quien escucha y acompaña la frase con cabeceos
      sp.headRot += (dir * 1.2 + Math.sin((t + ph) * Math.PI * 2 * 0.7) * 0.6 * loud) * into;
      sp.headDy += Math.abs(Math.sin((t + ph * 2) * Math.PI * 2 * 0.9)) * 0.5 * loud * into;
      const beat = Math.abs(Math.sin((t + ph) * Math.PI * 2 * 1.0));
      sp.sy *= 1 + beat * 0.004 * loud * into;
      sp.offX += Math.sin((t + ph * 3) * 1.4) * 0.3 * into;
    }
    if (prev && prev !== l.actorUid) {
      const lis = actors.get(prev);
      const k = (t - (end - 0.15)) / 0.4;
      if (lis && k > 0 && k < 1) {
        lis.offY += Math.sin(Math.PI * k) * 7;
        lis.sy *= 1 - Math.sin(Math.PI * k) * 0.02;
        // asentir: dos cabeceos cortos
        lis.headDy += Math.max(0, Math.sin(Math.PI * 2 * k)) * 7;
        lis.headRot += Math.sin(Math.PI * 2 * k) * 1.5;
      }
    }
    // el que escucha reacciona al empezar la frase del otro (pequeño respingo hacia atrás)
    if (prev && prev !== l.actorUid) {
      const lis = actors.get(prev);
      const k = (t - l.start) / 0.35;
      if (lis && k > 0 && k < 1) {
        const dir = sp ? Math.sign(sp.x - lis.x) : 0;
        lis.skew += dir * 0.6 * Math.sin(Math.PI * k);
      }
      // y mientras escucha, ladea la cabeza hacia quien habla
      if (lis && sp && t >= l.start && t < end) lis.headRot += Math.sign(sp.x - lis.x) * 1.5 * clamp01((t - l.start) / 0.4);
    }
    if (l.actorUid !== prev) prev = l.actorUid;
  }
}

/** Límite del giro de cabeza (más allá se notaría el corte del cuello). */
export const HEAD_MAX = 7;

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
  return (pose?.height ?? 600) * poseScale(catalog, a.characterId, pose) * a.scale;
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

/**
 * Cámara «viva» por defecto (sin planos puestos): se acerca muy despacio durante la escena y en la
 * última frase (el remate) da un pequeño empujón. No sigue a quien habla.
 */
function livingCamera(take: Take, _catalog: Catalog, t: number, _actors: Map<string, ActorState>): CameraState {
  const lines = actorLines(take);
  if (!lines.length || take.duration < 2) return WIDE;
  const slow = 1 + 0.05 * ease(clamp01(t / take.duration));
  // sin deslizarse hacia quien habla: un movimiento tan pequeño se leía como traqueteo.
  // Solo el acercamiento lento y el empujón del remate, siempre centrados (cámara quieta).
  const cx = 540;
  const cy = 960;
  const last = lines[lines.length - 1];
  const punch = t >= last.start ? 0.12 * ease(clamp01((t - last.start) / 0.35)) : 0;
  return clampCam({ zoom: slow + punch, cx, cy });
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
  if (!cur) return take.camera === "fixed" ? WIDE : livingCamera(take, catalog, t, actors);
  const target = shotState(catalog, cur, actors);
  if (!cur.move || t >= cur.start + cur.duration) return target;
  // travelling: del plano anterior a este, suavizado
  const prev = shots.filter((s) => s.start < cur!.start).pop();
  const from = prev ? shotState(catalog, prev, actors) : take.camera === "fixed" ? WIDE : livingCamera(take, catalog, cur.start, actors);
  const k = ease(clamp01((t - cur.start) / Math.max(0.05, cur.duration)));
  // el zoom se interpola en escala logarítmica (acercamiento constante a la vista)
  const zoom = Math.exp(Math.log(from.zoom) + (Math.log(target.zoom) - Math.log(from.zoom)) * k);
  return clampCam({ zoom, cx: from.cx + (target.cx - from.cx) * k, cy: from.cy + (target.cy - from.cy) * k });
}

function shotState(catalog: Catalog, s: CameraEvent, actors: Map<string, ActorState>): CameraState {
  if (s.x !== undefined && s.y !== undefined) return clampCam({ zoom: s.zoom ?? 1.5, cx: s.x, cy: s.y });
  return frameShot(catalog, s.shot, s.actorUid ? actors.get(s.actorUid) : undefined, s.zoom);
}
