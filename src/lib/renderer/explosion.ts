/** Explosión de cómic (bola de fuego, metralla, humo y «¡BUM!») dibujada en canvas; la usan el escenario y el MP4. */
export interface ExplosionState {
  x: number;
  y: number;
  /** Segundos desde que empezó. */
  local: number;
  seed: number;
  text: string;
  scale: number;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

export function drawExplosion(ctx: Ctx, e: ExplosionState) {
  const t = e.local;
  const k = e.scale;
  const r = rng(e.seed);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(k, k);
  // humo (detrás), sube y se expande
  for (let i = 0; i < 9; i++) {
    const ang = r() * Math.PI * 2;
    const d0 = 60 + r() * 120;
    const start = 0.25 + r() * 0.3;
    const lt = t - start;
    if (lt <= 0) continue;
    const a = Math.max(0, 0.55 - lt * 0.35);
    if (a <= 0) continue;
    const rad = 70 + lt * 90 + r() * 40;
    ctx.globalAlpha = a;
    ctx.fillStyle = i % 2 ? "#5c5c66" : "#7d7d88";
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * d0, Math.sin(ang) * d0 * 0.6 - lt * 140, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // bola de fuego: varias capas con degradado
  const grow = easeOut(t / 0.45);
  const fade = Math.max(0, 1 - Math.max(0, t - 0.5) / 0.7);
  if (fade > 0) {
    for (let i = 0; i < 6; i++) {
      const ang = r() * Math.PI * 2;
      const off = i === 0 ? 0 : 70 + r() * 90;
      const R = (i === 0 ? 260 : 140 + r() * 110) * grow;
      const cx = Math.cos(ang) * off * grow;
      const cy = Math.sin(ang) * off * grow * 0.8;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, R));
      g.addColorStop(0, "#fffbe0");
      g.addColorStop(0.3, "#ffd23f");
      g.addColorStop(0.62, "#ff7a1a");
      g.addColorStop(0.85, "#d62a1a");
      g.addColorStop(1, "rgba(120,20,10,0)");
      ctx.globalAlpha = fade;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, R), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // metralla con gravedad
  for (let i = 0; i < 16; i++) {
    const ang = r() * Math.PI * 2;
    const v = 700 + r() * 700;
    const lt = t;
    const px = Math.cos(ang) * v * lt;
    const py = Math.sin(ang) * v * lt + 900 * lt * lt;
    const a = Math.max(0, 1 - lt / 1.1);
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(px, py);
    ctx.rotate(lt * (6 + r() * 10));
    ctx.fillStyle = i % 3 ? "#2b2b33" : "#ff9f1c";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 4;
    const s = 14 + r() * 22;
    ctx.fillRect(-s / 2, -s / 3, s, (s * 2) / 3);
    ctx.strokeRect(-s / 2, -s / 3, s, (s * 2) / 3);
    ctx.restore();
  }
  // onomatopeya de cómic
  if (e.text && t > 0.05 && t < 1.1) {
    const pop = t < 0.2 ? 0.4 + (t / 0.2) * 0.8 : 1.2 - Math.min(0.2, (t - 0.2) * 0.3);
    ctx.globalAlpha = t > 0.9 ? Math.max(0, 1 - (t - 0.9) / 0.2) : 1;
    ctx.save();
    ctx.rotate(-0.12);
    ctx.scale(pop, pop);
    ctx.font = '900 190px "Arial Black", Impact, system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 26;
    ctx.strokeStyle = "#111";
    ctx.strokeText(e.text, 0, -230);
    ctx.fillStyle = "#ffe14d";
    ctx.fillText(e.text, 0, -230);
    ctx.restore();
  }
  ctx.restore();
}

/** Duración visible de una explosión (s). */
export const EXPLOSION_TIME = 1.9;
