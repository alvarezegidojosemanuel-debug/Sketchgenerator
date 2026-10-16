"use client";

import { useEffect, useRef, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import type { FrameState } from "@/lib/timeline/evaluate";
import { layoutFrame, type PropLayout } from "@/lib/renderer/layout";
import { FigureBody } from "./ActorFigure";
import { drawExplosion, type ExplosionState } from "@/lib/renderer/explosion";

interface Props {
  catalog: Catalog;
  frame: FrameState;
  showSubtitles?: boolean;
  /** Modo edición: permite arrastrar actores. */
  selectedUid?: string | null;
  onSelectActor?: (uid: string) => void;
  onMoveActor?: (uid: string, x: number, y: number) => void;
  maxHeight?: string;
  /** Escena que viene a continuación: se pinta invisible para que el corte no parpadee. */
  preload?: FrameState;
}

const W = 1080;
const H = 1920;

export function Stage({ catalog, frame, showSubtitles = true, selectedUid, onSelectActor, onMoveActor, maxHeight = "64vh", preload }: Props) {
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

  const layout = layoutFrame(catalog, frame, { showHidden: !!onMoveActor });
  const actorState = new Map(frame.actors.map((a) => [a.uid, a]));
  // En edición se ve siempre el plano general (para colocar y arrastrar sin zoom).
  const cam = onMoveActor || !frame.camera ? { zoom: 1, cx: W / 2, cy: H / 2 } : frame.camera;
  // Quién habla: bocadillo de cómic sobre su cabeza (en pantalla). Narrador y voces en off: subtítulo abajo.
  const toScreen = (x: number, y: number) => ({ x: (x - (cam.cx - W / 2 / cam.zoom)) * cam.zoom, y: (y - (cam.cy - H / 2 / cam.zoom)) * cam.zoom });
  const bubbles: { id: string; left: number; top: number; width: number; tailX: number; text: string }[] = [];
  const offscreen: typeof frame.subtitles = [];
  for (const sub of frame.subtitles) {
    const a = sub.actorUid ? layout.actors.find((x) => x.uid === sub.actorUid) : undefined;
    // personaje dibujado como objeto (p. ej. de espaldas en su silla): el bocadillo sale sobre esa imagen
    const asProp = !a && sub.voiceOf ? [...layout.propsFront, ...layout.propsBack].find((p) => p.src.includes(`prop_${sub.voiceOf}_`)) : undefined;
    let head: { x: number; y: number };
    if (a && a.pose) head = toScreen(a.left + a.pose.width / 2, a.top + a.pose.height * (1 - a.scale));
    else if (asProp) head = toScreen(asProp.left + asProp.width / 2, asProp.top);
    else {
      offscreen.push(sub);
      continue;
    }
    const width = Math.min(620, 140 + sub.text.length * 15);
    const lines = Math.ceil((sub.text.length * 22) / (width - 60));
    const h = 40 + lines * 50;
    const left = Math.max(24, Math.min(W - 24 - width, head.x - width / 2));
    const top = Math.max(24, head.y - h - 46 - bubbles.filter((b) => Math.abs(b.left - left) < width).length * (h + 20));
    bubbles.push({ id: sub.eventId, left, top, width, tailX: Math.max(30, Math.min(width - 60, head.x - left - 15)), text: sub.text });
  }
  const camTransform = cam.zoom > 1.001 ? `scale(${cam.zoom}) translate(${-(cam.cx - W / 2 / cam.zoom)}px, ${-(cam.cy - H / 2 / cam.zoom)}px)` : undefined;

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
          {preload && <PreloadLayer catalog={catalog} frame={preload} />}
          <div
            className="layer stage-camera"
            style={{ left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: camTransform }}
          >
          {layout.background ? (
            <img className="layer" src={layout.background} alt="" draggable={false} style={{ left: 0, top: 0, width: W, height: H, zIndex: 0, objectFit: "cover" }} />
          ) : (
            <div className="layer stage-empty-bg" style={{ left: 0, top: 0, width: W, height: H }} />
          )}
          {layout.propsBack.map((p) => (
            <PropImg key={p.key} p={p} />
          ))}
          {layout.actors
            .flatMap((a) => [
              // Cada pose es un elemento estable (clave = actor + pose): al cambiar de pose solo cambia la opacidad.
              ...(a.pre ?? []).map((x) => ({ ...x, role: "pre" as const })),
              ...(a.ghost ? [{ ...a.ghost, z: a.z, role: "ghost" as const }] : []),
              { ...a, role: "main" as const },
            ])
            .map((a) => {
            const pw = a.pose?.width ?? 400;
            const ph = a.pose?.height ?? 600;
            const ghost = a.role !== "main";
            return (
              <div
                key={`${a.uid}:${a.poseId}`}
                data-uid={ghost ? undefined : a.uid}
                className={`layer actor${!ghost && selectedUid === a.uid ? " selected" : ""}`}
                onPointerDown={ghost ? undefined : onPointerDown(a.uid)}
                style={{
                  left: a.left,
                  top: a.top,
                  width: pw,
                  height: ph,
                  zIndex: a.z,
                  // las poses «pre» van a opacidad casi cero (no cero) para que el navegador las pinte ya
                  opacity: a.role === "pre" ? 0.001 : a.opacity < 1 ? a.opacity : undefined,
                  pointerEvents: ghost ? "none" : undefined,
                  filter: layout.actorLight,
                  transform: `${a.skew ? `skewX(${a.skew.toFixed(2)}deg) ` : ""}scale(${(a.flip ? -a.scale : a.scale) * a.sx}, ${a.scale * a.sy})`,
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
          {layout.screen.explosions?.length ? <ExplosionCanvas list={layout.screen.explosions} /> : null}
          </div>
          {layout.screen.darken ? <div className="layer" style={{ left: 0, top: 0, width: W, height: H, zIndex: 8000, background: "#000", opacity: layout.screen.darken }} /> : null}
          {layout.screen.flash ? (
            <div className="layer" style={{ left: 0, top: 0, width: W, height: H, zIndex: 8001, background: layout.screen.flash.color, opacity: layout.screen.flash.alpha }} />
          ) : null}
          {layout.screen.bluescreen ? <BlueScreen b={layout.screen.bluescreen} /> : null}
          {showSubtitles && bubbles.map((b) => (
            <div key={b.id} className="speech-bubble" style={{ left: b.left, top: b.top, width: b.width }}>
              <p>{b.text}</p>
              <span className="speech-tail" style={{ left: b.tailX }} />
            </div>
          ))}
          {showSubtitles && offscreen.length > 0 && (
            <div className="subtitles">
              {offscreen.map((s) => (
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

/** Explosiones de cómic (mismo dibujo que en el MP4). */
function ExplosionCanvas({ list }: { list: ExplosionState[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const e of list) drawExplosion(ctx, e);
  });
  return <canvas ref={ref} width={W} height={H} className="layer" style={{ left: 0, top: 0, width: W, height: H, zIndex: 7000 }} />;
}

/** Escena siguiente pintada a opacidad casi cero (descodifica sus imágenes antes del corte). */
function PreloadLayer({ catalog, frame }: { catalog: Catalog; frame: FrameState }) {
  const l = layoutFrame(catalog, frame);
  return (
    <div className="layer" aria-hidden style={{ left: 0, top: 0, width: W, height: H, opacity: 0.001, pointerEvents: "none" }}>
      {l.background && <img className="layer" src={l.background} alt="" style={{ left: 0, top: 0, width: W, height: H, objectFit: "cover" }} />}
      {[...l.propsBack, ...l.propsFront].map((p) => <img key={p.key} className="layer" src={p.src} alt="" style={{ left: p.left, top: p.top, width: p.width, height: p.height }} />)}
      {l.actors.map((a) => (
        <div key={a.uid} className="layer actor" style={{ left: a.left, top: a.top, width: a.pose?.width ?? 400, height: a.pose?.height ?? 600, transform: `scale(${a.scale})` }}>
          <FigureBody a={a} />
        </div>
      ))}
    </div>
  );
}

/** Pantallazo azul a pantalla completa (estilo error de sistema). */
function BlueScreen({ b }: { b: { alpha: number; text: string } }) {
  return (
    <div className="layer bluescreen" style={{ left: 0, top: 0, width: W, height: H, zIndex: 8500, opacity: b.alpha }}>
      <div className="bluescreen-face">:(</div>
      <p className="bluescreen-text">{b.text}</p>
      <p className="bluescreen-small">Se ha producido un error y hemos tenido que reiniciar a los empleados.<br />Código de detención: PUÑETIZACIÓN_IRREVERSIBLE</p>
    </div>
  );
}

/** Objeto (con rotación, opacidad, espejo) y, si procede, su bocadillo de pensamiento. */
function PropImg({ p }: { p: PropLayout }) {
  return (
    <>
      {p.bubble && <ThoughtBubble b={p.bubble} z={p.z - 1} opacity={p.opacity} />}
      {p.altSrc && <img src={p.altSrc} alt="" aria-hidden style={{ display: "none" }} />}
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
