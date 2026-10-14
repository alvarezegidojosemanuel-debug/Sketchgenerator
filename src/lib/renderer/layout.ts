import type { Catalog, Pose } from "@/lib/catalog/types";
import { findBackground, findExpression, findPose, findProp, mouthFor } from "@/lib/catalog";
import type { ActorState, FrameState, PropState } from "@/lib/timeline/evaluate";

/**
 * Traduce un FrameState a capas posicionadas en el lienzo 1080×1920
 * (independiente de React/DOM para poder probarlo y reutilizarlo en Canvas).
 */
export interface ActorLayout {
  uid: string;
  z: number;
  pose: Pose | undefined;
  /** Esquina superior izquierda del contenedor de la pose, en px del lienzo. */
  left: number;
  top: number;
  scale: number;
  flip: boolean;
  face?: { src: string; left: number; top: number; width: number; height: number };
  mouth?: { src: string; left: number; top: number; width: number; height: number };
  eyes: { cx: number; cy: number; px: number; py: number }[];
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

function layoutActor(catalog: Catalog, a: ActorState): ActorLayout {
  const pose = findPose(catalog, a.characterId, a.poseId);
  const pw = pose?.width ?? 400;
  const ph = pose?.height ?? 900;
  const anchors = pose?.anchors ?? {};
  const out: ActorLayout = {
    uid: a.uid,
    z: Z.actors + a.zIndex,
    pose,
    left: a.x - pw / 2,
    top: a.y - ph,
    scale: a.scale,
    flip: a.flip,
    eyes: [],
    speaking: a.speaking,
  };
  const expr = a.expressionId ? findExpression(catalog, a.characterId, a.expressionId) : undefined;
  if (expr?.src) {
    const ew = expr.width ?? 240;
    const eh = expr.height ?? 240;
    const fx = (anchors.face?.x ?? 0.5) * pw;
    const fy = (anchors.face?.y ?? 0.19) * ph;
    out.face = { src: expr.src, left: fx - ew / 2, top: fy - eh / 2, width: ew, height: eh };
  }
  for (const eye of [anchors.eyeL, anchors.eyeR]) {
    if (!eye) continue;
    out.eyes.push({ cx: eye.x * pw, cy: eye.y * ph, px: eye.x * pw + a.gazeX * 8, py: eye.y * ph + a.gazeY * 6 });
  }
  const m = mouthFor(catalog, a.mouthOpen ? "open" : "closed");
  if (m) {
    // Anclaje del catálogo (auto) o fallback manual cuando la pose no lo trae.
    const mx = (anchors.mouth?.x ?? 0.5) * pw + a.mouthDx;
    const my = (anchors.mouth?.y ?? 0.25) * ph + a.mouthDy;
    out.mouth = { src: m.src, left: mx - m.width / 2, top: my - m.height / 2, width: m.width, height: m.height };
  }
  return out;
}

export function layoutFrame(catalog: Catalog, frame: FrameState): StageLayout {
  return {
    background: frame.backgroundId ? findBackground(catalog, frame.backgroundId)?.src : undefined,
    propsBack: frame.props.filter((p) => p.layer === "props-back").map((p) => layoutProp(catalog, p, Z.propsBack)).filter((x): x is PropLayout => !!x),
    actors: frame.actors.map((a) => layoutActor(catalog, a)),
    propsFront: frame.props.filter((p) => p.layer === "props-front").map((p) => layoutProp(catalog, p, Z.propsFront)).filter((x): x is PropLayout => !!x),
  };
}
