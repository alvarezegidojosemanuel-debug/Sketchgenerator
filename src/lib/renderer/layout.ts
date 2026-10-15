import type { Catalog, Pose } from "@/lib/catalog/types";
import { findBackground, findCharacter, findExpression, findPose, findProp } from "@/lib/catalog";
import type { ActorState, FrameState, PropState } from "@/lib/timeline/evaluate";
import { layoutFace, type FaceLayer } from "./face";

/**
 * Traduce un FrameState a capas posicionadas en el lienzo 1080×1920
 * (independiente de React/DOM). Profundidad: fondo, props-back, actores, props-front.
 */
export interface ActorLayout {
  uid: string;
  z: number;
  pose: Pose | undefined;
  /** Esquina superior izquierda de la imagen de la pose, en px del lienzo (antes de escalar). */
  left: number;
  top: number;
  /** Escala total = escala del actor × displayScale de la pose. */
  scale: number;
  flip: boolean;
  face: FaceLayer[];
  speaking: boolean;
  /** Opacidad del actor (fundido de pose). */
  opacity: number;
  /** Cara anterior en fundido de expresión (debajo, desvaneciéndose). */
  faceFrom?: FaceLayer[];
  faceMix: number;
  /** Pose anterior en fundido (se dibuja debajo con opacidad 1 - opacity). */
  ghost?: ActorLayout;
}

export interface PropLayout {
  key: string;
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  z: number;
  rot: number;
  opacity: number;
  flip: boolean;
  bubble?: { cx: number; cy: number; w: number; h: number; tailX: number; tailY: number };
}

export interface StageLayout {
  screen: FrameState["screen"];
  background?: string;
  propsBack: PropLayout[];
  actors: ActorLayout[];
  propsFront: PropLayout[];
}

const Z = { background: 0, propsBack: 100, actors: 1000, propsFront: 5000 } as const;

function layoutProp(catalog: Catalog, p: PropState, base: number): PropLayout | null {
  const prop = findProp(catalog, p.propId);
  if (!prop) return null;
  const w = prop.width * p.scale;
  const h = prop.height * p.scale;
  return { key: p.key, src: prop.src, left: p.x - w / 2, top: p.y - h, width: w, height: h, z: base + p.zIndex, rot: p.rot, opacity: p.opacity, flip: p.flip, bubble: p.bubble };
}

export function layoutActor(catalog: Catalog, a: ActorState): ActorLayout {
  const main = layoutActorPose(catalog, a);
  if (a.prevPoseId && a.poseMix < 1) {
    // Fundido sin transparencia en el centro: cada pose se mantiene opaca la mitad del fundido.
    main.opacity = Math.min(1, 2 * a.poseMix);
    main.ghost = { ...layoutActorPose(catalog, { ...a, poseId: a.prevPoseId, prevPoseId: undefined }), opacity: Math.min(1, 2 * (1 - a.poseMix)) * a.visible };
  }
  main.opacity *= a.visible;
  return main;
}

function layoutActorPose(catalog: Catalog, a: ActorState): ActorLayout {
  const ch = findCharacter(catalog, a.characterId);
  const pose = findPose(catalog, a.characterId, a.poseId);
  const pw = pose?.width ?? 400;
  const ph = pose?.height ?? 600;
  const expression = a.expressionId ? findExpression(catalog, a.characterId, a.expressionId) : undefined;
  return {
    uid: a.uid,
    z: Z.actors + a.zIndex,
    pose,
    left: a.x + a.offX - pw / 2,
    top: a.y + a.offY - ph,
    scale: a.scale * (pose?.displayScale ?? 1) * a.presenceScale,
    flip: a.flip,
    speaking: a.speaking,
    opacity: 1,
    faceMix: a.prevExpressionId && a.exprMix < 1 ? a.exprMix : 1,
    faceFrom:
      ch && pose && a.prevExpressionId && a.exprMix < 1
        ? layoutFace({ character: ch, pose, expression: findExpression(catalog, a.characterId, a.prevExpressionId), gazeX: a.gazeX, gazeY: a.gazeY, mouthDx: a.mouthDx, mouthDy: a.mouthDy })
        : undefined,
    face:
      ch && pose
        ? layoutFace({
            character: ch,
            pose,
            expression,
            mouthAssetId: a.mouthAssetId,
            gazeX: a.gazeX,
            gazeY: a.gazeY,
            mouthDx: a.mouthDx,
            mouthDy: a.mouthDy,
          })
        : [],
  };
}

/** showHidden: en edición, los actores fuera de escena se ven como fantasmas para poder colocarlos. */
export function layoutFrame(catalog: Catalog, frame: FrameState, opts: { showHidden?: boolean } = {}): StageLayout {
  return {
    screen: frame.screen,
    background: frame.backgroundId ? findBackground(catalog, frame.backgroundId)?.src : undefined,
    propsBack: frame.props.filter((p) => p.layer === "props-back").map((p) => layoutProp(catalog, p, Z.propsBack)).filter((x): x is PropLayout => !!x),
    actors: frame.actors
      .filter((a) => a.visible > 0 || opts.showHidden)
      .map((a) => layoutActor(catalog, opts.showHidden ? { ...a, visible: Math.max(0.25, a.visible), presenceScale: a.visible > 0 ? a.presenceScale : 1 } : a)),
    propsFront: frame.props.filter((p) => p.layer === "props-front").map((p) => layoutProp(catalog, p, Z.propsFront)).filter((x): x is PropLayout => !!x),
  };
}
