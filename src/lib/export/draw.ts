/**
 * Dibuja un fotograma en un lienzo 2D de 1080×1920, replicando lo que pinta <Stage> en pantalla
 * (fondo, objetos, personajes con sus capas de cara, efectos, cámara y bocadillos).
 */
import type { Catalog } from "@/lib/catalog/types";
import type { FrameState } from "@/lib/timeline/evaluate";
import { layoutFrame, type ActorLayout, type PropLayout } from "@/lib/renderer/layout";
import type { FaceLayer } from "@/lib/renderer/face";
import { drawExplosion } from "@/lib/renderer/explosion";
import { drawComic } from "@/lib/renderer/comic";

export const W = 1080;
export const H = 1920;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type ImageMap = Map<string, CanvasImageSource & { width: number; height: number }>;

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

export function drawFrame(ctx: Ctx, catalog: Catalog, frame: FrameState, images: ImageMap) {
  const layout = layoutFrame(catalog, frame);
  const cam = frame.camera ?? { zoom: 1, cx: W / 2, cy: H / 2 };
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (layout.screen.shake) ctx.translate(layout.screen.shake.dx, layout.screen.shake.dy);

  // --- escena (con cámara)
  ctx.save();
  if (cam.zoom > 1.001) {
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-(cam.cx - W / 2 / cam.zoom), -(cam.cy - H / 2 / cam.zoom));
  }
  const bg = layout.background ? images.get(layout.background) : undefined;
  if (bg) drawCover(ctx, bg, W, H);
  else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2a2540");
    g.addColorStop(1, "#15121f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  type Item = { z: number; draw: () => void };
  const items: Item[] = [];
  for (const p of [...layout.propsBack, ...layout.propsFront]) items.push({ z: p.z, draw: () => drawProp(ctx, p, images) });
  const lit = (fn: () => void) => () => {
    if (!layout.actorLight) return fn();
    ctx.save();
    ctx.filter = layout.actorLight;
    fn();
    ctx.restore();
  };
  for (const a of layout.actors) {
    if (a.ghost) items.push({ z: a.z - 0.1, draw: lit(() => drawActor(ctx, a.ghost!, images)) });
    if (a.turn) items.push({ z: a.z - 0.05, draw: lit(() => drawActor(ctx, a.turn!, images)) });
    items.push({ z: a.z, draw: lit(() => drawActor(ctx, a, images)) });
  }
  items.sort((x, y) => x.z - y.z).forEach((i) => i.draw());
  for (const ex of layout.screen.explosions ?? []) drawExplosion(ctx, ex);
  for (const c of layout.screen.comics ?? []) drawComic(ctx, c);
  ctx.restore();

  // --- capas de pantalla
  if (layout.screen.darken) {
    ctx.globalAlpha = layout.screen.darken;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (layout.screen.flash) {
    ctx.globalAlpha = layout.screen.flash.alpha;
    ctx.fillStyle = layout.screen.flash.color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (layout.screen.bluescreen) drawBlueScreen(ctx, layout.screen.bluescreen);
  drawSpeech(ctx, frame, layout, cam);
  ctx.restore();
}

function drawCover(ctx: Ctx, img: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawProp(ctx: Ctx, p: PropLayout, images: ImageMap) {
  if (p.opacity < 0.01) return;
  if (p.bubble) drawThoughtBubble(ctx, p.bubble, p.opacity);
  const img = images.get(p.src);
  if (!img) return;
  ctx.save();
  ctx.globalAlpha = p.opacity;
  // transform-origin: 50% 60%
  const ox = p.left + p.width * 0.5;
  const oy = p.top + p.height * 0.6;
  ctx.translate(ox, oy);
  if (p.rot) ctx.rotate((p.rot * Math.PI) / 180);
  if (p.flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -p.width * 0.5, -p.height * 0.6, p.width, p.height);
  ctx.restore();
}

function drawActor(ctx: Ctx, a: ActorLayout, images: ImageMap) {
  if (a.opacity < 0.01 || !a.pose) return;
  const pw = a.pose.width;
  const ph = a.pose.height;
  ctx.save();
  ctx.globalAlpha = Math.min(1, a.opacity);
  // .actor: transform-origin 50% 100%; scale(±s, s)
  ctx.translate(a.left + pw / 2, a.top + ph);
  if (a.rot) ctx.rotate((a.rot * Math.PI) / 180);
  // igual que el CSS «skewX() scale()» con origen en los pies
  if (a.skew) ctx.transform(1, 0, Math.tan((a.skew * Math.PI) / 180), 1, 0, 0);
  if (a.flipV) ctx.translate(0, -ph * a.scale * a.sy);
  ctx.scale((a.flip ? -a.scale : a.scale) * a.sx, (a.flipV ? -1 : 1) * a.scale * a.sy);
  ctx.translate(-pw / 2, -ph);
  if (a.pose.flat) {
    // sombra de contacto (igual que .contact-shadow en el escenario)
    const g = ctx.createRadialGradient(pw / 2, ph, 0, pw / 2, ph, pw * 0.35);
    g.addColorStop(0, "rgba(0,0,0,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(pw / 2, ph);
    ctx.scale(1, 0.17);
    ctx.translate(-pw / 2, -ph);
    ctx.fillStyle = g;
    ctx.fillRect(pw * 0.15, ph - pw * 0.35, pw * 0.7, pw * 0.7);
    ctx.restore();
  }
  const hd = a.pose.head && a.pose.bodySrc ? a.pose.head : undefined;
  const body = images.get(hd ? a.pose.bodySrc! : a.talkOpen && a.pose.talkSrc ? a.pose.talkSrc : a.pose.src);
  if (body) ctx.drawImage(body, 0, 0, pw, ph);
  if (hd) {
    // cabeza articulada (igual que en el escenario: gira sobre el cuello)
    const img = images.get(a.talkOpen && hd.talkSrc ? hd.talkSrc : hd.src);
    if (img) {
      ctx.save();
      ctx.translate(hd.x + hd.px, hd.y + hd.py + a.headDy);
      if (a.headRot) ctx.rotate((a.headRot * Math.PI) / 180);
      ctx.drawImage(img, -hd.px, -hd.py, hd.w, hd.h);
      ctx.restore();
    }
  }
  const base = ctx.globalAlpha;
  if (a.faceFrom && a.faceMix < 1) drawFace(ctx, a.faceFrom, base * (1 - a.faceMix), images);
  drawFace(ctx, a.face, base * a.faceMix, images);
  ctx.restore();
}

function drawFace(ctx: Ctx, layers: FaceLayer[], alpha: number, images: ImageMap) {
  if (alpha < 0.01) return;
  for (const l of layers) {
    const img = images.get(l.src);
    if (!img) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    // contenedor (left, top) con transform-origin (originX, originY) y scale/rotate
    ctx.translate(l.left + l.originX, l.top + l.originY);
    ctx.scale(l.flip ? -l.scale : l.scale, l.scale);
    ctx.rotate(((l.flip ? -l.rot : l.rot) * Math.PI) / 180);
    ctx.translate(-l.originX, -l.originY);
    // overflow: hidden + clip-path elíptico
    ctx.beginPath();
    if (l.clip) ctx.ellipse(l.clip[2], l.clip[3], Math.max(0.1, l.clip[0]), Math.max(0.1, l.clip[1]), 0, 0, Math.PI * 2);
    else ctx.rect(0, 0, l.width, l.height);
    ctx.clip();
    if (l.feather) drawFeathered(ctx, img, l.imgLeft, 0, l.imgWidth, l.imgHeight);
    else ctx.drawImage(img, l.imgLeft, 0, l.imgWidth, l.imgHeight);
    ctx.restore();
  }
}

let featherCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
/** Máscara radial como el CSS .feather (opaco hasta el 62 % y se desvanece hasta el borde). */
function drawFeathered(ctx: Ctx, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const cw = Math.max(1, Math.ceil(w));
  const ch = Math.max(1, Math.ceil(h));
  if (!featherCanvas) featherCanvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(cw, ch) : document.createElement("canvas");
  featherCanvas.width = cw;
  featherCanvas.height = ch;
  const c = featherCanvas.getContext("2d") as Ctx;
  c.clearRect(0, 0, cw, ch);
  c.drawImage(img, 0, 0, w, h);
  c.globalCompositeOperation = "destination-in";
  c.save();
  c.translate(w / 2, h / 2);
  c.scale(w / 2, h / 2);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, "#000");
  g.addColorStop(0.62, "#000");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(-1, -1, 2, 2);
  c.restore();
  c.globalCompositeOperation = "source-over";
  ctx.drawImage(featherCanvas, x, y, w, h);
}

function drawThoughtBubble(ctx: Ctx, b: NonNullable<PropLayout["bubble"]>, opacity: number) {
  const rx = b.w / 2;
  const ry = b.h / 2;
  const lobes = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { x: b.cx + Math.cos(a) * rx * 0.92, y: b.cy + Math.sin(a) * ry * 0.9, r: Math.min(rx, ry) * 0.36 };
  });
  const dots = [0.25, 0.5, 0.75].map((f, i) => ({ x: b.tailX + (b.cx - b.tailX) * f * 0.55, y: b.tailY + (b.cy + ry - b.tailY) * f * 0.85, r: 9 + i * 7 }));
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 7;
  for (const c of [...lobes, ...dots]) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (const l of lobes) {
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.r - 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(b.cx, b.cy, rx * 0.95, ry * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBlueScreen(ctx: Ctx, b: { alpha: number; text: string }) {
  ctx.save();
  ctx.globalAlpha = b.alpha;
  ctx.fillStyle = "#1565d8";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "top";
  ctx.font = `260px ${FONT}`;
  ctx.fillText(":(", 90, 360);
  ctx.font = `72px ${FONT}`;
  let y = 360 + 260 + 70;
  for (const line of wrap(ctx, b.text, W - 180)) {
    ctx.fillText(line, 90, y);
    y += 86;
  }
  y += 60;
  ctx.globalAlpha = b.alpha * 0.85;
  ctx.font = `36px ${FONT}`;
  for (const line of [...wrap(ctx, "Se ha producido un error y hemos tenido que reiniciar a los empleados.", W - 180), "Código de detención: PUÑETIZACIÓN_IRREVERSIBLE"]) {
    ctx.fillText(line, 90, y);
    y += 50;
  }
  ctx.restore();
}

/** Bocadillos sobre quien habla y subtítulos abajo para narrador / voces en off (igual que en pantalla). */
function drawSpeech(ctx: Ctx, frame: FrameState, layout: ReturnType<typeof layoutFrame>, cam: { zoom: number; cx: number; cy: number }) {
  const toScreen = (x: number, y: number) => ({ x: (x - (cam.cx - W / 2 / cam.zoom)) * cam.zoom, y: (y - (cam.cy - H / 2 / cam.zoom)) * cam.zoom });
  const placed: { left: number; width: number; h: number }[] = [];
  const bottom: typeof frame.subtitles = [];
  for (const sub of frame.subtitles) {
    const a = sub.actorUid ? layout.actors.find((x) => x.uid === sub.actorUid) : undefined;
    const asProp = !a && sub.voiceOf ? [...layout.propsFront, ...layout.propsBack].find((p) => p.src.includes(`prop_${sub.voiceOf}_`) && p.opacity > 0.5) : undefined;
    let head: { x: number; y: number } | undefined;
    if (a && a.pose) head = toScreen(a.left + a.pose.width / 2, a.top + a.pose.height * (1 - a.scale));
    else if (asProp) head = toScreen(asProp.left + asProp.width / 2, asProp.top);
    if (!head) {
      bottom.push(sub);
      continue;
    }
    ctx.save();
    ctx.font = `600 42px ${FONT}`;
    const width = Math.min(620, 140 + sub.text.length * 15);
    const lines = wrap(ctx, sub.text, width - 60);
    const h = 40 + lines.length * 50;
    const left = Math.max(24, Math.min(W - 24 - width, head.x - width / 2));
    const stack = placed.filter((b) => Math.abs(b.left - left) < width).reduce((s, b) => s + b.h + 20, 0);
    const top = Math.max(24, head.y - h - 46 - stack);
    placed.push({ left, width, h });
    ctx.fillStyle = "rgba(0,0,0,.18)";
    roundRect(ctx, left, top + 6, width, h, 40);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 6;
    roundRect(ctx, left, top, width, h, 40);
    ctx.fill();
    ctx.stroke();
    const tx = left + Math.max(30, Math.min(width - 60, head.x - left - 15)) + 18;
    ctx.beginPath();
    ctx.moveTo(tx - 18, top + h - 3);
    ctx.lineTo(tx, top + h + 34);
    ctx.lineTo(tx + 18, top + h - 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(tx - 14, top + h - 8, 28, 8);
    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((ln, i) => ctx.fillText(ln, left + width / 2, top + 20 + 25 + i * 50));
    ctx.restore();
  }
  if (!bottom.length) return;
  ctx.save();
  ctx.font = `46px ${FONT}`;
  let y = H - 70;
  for (const sub of [...bottom].reverse()) {
    const lines = wrap(ctx, `${sub.speaker}: ${sub.text}`, W - 120 - 52);
    const h = lines.length * 58 + 28;
    const w = Math.min(W - 120, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 52);
    y -= h;
    ctx.fillStyle = "rgba(0,0,0,.72)";
    roundRect(ctx, (W - w) / 2, y, w, h, 18);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    lines.forEach((ln, i) => {
      ctx.fillStyle = "#fff";
      ctx.fillText(ln, W / 2, y + 14 + i * 58);
    });
    y -= 16;
  }
  ctx.restore();
}
