"use client";

import type { FaceSlot } from "@/lib/catalog/types";
import type { ActorLayout } from "@/lib/renderer/layout";
import { faceLayerTransform } from "@/lib/renderer/face";

/** Cuerpo (pose) + capas faciales en coordenadas de la imagen de la pose. */
export function FigureBody({ a, highlight }: { a: ActorLayout; highlight?: FaceSlot | null }) {
  const pw = a.pose?.width ?? 400;
  const ph = a.pose?.height ?? 600;
  return (
    <>
      {a.pose ? <img src={a.pose.src} alt="" draggable={false} width={pw} height={ph} /> : <div className="missing">?</div>}
      {a.face.map((l) => (
        <div
          key={l.slot}
          className={`face-layer${highlight === l.slot ? " hl" : ""}`}
          data-slot={l.slot}
          style={{
            left: l.left,
            top: l.top,
            width: l.width,
            height: l.height,
            transformOrigin: `${l.originX}px ${l.originY}px`,
            transform: faceLayerTransform(l),
            clipPath: l.clip ? `ellipse(${l.clip[0]}px ${l.clip[1]}px at ${l.clip[2]}px ${l.clip[3]}px)` : undefined,
          }}
        >
          <img
            src={l.src}
            alt=""
            draggable={false}
            className={l.feather ? "feather" : undefined}
            style={{ left: l.imgLeft, width: l.imgWidth, height: l.imgHeight }}
          />
        </div>
      ))}
    </>
  );
}
