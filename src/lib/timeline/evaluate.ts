import type { Catalog } from "@/lib/catalog/types";
import { findCharacter, findExpression, findPose, findProp, poseScale } from "@/lib/catalog";
import { bodyFx, presence, propAnim, screenFx, PRESENCE_TIME, type PropAnim, type ScreenFx } from "./fx";
import { stripAudioTags } from "@/lib/voice/tags";
import { applyLife, cameraAt, type CameraState } from "./life";
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
  /** Desplazamiento temporal por efecto corporal (saltar, temblar). */
  offX: number;
  offY: number;
  /** Transición suave: pose anterior y mezcla 0→1 de la nueva (fundido). */
  prevPoseId?: string;
  /** Poses que van a usarse en breve: se montan invisibles para que el cambio no parpadee. */
  upcomingPoses?: string[];
  poseMix: number;
  /** Fundido de expresión. */
  prevExpressionId?: string;
  exprMix: number;
  mouthDx: number;
  mouthDy: number;
  /** Presencia en escena (entradas / salidas): 0 = fuera, 1 = dentro. */
  visible: number;
  presenceScale: number;
  /** Animación «de goma» (pies fijos): inclinación en grados y estiramiento horizontal/vertical. */
  skew: number;
  sx: number;
  sy: number;
  /** Cabeza articulada: giro (grados, + = hacia la derecha del dibujo) y bajada (px). */
  headRot: number;
  headDy: number;
  /** Media vuelta: lado anterior y mezcla 0→1 hacia el nuevo (fundido rápido entre los dos lados). */
  turnFrom?: boolean;
  turnMix?: number;
}

export interface PropState {
  key: string;
  propId: string;
  layer: PropsEvent["layer"];
  x: number;
  y: number;
  scale: number;
  zIndex: number;
  rot: number;
  opacity: number;
  flip: boolean;
  /** Otro fotograma de la animación (para precargarlo). */
  altPropId?: string;
  /** Bocadillo de pensamiento: el objeto se dibuja centrado en (x, y) dentro de una nube. */
  bubble?: { cx: number; cy: number; w: number; h: number; tailX: number; tailY: number };
}

export interface Subtitle {
  eventId: string;
  actorUid: string;
  /** Personaje que habla sin ser actor (p. ej. dibujado de espaldas como objeto). */
  voiceOf?: string;
  speaker: string;
  text: string;
}

export interface FrameState {
  backgroundId: string | null;
  actors: ActorState[];
  props: PropState[];
  subtitles: Subtitle[];
  screen: ScreenFx;
  /** Encuadre de cámara (zoom 1 = plano general). */
  camera: CameraState;
  /** Sonidos que deberían estar sonando en t (para exportar / depurar). */
  sounds: { eventId: string; soundId: string; offset: number; volume: number }[];
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
  /** Vida automática (mirar al que habla, respirar, asentir). Por defecto sí. */
  life?: boolean;
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
/**
 * Boca de dos fotogramas (humanos dibujados enteros): con voz real no basta «volumen > umbral» (la boca se
 * quedaría abierta toda la frase o temblaría a 60 fps). Abre y cierra a ritmo de sílaba (~8/s) solo mientras suena,
 * y se cierra en las pausas y caídas de volumen.
 */
export function flatMouthOpen(level: number, t: number): boolean {
  return level > MOUTH_THRESHOLD * 1.4 && Math.floor(t * 8) % 2 === 0;
}

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
      offX: 0,
      offY: 0,
      mouthMode: "auto",
      mouthDx: 0,
      mouthDy: 0,
      visible: a.hidden ? 0 : 1,
      presenceScale: 1,
      skew: 0,
      sx: 1,
      sy: 1,
      headRot: 0,
      headDy: 0,
    });
  }
  const props: PropState[] = [];
  const subtitles: Subtitle[] = [];
  const talkIndex = new Map<string, number>();
  const screen: ScreenFx = {};
  const eyesUntil = new Map<string, number>();
  const sounds: FrameState["sounds"] = [];
  /** Personajes con la boca abierta ahora (para los objetos con talkOf: humanos dibujados como objeto). */
  const voiceOpen = new Set<string>();
  const talkProps: { pr: PropState; talkOf: string; open: string; closed: string }[] = [];

  // Lo que viene en los próximos segundos se monta ya (invisible): en el móvil, una imagen recién creada
  // tarda unos fotogramas en pintarse aunque esté descargada; así el cambio es solo de opacidad.
  const AHEAD = 2;
  for (const e of take.events) {
    if (e.start <= t || e.start - t > AHEAD) continue;
    if (e.track === "props" && !e.bubbleOf) {
      props.push({ key: e.id, propId: e.propId, layer: e.layer, x: e.x, y: e.y, scale: e.scale ?? 1, zIndex: e.zIndex ?? 0, rot: e.rot ?? 0, opacity: 0.001, flip: e.flip ?? false });
    } else if (e.track === "body" && e.poseId && e.actorUid) {
      const st = actors.get(e.actorUid);
      if (st) (st.upcomingPoses ??= []).push(e.poseId);
    }
  }
  for (const e of sortedEvents(take)) {
    if (t < e.start) continue;
    const end = e.start + e.duration;
    const active = t < end;
    const st = e.actorUid ? actors.get(e.actorUid) : undefined;
    switch (e.track) {
      case "dialogue": {
        if (!active) break;
        if (!e.actorUid) {
          if (e.voiceOf && !opts.live && !opts.levels && mouthFlap(e, t)) voiceOpen.add(e.voiceOf);
          const who = e.speakerName ?? (e.voiceOf ? findCharacter(catalog, e.voiceOf)?.name ?? e.voiceOf : "Narrador");
          subtitles.push({ eventId: e.id, actorUid: "", voiceOf: e.voiceOf, speaker: who, text: stripAudioTags(e.text) });
          break;
        }
        if (!st) break;
        subtitles.push({
          eventId: e.id,
          actorUid: e.actorUid,
          speaker: findCharacter(catalog, st.characterId)?.name ?? st.characterId,
          text: stripAudioTags(e.text),
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
          // estirar y encoger al cambiar de pose (anticipación + rebote), con los pies en el suelo
          const k = (t - e.start) / 0.45;
          if (k >= 0 && k < 1) {
            const s = Math.sin(k * Math.PI * 2) * (1 - k) * 0.07;
            st.sy *= 1 - s;
            st.sx *= 1 + s * 0.7;
          }
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
        const change = e.appear ?? e.disappear;
        if (change) {
          const T = change === "cut" ? 0 : Math.min(PRESENCE_TIME, e.duration);
          const k = T ? clamp01((t - e.start) / T) : 1;
          const pr = presence(change, e.appear ? k : 1 - k);
          st.visible = pr.opacity;
          st.presenceScale = pr.scale;
          if (change === "flash" && k < 1) {
            const alpha = 0.85 * (1 - k);
            if (!screen.flash || screen.flash.alpha < alpha) screen.flash = { color: "#ffffff", alpha };
          }
        }
        if (e.fx) {
          const o = bodyFx(e, t);
          st.offX += o.dx;
          st.offY += o.dy;
        }
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
        eyesUntil.set(st.uid, Math.max(eyesUntil.get(st.uid) ?? -1, e.start + e.duration));
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
      case "props": {
        if (!active) break;
        const a = propAnim(e, t);
        const frame2 = e.altPropId && !e.talkOf && Math.floor((t - e.start) / (e.altEvery ?? 0.16)) % 2 === 1;
        const pr = {
          key: e.id,
          propId: frame2 ? e.altPropId! : e.propId,
          altPropId: e.altPropId ? (frame2 ? e.propId : e.altPropId) : undefined,
          layer: e.bubbleOf ? "props-front" : e.layer,
          x: e.x + a.dx,
          y: e.y + a.dy,
          scale: (e.scale ?? 1) * a.scale,
          zIndex: (e.zIndex ?? 0) + (e.bubbleOf ? 50 : 0),
          rot: a.rot,
          opacity: a.opacity,
          flip: e.flip ?? false,
          ...(e.bubbleOf ? { bubble: { cx: 0, cy: 0, w: 0, h: 0, tailX: 0, tailY: 0 }, bubbleOf: e.bubbleOf, baseScale: e.scale ?? 1, anim: a } : {}),
        } as PropState;
        props.push(pr);
        if (e.talkOf && e.altPropId) talkProps.push({ pr, talkOf: e.talkOf, open: e.altPropId, closed: e.propId });
        break;
      }
      case "sfx":
        if (active) sounds.push({ eventId: e.id, soundId: e.soundId, offset: t - e.start, volume: e.volume ?? 1 });
        break;
      case "screen":
        screenFx(e, t, screen);
        break;
    }
  }

  const levelDriven = new Set<string>();
  if (opts.levels) {
    for (const [uid, level] of opts.levels) {
      if (uid.startsWith("voice:")) {
        if (flatMouthOpen(level, t)) voiceOpen.add(uid.slice(6));
        continue;
      }
      const st = actors.get(uid);
      if (!st) continue;
      st.speaking = true;
      levelDriven.add(uid);
      if (findPose(catalog, st.characterId, st.poseId)?.flat) {
        st.mouthOpen = flatMouthOpen(level, t);
      } else if (level > MOUTH_THRESHOLD) {
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
      if (uid.startsWith("voice:")) {
        if (!opts.levels?.has(uid) && liveMouthOpen(elapsed)) voiceOpen.add(uid.slice(6));
        continue;
      }
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
  for (const { pr, talkOf, open, closed } of talkProps) {
    const isOpen = voiceOpen.has(talkOf);
    pr.propId = isOpen ? open : closed;
    pr.altPropId = isOpen ? closed : open;
  }

  // Bocadillos de pensamiento: encima de la cabeza del actor (hacia donde mira).
  for (const pr of props as (PropState & { bubbleOf?: string; baseScale?: number; anim?: PropAnim })[]) {
    if (!pr.bubbleOf) continue;
    const st = actors.get(pr.bubbleOf);
    const prop = findProp(catalog, pr.propId);
    if (!st || !prop) continue;
    const pose = findPose(catalog, st.characterId, st.poseId);
    const h = (pose?.height ?? 600) * poseScale(catalog, st.characterId, pose) * st.scale;
    const side = st.flip ? -1 : 1;
    const headTop = st.y + st.offY - h;
    const w = prop.width * (pr.baseScale ?? 1) + 120;
    const bh = prop.height * (pr.baseScale ?? 1) + 100;
    const cx = Math.max(w / 2 + 10, Math.min(1080 - w / 2 - 10, st.x + st.offX + side * 150 * st.scale));
    const cy = Math.max(bh / 2 + 10, headTop - bh / 2 - 60);
    const dx = pr.anim?.dx ?? 0;
    const dy = pr.anim?.dy ?? 0;
    pr.x = cx + dx;
    pr.y = cy + prop.height * pr.scale * 0.5 + dy; // y = base del objeto
    pr.bubble = { cx, cy, w, h: bh, tailX: st.x + st.offX + side * 40 * st.scale, tailY: headTop + 10 };
  }

  if (opts.life !== false) applyLife(take, catalog, t, actors, eyesUntil);
  // recursos de cómic: sobre la cabeza de su actor, ya con la vida aplicada
  if (screen.comicsPending) {
    for (const c of screen.comicsPending) {
      const st = c.actorUid ? actors.get(c.actorUid) : undefined;
      if (c.actorUid && (!st || st.visible <= 0)) continue;
      const pose = st ? findPose(catalog, st.characterId, st.poseId) : undefined;
      const h = st ? (pose?.height ?? 600) * poseScale(catalog, st.characterId, pose) * st.scale : 900;
      const x = st ? st.x + st.offX : 540;
      const y = st ? st.y + st.offY - h * 0.88 : 700;
      (screen.comics ??= []).push({ kind: c.kind, x, y, h, local: c.local, duration: c.duration, side: st?.flip ? -1 : 1, text: c.text });
    }
    delete screen.comicsPending;
  }
  const camera = cameraAt(take, catalog, t, actors);

  return {
    camera,
    backgroundId: take.backgroundId,
    actors: [...actors.values()].sort((a, b) => a.zIndex - b.zIndex),
    props: props.sort((a, b) => a.zIndex - b.zIndex),
    subtitles,
    screen,
    sounds,
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
