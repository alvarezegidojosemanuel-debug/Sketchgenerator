/**
 * Recursos de cómic sobre los personajes (gotas de sudor, susto, vena de enfado, líneas de movimiento,
 * risas y onomatopeyas). Se dibujan en canvas: los usan el escenario y el MP4.
 */
export type ComicKind = "sudor" | "sorpresa" | "enfado" | "lineas" | "risa" | "onomatopeya" | "rotulo" | "humo" | "corazones" | "mareo";
export const COMIC_KINDS: ComicKind[] = ["sudor", "sorpresa", "enfado", "lineas", "risa", "onomatopeya", "rotulo", "humo", "corazones", "mareo"];

export interface ComicState {
  kind: ComicKind;
  /** Centro de la cabeza (px del lienzo). */
  x: number;
  y: number;
  /** Altura del personaje en pantalla (escala de los dibujos). */
  h: number;
  /** Segundos desde que empezó y duración total. */
  local: number;
  duration: number;
  /** Hacia dónde mira (1 derecha, -1 izquierda). */
  side: number;
  text?: string;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutBack = (p: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};
const INK = "#16141c";

/** Entra con rebote y sale con fundido. */
function envelope(c: ComicState) {
  const pin = clamp01(c.local / 0.22);
  const out = clamp01((c.duration - c.local) / 0.25);
  return { scale: pin < 1 ? Math.max(0.01, easeOutBack(pin)) : 1, alpha: out };
}

function drop(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.8);
  ctx.bezierCurveTo(x + r * 0.9, y - r * 0.6, x + r, y + r * 0.2, x, y + r);
  ctx.bezierCurveTo(x - r, y + r * 0.2, x - r * 0.9, y - r * 0.6, x, y - r * 1.8);
  ctx.closePath();
  ctx.fillStyle = "#7fd3ff";
  ctx.fill();
  ctx.lineWidth = r * 0.28;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y - r * 0.15, r * 0.18, r * 0.32, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

function burst(ctx: Ctx, r: number, spikes: number, fill: string) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.62 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.78);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function comicText(ctx: Ctx, text: string, size: number, fill: string) {
  ctx.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
}

function star(ctx: Ctx, r: number, rot: number) {
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffd23f";
  ctx.fill();
  ctx.lineWidth = r * 0.18;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function heart(ctx: Ctx, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(-r * 1.6, -r * 0.1, -r * 0.8, -r * 1.3, 0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.8, -r * 1.3, r * 1.6, -r * 0.1, 0, r * 0.9);
  ctx.closePath();
  ctx.fillStyle = "#ff4f8b";
  ctx.fill();
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-r * 0.45, -r * 0.45, r * 0.18, r * 0.28, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

export function drawComic(ctx: Ctx, c: ComicState) {
  const { scale, alpha } = envelope(c);
  if (alpha <= 0) return;
  const u = c.h / 900; // 1 = personaje de 900 px
  const t = c.local;
  ctx.save();
  ctx.globalAlpha = alpha;
  switch (c.kind) {
    case "sudor": {
      // dos gotas que nacen junto a la sien y resbalan un poco
      const bx = c.x + c.side * -70 * u;
      for (let i = 0; i < 2; i++) {
        const lt = t - i * 0.25;
        if (lt < 0) continue;
        const fall = Math.min(1, lt / 1.2) * 40 * u;
        const s = Math.min(1, lt / 0.2) * scale;
        drop(ctx, bx + c.side * -i * 34 * u, c.y - 40 * u + i * 30 * u + fall, 16 * u * s);
      }
      break;
    }
    case "sorpresa": {
      // rayitas de susto alrededor de la cabeza y una «!» encima
      ctx.translate(c.x, c.y);
      ctx.lineCap = "round";
      const r0 = 150 * u;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * 0.98 + (i / 6) * Math.PI * 0.96;
        const jit = Math.sin(t * 40 + i) * 5 * u;
        const len = (55 + (i % 2) * 20) * u * scale;
        for (const [w, col] of [[16, "#ffffff"], [8, INK]] as const) {
          ctx.lineWidth = w * u;
          ctx.strokeStyle = col;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * (r0 + jit), Math.sin(a) * (r0 + jit));
          ctx.lineTo(Math.cos(a) * (r0 + len + jit), Math.sin(a) * (r0 + len + jit));
          ctx.stroke();
        }
      }
      // «!» a la altura de la cabeza, por el lado libre (encima suele estar el bocadillo)
      const sx = c.x + c.side * 200 * u < 60 || c.x + c.side * 200 * u > 1020 ? -c.side : c.side;
      ctx.translate(sx * 200 * u, -40 * u);
      ctx.rotate(sx * 0.18);
      ctx.scale(scale, scale);
      comicText(ctx, "!", 130 * u, "#ffd23f");
      break;
    }
    case "enfado": {
      // vena de enfado (cuatro arcos rojos) que late junto a la frente
      ctx.translate(c.x + c.side * 70 * u, c.y - 85 * u);
      const beat = 1 + Math.max(0, Math.sin(t * 9)) * 0.18;
      ctx.scale(scale * beat, scale * beat);
      ctx.strokeStyle = "#e3262f";
      ctx.lineCap = "round";
      ctx.lineWidth = 9 * u;
      const r = 20 * u;
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 2);
        ctx.beginPath();
        ctx.arc(r * 1.25, r * 1.25, r, Math.PI, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case "lineas": {
      // líneas de movimiento por detrás del personaje (sale disparado)
      ctx.strokeStyle = INK;
      ctx.lineCap = "round";
      // detrás de quien se mueve; si ahí no cabe (borde de pantalla), al otro lado
      const back = c.x - c.side * 330 * u < 0 || c.x - c.side * 330 * u > 1080 ? -c.side : c.side;
      for (let i = 0; i < 6; i++) {
        const yy = c.y + (40 + i * 95) * u;
        const flick = (Math.sin(t * 30 + i * 2) + 1) / 2;
        const len = (90 + flick * 80) * u * scale;
        const x0 = c.x - back * (150 + (i % 2) * 40) * u;
        ctx.globalAlpha = alpha * (0.5 + flick * 0.5);
        ctx.lineWidth = (5 + (i % 3)) * u;
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.lineTo(x0 - back * len, yy);
        ctx.stroke();
      }
      break;
    }
    case "risa": {
      // «JA» que suben flotando y se balancean
      for (let i = 0; i < 3; i++) {
        const lt = t - i * 0.28;
        if (lt < 0) continue;
        const p = clamp01(lt / 1.4);
        ctx.save();
        ctx.globalAlpha = alpha * (1 - p * 0.6);
        ctx.translate(c.x + c.side * (140 + i * 40) * u + Math.sin(lt * 7) * 10 * u, c.y - (20 + i * 60 + p * 70) * u);
        ctx.rotate(c.side * (0.15 + i * 0.08));
        const s = Math.min(1, lt / 0.18);
        ctx.scale(s, s);
        comicText(ctx, "JA", (70 - i * 6) * u, "#ffffff");
        ctx.restore();
      }
      break;
    }
    case "mareo": {
      // estrellitas girando en círculo sobre la cabeza (aturdido); tumbados son «bajitos»: tamaño mínimo
      const v = Math.max(u, 0.85);
      ctx.translate(c.x, c.y - 40 * v);
      ctx.scale(scale, scale);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = t * 3.2 + (i / n) * Math.PI * 2;
        const sx = Math.cos(a) * 95 * v;
        const sy = Math.sin(a) * 26 * v;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.globalAlpha = alpha * (Math.sin(a) > 0 ? 1 : 0.55);
        star(ctx, 17 * v, t * 4 + i);
        ctx.restore();
      }
      break;
    }
    case "corazones": {
      // corazones que brotan y suben flotando (enamoramiento)
      for (let i = 0; i < 6; i++) {
        const lt = t - i * 0.18;
        if (lt < 0) continue;
        const rise = lt * 110 * u;
        const sway = Math.sin(lt * 4 + i * 1.7) * 26 * u;
        const ox = (i % 2 ? 1 : -1) * (40 + ((i * 37) % 90)) * u;
        const s = Math.min(1, lt / 0.25) * (0.75 + ((i * 13) % 5) * 0.08) * scale;
        ctx.save();
        ctx.translate(c.x + ox + sway, c.y - 60 * u - rise);
        ctx.rotate(Math.sin(lt * 3 + i) * 0.25);
        ctx.scale(s, s);
        heart(ctx, 30 * u);
        ctx.restore();
      }
      break;
    }
    case "humo": {
      // nube de polvo de cómic donde estaba alguien que sale disparado (en el suelo, se deshace)
      const p = clamp01(t / Math.max(0.3, c.duration));
      ctx.globalAlpha = alpha * (1 - p * 0.7);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI - Math.PI;
        const r = (55 + (i % 3) * 18) * (0.7 + p * 0.6);
        const px = c.x + Math.cos(a) * 120 * (0.6 + p * 0.5) - c.side * p * 60;
        const py = c.y - 40 - Math.abs(Math.sin(a)) * 90 * (0.5 + p * 0.6);
        ctx.beginPath();
        ctx.arc(px, py, r * scale, 0, Math.PI * 2);
        ctx.fillStyle = "#f3efe6";
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      break;
    }
    case "rotulo": {
      // cartela de cómic arriba (lugar / hora): «LUNES · 08:59 — Cuatro días antes»
      const lines = (c.text ?? "").split(/\s*[—|]\s*/).filter(Boolean).slice(0, 2);
      const big = lines.length === 1 && lines[0].length <= 12 ? 1.9 : 1; // título
      const w0 = Math.max(...lines.map((l, i) => { ctx.font = `900 ${i ? 40 : 64}px "Arial Black", Impact, system-ui, sans-serif`; return ctx.measureText(l).width; }), 200);
      const bw = w0 + 80;
      // los rótulos largos se encogen para caber en pantalla (1080 px de ancho, con margen)
      const fit = Math.min(1, 1010 / (bw * u * big));
      ctx.translate(c.x, c.y);
      ctx.rotate(-0.02);
      ctx.scale(scale * u * big * fit, scale * u * big * fit);
      const bh = lines.length > 1 ? 170 : 110;
      ctx.fillStyle = INK;
      ctx.fillRect(-bw / 2 + 10, -bh / 2 + 10, bw, bh);
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = INK;
      lines.forEach((l, i) => {
        ctx.font = `900 ${i ? 40 : 64}px "Arial Black", Impact, system-ui, sans-serif`;
        ctx.fillText(l, 0, lines.length > 1 ? (i ? 42 : -28) : 0);
      });
      break;
    }
    case "onomatopeya": {
      // estallido amarillo con texto gordo, un poco ladeado
      ctx.translate(c.x + c.side * 150 * u, c.y - 150 * u);
      ctx.rotate(c.side * -0.12 + Math.sin(t * 18) * 0.02);
      ctx.scale(scale, scale);
      const text = (c.text ?? "¡ZAS!").slice(0, 14);
      const size = Math.max(40, 92 - text.length * 4) * u;
      burst(ctx, Math.max(130 * u, text.length * size * 0.42), 11, "#ffd23f");
      comicText(ctx, text, size, "#ff5a1f");
      break;
    }
  }
  ctx.restore();
}
