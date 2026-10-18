"use client";

import { useEffect, useRef, useState } from "react";
import type { Pose } from "@/lib/catalog/types";
import type { PocketState } from "./usePocket";

/**
 * Dar boca a una pose: se toca dónde está la boca y se dibuja una boca abierta encima (o se sube la imagen de la
 * misma pose con la boca abierta). Se guarda como «versión hablando» de la pose: al hablar, alterna entre las dos.
 */
type Shape = "ovalo" | "sonrisa" | "grito";
interface Mouth {
  x: number; // 0–1 sobre la imagen
  y: number;
  w: number; // ancho, en fracción del ancho de la imagen
  h: number; // alto / ancho
  rot: number;
  shape: Shape;
  tongue: boolean;
}

function drawMouth(ctx: CanvasRenderingContext2D, W: number, H: number, m: Mouth) {
  const w = m.w * W;
  const h = w * m.h;
  ctx.save();
  ctx.translate(m.x * W, m.y * H);
  ctx.rotate((m.rot * Math.PI) / 180);
  ctx.beginPath();
  if (m.shape === "sonrisa") {
    // media luna abierta (como una «D» tumbada): arriba recto, abajo curvo
    ctx.moveTo(-w / 2, -h * 0.25);
    ctx.quadraticCurveTo(0, -h * 0.4, w / 2, -h * 0.25);
    ctx.bezierCurveTo(w * 0.45, h * 0.75, -w * 0.45, h * 0.75, -w / 2, -h * 0.25);
  } else if (m.shape === "grito") {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(0, 0, w / 2, h / 2.6, 0, 0, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fillStyle = "#3b0b12";
  ctx.fill();
  if (m.tongue) {
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(0, h * 0.42, w * 0.34, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#e2575f";
    ctx.fill();
    ctx.restore();
  }
  ctx.lineWidth = Math.max(2, w * 0.07);
  ctx.strokeStyle = "#111";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("no se pudo cargar la imagen"));
    img.src = src;
  });
}

export function MouthEditor({ s, pose, charName, onClose }: { s: PocketState; pose: Pose; charName: string; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [m, setM] = useState<Mouth>({ x: 0.5, y: 0.3, w: 0.08, h: 0.7, rot: 0, shape: "sonrisa", tongue: true });
  const [placed, setPlaced] = useState(false);
  const [open, setOpen] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const mine = s.library.find((x) => x.id === `talk:${pose.id}`);
  const hasTalk = !!pose.talkSrc && pose.talkSrc !== pose.src;

  // la imagen original (sin la boca de este dispositivo)
  const original = pose.src;
  useEffect(() => {
    let alive = true;
    loadImage(original).then((i) => alive && setImg(i)).catch(() => setMsg("No se pudo cargar la pose."));
    return () => { alive = false; };
  }, [original]);

  // parpadeo abierta/cerrada para ver cómo queda hablando
  useEffect(() => {
    const h = setInterval(() => setOpen((o) => !o), 260);
    return () => clearInterval(h);
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !img) return;
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0);
    if (placed && open) drawMouth(ctx, cv.width, cv.height, m);
  }, [img, m, placed, open]);

  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setM((o) => ({ ...o, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }));
    setPlaced(true);
  };

  const store = async (blob: Blob) => {
    await s.saveLibraryItem({ id: `talk:${pose.id}`, kind: "talk", label: `${charName} · ${pose.key} (boca)`, blob, width: img?.naturalWidth ?? 0, height: img?.naturalHeight ?? 0, createdAt: Date.now() });
    setMsg("¡Guardado! Esta pose ya mueve la boca al hablar.");
  };
  const saveDrawn = async () => {
    if (!img) return;
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    drawMouth(ctx, cv.width, cv.height, m);
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
    if (blob) await store(blob);
  };
  const upload = async (f?: File) => {
    if (!f || !img) return;
    // se ajusta al tamaño de la pose (para que encaje encima al hablar)
    const up = await loadImage(URL.createObjectURL(f));
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    cv.getContext("2d")!.drawImage(up, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
    if (blob) await store(blob);
  };
  const set = (k: keyof Mouth, v: number | string | boolean) => setM((o) => ({ ...o, [k]: v }));

  return (
    <div className="mouth-edit" ref={box} style={{ scrollMarginTop: 70 }}>
      <div className="g-props-head">
        <h2>👄 Dar boca · {pose.key.replace(/^pose_[hp]_/, "")}</h2>
        <button type="button" className="btn btn-small btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
      {hasTalk && !mine && <p className="fine">Esta pose ya tiene boca dibujada. Si haces otra aquí, en este dispositivo se usará la tuya.</p>}
      <div className="mouth-body">
        <canvas ref={canvas} className="mouth-canvas" onPointerDown={tap} />
        <div className="g-form">
          <p className="fine">{placed ? "Ajusta la boca. Se ve abriéndose y cerrándose como al hablar." : "1 · Toca en la imagen dónde está la boca."}</p>
          {placed && (
            <>
              <div className="chips">
                {(["sonrisa", "ovalo", "grito"] as Shape[]).map((sh) => (
                  <button key={sh} type="button" className={`chip${m.shape === sh ? " on" : ""}`} onClick={() => set("shape", sh)}>
                    {sh === "sonrisa" ? "😃 Sonrisa abierta" : sh === "ovalo" ? "😮 Óvalo" : "😱 Grito"}
                  </button>
                ))}
              </div>
              <label className="field"><span className="field-label">Tamaño</span><input type="range" min={0.02} max={0.3} step={0.005} value={m.w} onChange={(e) => set("w", Number(e.target.value))} /></label>
              <label className="field"><span className="field-label">Abertura</span><input type="range" min={0.25} max={1.3} step={0.02} value={m.h} onChange={(e) => set("h", Number(e.target.value))} /></label>
              <label className="field"><span className="field-label">Giro</span><input type="range" min={-40} max={40} step={1} value={m.rot} onChange={(e) => set("rot", Number(e.target.value))} /></label>
              <div className="row">
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setM((o) => ({ ...o, y: o.y - 0.004 }))}>↑</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setM((o) => ({ ...o, y: o.y + 0.004 }))}>↓</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setM((o) => ({ ...o, x: o.x - 0.004 }))}>←</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setM((o) => ({ ...o, x: o.x + 0.004 }))}>→</button>
                <label className="g-check"><input type="checkbox" checked={m.tongue} onChange={(e) => set("tongue", e.target.checked)} /> Lengua</label>
              </div>
              <button type="button" className="btn btn-primary" onClick={saveDrawn}>✓ Guardar boca</button>
            </>
          )}
          <label className="btn btn-secondary file-btn">
            ⬆ O sube la misma pose con la boca abierta
            <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {mine && (
            <button type="button" className="btn btn-ghost btn-small" onClick={async () => { await s.removeLibraryItem(mine.id); setMsg("Quitada la boca de este dispositivo."); }}>
              🗑 Quitar mi boca de esta pose
            </button>
          )}
          {msg && <p className="fine">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
