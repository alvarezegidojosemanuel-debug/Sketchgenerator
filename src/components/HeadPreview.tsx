"use client";

import { useEffect, useRef, useState } from "react";
import type { Catalog, FaceSlot } from "@/lib/catalog/types";
import { findPose } from "@/lib/catalog";
import { layoutActor } from "@/lib/renderer/layout";
import type { ActorState } from "@/lib/timeline/evaluate";
import { FigureBody } from "./ActorFigure";

interface Props {
  catalog: Catalog;
  characterId: string;
  poseId: string;
  expressionId: string;
  mouthAssetId?: string;
  /** Ancho en px de pantalla (si fluid, se mide el contenedor real). */
  size: number;
  fluid?: boolean;
  /** Fracción del ancho de la pose que se muestra (zoom). */
  view?: number;
  highlight?: FaceSlot | null;
  /** Arrastre en coordenadas de la pose. */
  onDrag?: (dx: number, dy: number) => void;
  gazeX?: number;
  gazeY?: number;
}

/** Primer plano de la cabeza (pose + capas faciales) para miniaturas y para calibrar. */
export function HeadPreview({ catalog, characterId, poseId, expressionId, mouthAssetId, size: fixedSize, fluid, view = 0.85, highlight, onDrag, gazeX = 0, gazeY = 0 }: Props) {
  const pose = findPose(catalog, characterId, poseId);
  const last = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!fluid || !el) return;
    const ro = new ResizeObserver(() => setMeasured(el.clientWidth || null));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fluid]);
  const size = fluid && measured ? measured : fixedSize;
  if (!pose) return <div className="head-preview" style={{ width: size, height: size }} />;
  const state: ActorState = {
    uid: "preview", characterId, poseId, x: pose.width / 2, y: pose.height, scale: 1 / pose.displayScale, flip: false, zIndex: 0,
    expressionId, gazeX, gazeY, speaking: false, mouthOpen: Boolean(mouthAssetId), mouthAssetId, mouthMode: "auto", mouthDx: 0, mouthDy: 0, poseMix: 1, exprMix: 1, offX: 0, offY: 0,
  };
  const lay = layoutActor(catalog, state);
  const slots = Object.values(pose.rig ?? {}).filter((v): v is { x: number; y: number; scale: number } => typeof v === "object" && v !== null && "x" in v);
  const cx = slots.length ? slots.reduce((a, s) => a + s.x, 0) / slots.length : pose.width / 2;
  const cy = slots.length ? slots.reduce((a, s) => a + s.y, 0) / slots.length : pose.height * 0.25;
  const boxW = pose.width * view;
  const k = size / boxW;
  const tx = -(cx - boxW / 2) * k;
  const ty = -(cy - boxW / 2) * k;
  return (
    <div
      ref={box}
      className="head-preview"
      style={{ width: fluid ? "100%" : size, height: fluid ? undefined : size, aspectRatio: fluid ? "1" : undefined, touchAction: onDrag ? "none" : undefined }}
      onPointerDown={(e) => {
        if (!onDrag) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!onDrag || !last.current) return;
        const dx = (e.clientX - last.current.x) / k;
        const dy = (e.clientY - last.current.y) / k;
        last.current = { x: e.clientX, y: e.clientY };
        if (dx || dy) onDrag(dx, dy);
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    >
      <div className="head-inner" style={{ width: pose.width, height: pose.height, transform: `translate(${tx}px, ${ty}px) scale(${k})` }}>
        <FigureBody a={{ ...lay, left: 0, top: 0 }} highlight={highlight} />
      </div>
    </div>
  );
}
