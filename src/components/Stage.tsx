"use client";

import { useEffect, useRef, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import type { FrameState } from "@/lib/timeline/evaluate";
import { layoutFrame } from "@/lib/renderer/layout";

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
        <div className="stage-canvas" style={{ width: W, height: H, transform: `scale(${scale})` }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {layout.background ? (
            <img className="layer" src={layout.background} alt="" draggable={false} style={{ left: 0, top: 0, width: W, height: H, zIndex: 0 }} />
          ) : (
            <div className="layer stage-empty-bg" style={{ left: 0, top: 0, width: W, height: H }} />
          )}
          {layout.propsBack.map((p) => (
            <img key={p.key} className="layer" src={p.src} alt="" draggable={false} style={{ left: p.left, top: p.top, width: p.width, height: p.height, zIndex: p.z }} />
          ))}
          {layout.actors.map((a) => {
            const pw = a.pose?.width ?? 400;
            const ph = a.pose?.height ?? 900;
            return (
              <div
                key={a.uid}
                className={`layer actor${selectedUid === a.uid ? " selected" : ""}`}
                onPointerDown={onPointerDown(a.uid)}
                style={{
                  left: a.left,
                  top: a.top,
                  width: pw,
                  height: ph,
                  zIndex: a.z,
                  transform: `scale(${a.flip ? -a.scale : a.scale}, ${a.scale})`,
                  cursor: onMoveActor ? "grab" : undefined,
                }}
              >
                {a.pose ? <img src={a.pose.src} alt="" draggable={false} width={pw} height={ph} /> : <div className="missing">?</div>}
                {a.eyes.length > 0 && (
                  <svg className="layer" width={pw} height={ph} style={{ left: 0, top: 0 }} aria-hidden>
                    {a.eyes.map((e, i) => (
                      <g key={i}>
                        <circle cx={e.cx} cy={e.cy} r={17} fill="#fff" stroke="#1f1308" strokeWidth={3} />
                        <circle cx={e.px} cy={e.py} r={8} fill="#1f1308" />
                      </g>
                    ))}
                  </svg>
                )}
                {a.face && <img className="layer" src={a.face.src} alt="" draggable={false} style={{ left: a.face.left, top: a.face.top, width: a.face.width, height: a.face.height }} />}
                {a.mouth && <img className="layer" src={a.mouth.src} alt="" draggable={false} style={{ left: a.mouth.left, top: a.mouth.top, width: a.mouth.width, height: a.mouth.height }} />}
              </div>
            );
          })}
          {layout.propsFront.map((p) => (
            <img key={p.key} className="layer" src={p.src} alt="" draggable={false} style={{ left: p.left, top: p.top, width: p.width, height: p.height, zIndex: p.z }} />
          ))}
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
