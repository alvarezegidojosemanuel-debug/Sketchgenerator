"use client";
import { opaqueBounds, removeBackground } from "./image";

async function bitmapOf(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

/**
 * Prepara una imagen de objeto: quita el fondo (opcional), recorta márgenes y limita a 1024 px.
 * Devuelve PNG + proporción.
 */
export async function processPropImage(file: Blob, opts: { removeBg: boolean }): Promise<{ blob: Blob; aspect: number; removedBg: boolean }> {
  const bmp = await bitmapOf(file);
  const max = 1024;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const removed = opts.removeBg ? removeBackground(img.data, w, h) : 0;
  const b = opaqueBounds(img.data, w, h) ?? { x: 0, y: 0, w, h };
  ctx.putImageData(img, 0, 0);
  const out = document.createElement("canvas");
  out.width = b.w;
  out.height = b.h;
  out.getContext("2d")!.drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  const blob = await new Promise<Blob>((res) => out.toBlob((x) => res(x!), "image/png"));
  return { blob, aspect: b.w / b.h, removedBg: removed > 0 };
}

/** Escenario: se recorta/escala a 1080×1920 (vertical) y se guarda en JPEG de buena calidad. */
export async function processBackground(file: Blob): Promise<Blob> {
  const bmp = await bitmapOf(file);
  const W = 1080;
  const H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const k = Math.max(W / bmp.width, H / bmp.height);
  const dw = bmp.width * k;
  const dh = bmp.height * k;
  c.getContext("2d")!.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return new Promise<Blob>((res) => c.toBlob((x) => res(x!), "image/jpeg", 0.9));
}

export async function audioDuration(file: Blob): Promise<number> {
  const ctx = new AudioContext();
  try {
    const a = await ctx.decodeAudioData(await file.arrayBuffer());
    return Math.round(a.duration * 100) / 100;
  } finally {
    void ctx.close();
  }
}
