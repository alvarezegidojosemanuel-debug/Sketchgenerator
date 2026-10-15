"use client";

import { useEffect, useRef, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import type { FrameState } from "@/lib/timeline/evaluate";
import { layoutFrame, type PropLayout } from "@/lib/renderer/layout";
import { FigureBody } from "./ActorFigure";

interface Props {
  catalog: Catalog;
  frame: FrameState;
  showSubtitles?: boolean;
  /** Modo edición: permite arrastrar actores. */
  selectedUid?: string | null;
  onSelectActor?: (uid: string) => void;
  onMoveActor?: (uid: string, x: number, y: number) => void;
  maxHeight?: string;
}

const W = 1080;
const H = 1920;

export function Stage({ catalog, frame, showSubtitles = true, selectedUid, onSelectActor, onMoveActor, maxHeight = "64vh" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const drag = useRef<{ uid: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    setScale(el.clientWidth / W);
    return () => ro.disconnect();
  }, []);

  const layout = layoutFrame(catalog, frame);
  const actorState = new Map(frame.actors.map((a) => [a.uid, a]));

  const onPointerDown = (uid: string) => (e: React.PointerEvent) => {
    if (!onMoveActor && !onSelectActor) return;
    onSelectActor?.(uid);
    if (!onMoveActor) return;
    const a = actorState.get(uid);
    if (!a) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { uid, sx: e.clientX, sy: e.clientY, ox: a.x, oy: a.y };
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !onMoveActor) return;
    const nx = Math.round(d.ox + (e.clientX - d.sx) / scale);
    const ny = Math.round(d.oy + (e.clientY - d.sy) / scale);
    onMoveActor(d.uid, Math.max(-200, Math.min(W + 200, nx)), Math.max(200, Math.min(H + 100, ny)));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="stage-wrap" style={{ maxWidth: `calc(${maxHeight} * 9 / 16)` }}>
      <div ref={box} className="stage" style={{ touchAction: onMoveActor ? "none" : undefined }}>
        <div
          className="stage-canvas"
          style={{ width: W, height: H, transform: `scale(${scale})${layout.screen.shake ? ` translate(${layout.screen.shake.dx}px, ${layout.screen.shake.dy}px)` : ""}` }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {layout.background ? (
            <img className="layer" src={layout.background} alt="" draggable={false} style={{ left: 0, top: 0, width: W, height: H, zIndex: 0, objectFit: "cover" }} />
          ) : (
            <div className="layer stage-empty-bg" style={{ left: 0, top: 0, width: W, height: H }} />
          )}
          {layout.propsBack.map((p) => (
            <PropImg key={p.key} p={p} />
          ))}
          {layout.actors.flatMap((a) => (a.ghost ? [{ ...a.ghost, uid: a.uid + "__ghost", z: a.z }, a] : [a])).map((a) => {
            const pw = a.pose?.width ?? 400;
            const ph = a.pose?.height ?? 600;
            const ghost = a.uid.endsWith("__ghost");
            return (
              <div
                key={a.uid}
                data-uid={ghost ? undefined : a.uid}
                className={`layer actor${!ghost && selectedUid === a.uid ? " selected" : ""}`}
                onPointerDown={ghost ? undefined : onPointerDown(a.uid)}
                style={{
                  left: a.left,
                  top: a.top,
                  width: pw,
                  height: ph,
                  zIndex: a.z,
                  opacity: a.opacity < 1 ? a.opacity : undefined,
                  pointerEvents: ghost ? "none" : undefined,
                  transform: `scale(${a.flip ? -a.scale : a.scale}, ${a.scale})`,
                  cursor: onMoveActor ? "grab" : undefined,
                }}
              >
                <FigureBody a={a} />
              </div>
            );
          })}
          {layout.propsFront.map((p) => (
            <PropImg key={p.key} p={p} />
          ))}
          {layout.screen.darken ? <div className="layer" style={{ left: 0, top: 0, width: W, height: H, zIndex: 8000, background: "#000", opacity: layout.screen.darken }} /> : null}
          {layout.screen.flash ? (
            <div className="layer" style={{ left: 0, top: 0, width: W, height: H, zIndex: 8001, background: layout.screen.flash.color, opacity: layout.screen.flash.alpha }} />
          ) : null}
          {showSubtitles && frame.subtitles.length > 0 && (
            <div className="subtitles">
              {frame.subtitles.map((s) => (
                <p key={s.eventId}>
                  <b>{s.speaker}:</b> {s.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Objeto (con rotación, opacidad, espejo) y, si procede, su bocadillo de pensamiento. */
function PropImg({ p }: { p: PropLayout }) {
  return (
    <>
      {p.bubble && <ThoughtBubble b={p.bubble} z={p.z - 1} opacity={p.opacity} />}
      <img
        className="layer"
        src={p.src}
        alt=""
        draggable={false}
        style={{
          left: p.left,
          top: p.top,
          width: p.width,
          height: p.height,
          zIndex: p.z,
          opacity: p.opacity < 1 ? p.opacity : undefined,
          transformOrigin: "50% 60%",
          transform: p.rot || p.flip ? `rotate(${p.rot}deg) scaleX(${p.flip ? -1 : 1})` : undefined,
        }}
      />
    </>
  );
}

function ThoughtBubble({ b, z, opacity }: { b: NonNullable<PropLayout["bubble"]>; z: number; opacity: number }) {
  const pad = 30;
  const left = Math.min(b.cx - b.w / 2, b.tailX) - pad;
  const top = b.cy - b.h / 2 - pad;
  const width = Math.max(b.cx + b.w / 2, b.tailX) - left + pad;
  const height = Math.max(b.cy + b.h / 2, b.tailY) - top + pad;
  const cx = b.cx - left;
  const cy = b.cy - top;
  const rx = b.w / 2;
  const ry = b.h / 2;
  // nube: elipse principal + lóbulos alrededor
  const lobes = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { x: cx + Math.cos(a) * rx * 0.92, y: cy + Math.sin(a) * ry * 0.9, r: Math.min(rx, ry) * 0.36 };
  });
  const tx = b.tailX - left;
  const ty = b.tailY - top;
  const dots = [0.25, 0.5, 0.75].map((f, i) => ({ x: tx + (cx - tx) * f * 0.55, y: ty + (cy + ry - ty) * f * 0.85, r: 9 + i * 7 }));
  return (
    <svg className="layer" width={width} height={height} style={{ left, top, zIndex: z, opacity: opacity < 1 ? opacity : undefined, overflow: "visible" }} aria-hidden>
      <g stroke="#111" strokeWidth={7} fill="#fff">
        {lobes.map((l, i) => (
          <circle key={i} cx={l.x} cy={l.y} r={l.r} />
        ))}
        {dots.map((d, i) => (
          <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} />
        ))}
      </g>
      <g fill="#fff">
        {lobes.map((l, i) => (
          <circle key={i} cx={l.x} cy={l.y} r={l.r - 3.5} />
        ))}
        <ellipse cx={cx} cy={cy} rx={rx * 0.95} ry={ry * 0.92} />
      </g>
    </svg>
  );
}
