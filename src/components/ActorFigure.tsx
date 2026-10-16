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
      {/* sombra de contacto: «asienta» en el suelo a los personajes dibujados enteros */}
      {a.pose?.flat && <div className="contact-shadow" style={{ left: pw * 0.15, width: pw * 0.7, top: ph - pw * 0.06, height: pw * 0.12 }} />}
      {a.pose?.head && a.pose.bodySrc ? (
        <>
          <img src={a.pose.bodySrc} alt="" draggable={false} width={pw} height={ph} style={{ position: "relative" }} />
          {/* cabeza articulada: gira sobre el cuello; la boca abierta va dentro, siempre montada */}
          <div
            style={{
              position: "absolute",
              left: a.pose.head.x,
              top: a.pose.head.y + a.headDy,
              width: a.pose.head.w,
              height: a.pose.head.h,
              transformOrigin: `${a.pose.head.px}px ${a.pose.head.py}px`,
              transform: a.headRot ? `rotate(${a.headRot.toFixed(2)}deg)` : undefined,
            }}
          >
            <img src={a.pose.head.src} alt="" draggable={false} width={a.pose.head.w} height={a.pose.head.h} style={{ position: "absolute", left: 0, top: 0 }} />
            {a.pose.head.talkSrc && <img src={a.pose.head.talkSrc} alt="" draggable={false} width={a.pose.head.w} height={a.pose.head.h} style={{ position: "absolute", left: 0, top: 0, opacity: a.talkOpen ? 1 : 0.001 }} />}
          </div>
        </>
      ) : (
        <>
          {a.pose ? <img src={a.pose.src} alt="" draggable={false} width={pw} height={ph} style={a.pose.flat ? { position: "relative" } : undefined} /> : <div className="missing">?</div>}
          {/* boca abierta siempre montada (casi invisible) para que al hablar no parpadee */}
          {a.pose?.talkSrc && <img src={a.pose.talkSrc} alt="" draggable={false} width={pw} height={ph} style={{ position: "absolute", left: 0, top: 0, opacity: a.talkOpen ? 1 : 0.001 }} />}
        </>
      )}
      {a.faceFrom && <FaceLayers layers={a.faceFrom} opacity={1 - a.faceMix} />}
      <FaceLayers layers={a.face} opacity={a.faceMix} highlight={highlight} />
    </>
  );
}

function FaceLayers({ layers, opacity, highlight }: { layers: ActorLayout["face"]; opacity: number; highlight?: FaceSlot | null }) {
  return (
    <>
      {layers.map((l) => (
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
            opacity: opacity < 1 ? opacity : undefined,
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
