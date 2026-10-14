"use client";

import { useRef } from "react";
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
  /** Ancho en px de pantalla. */
  size: number;
  /** Fracción del ancho de la pose que se muestra (zoom). */
  view?: number;
  highlight?: FaceSlot | null;
  /** Arrastre en coordenadas de la pose. */
  onDrag?: (dx: number, dy: number) => void;
  gazeX?: number;
  gazeY?: number;
}

/** Primer plano de la cabeza (pose + capas faciales) para miniaturas y para calibrar. */
export function HeadPreview({ catalog, characterId, poseId, expressionId, mouthAssetId, size, view = 0.85, highlight, onDrag, gazeX = 0, gazeY = 0 }: Props) {
  const pose = findPose(catalog, characterId, poseId);
  const last = useRef<{ x: number; y: number } | null>(null);
  if (!pose) return <div className="head-preview" style={{ width: size, height: size }} />;
  const state: ActorState = {
    uid: "preview", characterId, poseId, x: pose.width / 2, y: pose.height, scale: 1 / pose.displayScale, flip: false, zIndex: 0,
    expressionId, gazeX, gazeY, speaking: false, mouthOpen: Boolean(mouthAssetId), mouthAssetId, mouthMode: "auto", mouthDx: 0, mouthDy: 0,
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
      className="head-preview"
      style={{ width: size, height: size, touchAction: onDrag ? "none" : undefined }}
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
