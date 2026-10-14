import type { Character, ExpressionPrefab, FaceAsset, FaceSlot, PartRef, Pose, SlotTransform } from "@/lib/catalog/types";
import { findFaceAsset } from "@/lib/catalog";

/**
 * Capa facial resuelta, en píxeles de la imagen de la pose.
 * El contenedor (left, top, width, height) recorta la región del asset;
 * la imagen interior se desplaza `imgLeft` y conserva su tamaño original
 * (nunca se deforma: solo traslación, escala uniforme, rotación y espejo).
 */
export interface FaceLayer {
  slot: FaceSlot;
  assetId: string;
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  imgLeft: number;
  imgWidth: number;
  imgHeight: number;
  originX: number;
  originY: number;
  scale: number;
  rot: number;
  flip: boolean;
  /** Recorte elíptico [rx, ry, cx, cy] en px del lienzo de la pieza (coordenadas del contenedor). */
  clip?: [number, number, number, number];
  feather?: boolean;
}

export interface FaceInput {
  character: Character;
  pose: Pose;
  expression: ExpressionPrefab | undefined;
  /** Boca a usar este frame (lip-sync); si falta, la de reposo del prefab. */
  mouthAssetId?: string;
  gazeX?: number;
  gazeY?: number;
  /** Ajuste manual del evento "mouth" calibrado. */
  mouthDx?: number;
  mouthDy?: number;
}

const ORDER: FaceSlot[] = ["eyeL", "eyeR", "browL", "browR", "mouth"];

/** Región del lienzo del asset que corresponde a la pieza (mitad izq/der para piezas dobles). */
export function partRegion(a: FaceAsset, crop: PartRef["crop"]) {
  const half = a.width / 2;
  const x0 = crop === "right" ? half : 0;
  const x1 = crop === "left" ? half : a.width;
  // Ancla calculada al importar (centro del cristal, labio superior...) o centro del contenido visible.
  const given = crop ? a.anchors?.[crop] : a.anchors?.full;
  if (given) return { x0, x1, anchorX: given[0], anchorY: given[1] };
  const [bx0, by0, bx1, by1] = a.bbox;
  const cx0 = Math.max(x0, bx0);
  const cx1 = Math.min(x1, bx1);
  const anchorX = cx1 > cx0 ? (cx0 + cx1) / 2 : (x0 + x1) / 2;
  const anchorY = (by0 + by1) / 2;
  return { x0, x1, anchorX, anchorY };
}

/** Pieza que corresponde a un slot según el prefab (con boca de lip-sync si procede). */
export function partFor(e: ExpressionPrefab | undefined, slot: FaceSlot, mouthAssetId?: string): PartRef | null | undefined {
  if (!e) return undefined;
  if (slot === "mouth") return mouthAssetId ? { ...e.mouth, assetId: mouthAssetId } : e.mouth;
  return e[slot];
}

export function effectiveSlot(pose: Pose, e: ExpressionPrefab | undefined, slot: FaceSlot): SlotTransform | undefined {
  const base = pose.rig?.[slot];
  if (!base) return undefined;
  const adj = e?.poseOverrides?.[pose.id]?.[slot];
  return {
    x: base.x + (adj?.dx ?? 0),
    y: base.y + (adj?.dy ?? 0),
    scale: base.scale * (adj?.dscale ?? 1),
    rot: (base.rot ?? 0) + (adj?.rot ?? 0),
    ...(base.clip ? { clip: base.clip } : {}),
  };
}

export function layoutFace(input: FaceInput): FaceLayer[] {
  const { character, pose, expression } = input;
  const layers: FaceLayer[] = [];
  for (const slot of ORDER) {
    const part = partFor(expression, slot, input.mouthAssetId);
    if (!part) continue;
    const asset = findFaceAsset(character, part.assetId);
    const st = effectiveSlot(pose, expression, slot);
    if (!asset || !st) continue;
    const reg = partRegion(asset, part.crop);
    let x = st.x + (part.dx ?? 0);
    let y = st.y + (part.dy ?? 0);
    if (slot === "eyeL" || slot === "eyeR") {
      x += (input.gazeX ?? 0) * 5;
      y += (input.gazeY ?? 0) * 3;
    }
    if (slot === "mouth") {
      x += input.mouthDx ?? 0;
      y += input.mouthDy ?? 0;
    }
    const originX = reg.anchorX - reg.x0;
    const originY = reg.anchorY;
    const scale = (st.scale * (part.dscale ?? 1)) / (asset.normScale ?? 1);
    layers.push({
      slot,
      assetId: asset.id,
      src: asset.src,
      left: x - originX,
      top: y - originY,
      width: reg.x1 - reg.x0,
      height: asset.height,
      imgLeft: reg.x0 ? -reg.x0 : 0,
      imgWidth: asset.width,
      imgHeight: asset.height,
      originX,
      originY,
      scale,
      rot: (st.rot ?? 0) + (part.rot ?? 0),
      flip: Boolean(part.flip),
      ...(st.clip
        ? {
            clip: [
              st.clip[0] / scale,
              st.clip[1] / scale,
              originX + ((part.flip ? -1 : 1) * (st.clip[2] ?? 0)) / scale,
              originY + (st.clip[3] ?? 0) / scale,
            ] as [number, number, number, number],
          }
        : {}),
      ...(asset.feather ? { feather: true } : {}),
    });
  }
  return layers;
}

/** Transformación CSS de una capa facial (alrededor de su punto de anclaje). */
export function faceLayerTransform(l: FaceLayer): string {
  return `scale(${l.flip ? -l.scale : l.scale}, ${l.scale}) rotate(${l.flip ? -l.rot : l.rot}deg)`;
}
