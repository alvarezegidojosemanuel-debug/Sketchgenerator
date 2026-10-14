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
}

export interface PropLayout {
  key: string;
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  z: number;
}

export interface StageLayout {
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
  return { key: p.key, src: prop.src, left: p.x - w / 2, top: p.y - h, width: w, height: h, z: base + p.zIndex };
}

export function layoutActor(catalog: Catalog, a: ActorState): ActorLayout {
  const ch = findCharacter(catalog, a.characterId);
  const pose = findPose(catalog, a.characterId, a.poseId);
  const pw = pose?.width ?? 400;
  const ph = pose?.height ?? 600;
  const expression = a.expressionId ? findExpression(catalog, a.characterId, a.expressionId) : undefined;
  return {
    uid: a.uid,
    z: Z.actors + a.zIndex,
    pose,
    left: a.x - pw / 2,
    top: a.y - ph,
    scale: a.scale * (pose?.displayScale ?? 1),
    flip: a.flip,
    speaking: a.speaking,
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

export function layoutFrame(catalog: Catalog, frame: FrameState): StageLayout {
  return {
    background: frame.backgroundId ? findBackground(catalog, frame.backgroundId)?.src : undefined,
    propsBack: frame.props.filter((p) => p.layer === "props-back").map((p) => layoutProp(catalog, p, Z.propsBack)).filter((x): x is PropLayout => !!x),
    actors: frame.actors.map((a) => layoutActor(catalog, a)),
    propsFront: frame.props.filter((p) => p.layer === "props-front").map((p) => layoutProp(catalog, p, Z.propsFront)).filter((x): x is PropLayout => !!x),
  };
}
