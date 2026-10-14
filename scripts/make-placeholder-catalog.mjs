#!/usr/bin/env node
/**
 * Genera un catálogo PROVISIONAL con ilustraciones SVG simples para que Pocket
 * funcione de principio a fin mientras no se aporte la biblioteca real de V3.
 *
 * - Todos los IDs llevan este catálogo marcado como `source.kind = "placeholder"`.
 * - NO representan IDs de PUÑETOS Studio V3/V8. Cuando se disponga del ZIP real,
 *   ejecutar `npm run catalog:v3 -- <carpeta-V3>` y este catálogo se reemplaza.
 *
 * Uso: node scripts/make-placeholder-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outAssets = path.join(root, "public/assets/placeholder");
const outCatalog = path.join(root, "src/data/catalog.json");

fs.rmSync(outAssets, { recursive: true, force: true });
fs.mkdirSync(outAssets, { recursive: true });

const write = (rel, svg) => {
  const file = path.join(outAssets, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, svg.trim() + "\n");
  return `/assets/placeholder/${rel}`;
};

const POSE_W = 400;
const POSE_H = 900;
const HEAD = { x: 200, y: 170, r: 110 };

const characters = [
  { id: "usu", name: "Usu", skin: "#f3c9a1", shirt: "#3b82f6", pants: "#1e3a5f", hair: "#3b2416", style: "short", voice: { pitch: 1.1, rate: 1.05 } },
  { id: "reynaldo", name: "Reynaldo", skin: "#e0ac7e", shirt: "#16a34a", pants: "#3f3f46", hair: "#9ca3af", style: "side", voice: { pitch: 0.9, rate: 1.0 } },
  { id: "sister", name: "Sister", skin: "#f6d3b3", shirt: "#db2777", pants: "#4c1d95", hair: "#7c2d12", style: "long", voice: { pitch: 1.35, rate: 1.05 } },
  { id: "barbas", name: "Barbas", skin: "#d9a074", shirt: "#a16207", pants: "#292524", hair: "#1c1917", style: "beard", voice: { pitch: 0.75, rate: 0.95 } },
  { id: "jefe", name: "Jefe", skin: "#eab89a", shirt: "#374151", pants: "#111827", hair: "#111827", style: "bald", voice: { pitch: 0.85, rate: 0.95 } },
];

const poses = [
  { key: "idle", label: "De pie" },
  { key: "senala", label: "Señala" },
  { key: "brazos_cruzados", label: "Brazos cruzados" },
  { key: "manos_arriba", label: "Manos arriba" },
];

const emotions = [
  { key: "neutral", label: "Neutral" },
  { key: "feliz", label: "Feliz" },
  { key: "enfadado", label: "Enfadado" },
  { key: "sorprendido", label: "Sorprendido" },
  { key: "triste", label: "Triste" },
];

function hairSvg(c) {
  const { x, y, r } = HEAD;
  switch (c.style) {
    case "short":
      return `<path d="M${x - r} ${y - 10} Q${x - r} ${y - r - 30} ${x} ${y - r - 20} Q${x + r} ${y - r - 30} ${x + r} ${y - 10} Q${x + 40} ${y - 70} ${x - r} ${y - 10}Z" fill="${c.hair}"/>`;
    case "side":
      return `<path d="M${x - r + 5} ${y - 30} Q${x - 20} ${y - r - 40} ${x + r - 5} ${y - 30} L${x + r - 10} ${y - 60} Q${x} ${y - r - 10} ${x - r + 10} ${y - 60}Z" fill="${c.hair}"/>`;
    case "long":
      return `<path d="M${x - r - 15} ${y + 140} L${x - r - 10} ${y - 20} Q${x} ${y - r - 50} ${x + r + 10} ${y - 20} L${x + r + 15} ${y + 140} L${x + r - 25} ${y + 140} L${x + r - 30} ${y - 40} Q${x} ${y - 60} ${x - r + 30} ${y - 40} L${x - r + 25} ${y + 140}Z" fill="${c.hair}"/>`;
    case "beard":
      return `<path d="M${x - r} ${y - 20} Q${x} ${y - r - 40} ${x + r} ${y - 20} Q${x} ${y - 80} ${x - r} ${y - 20}Z" fill="${c.hair}"/><path d="M${x - r + 5} ${y + 10} Q${x - r + 10} ${y + r + 40} ${x} ${y + r + 50} Q${x + r - 10} ${y + r + 40} ${x + r - 5} ${y + 10} Q${x + 60} ${y + 70} ${x} ${y + 72} Q${x - 60} ${y + 70} ${x - r + 5} ${y + 10}Z" fill="${c.hair}" opacity="0.92"/>`;
    case "bald":
    default:
      return `<path d="M${x - r + 2} ${y + 10} Q${x - r - 5} ${y - 40} ${x - r + 25} ${y - 40}" stroke="${c.hair}" stroke-width="16" fill="none" stroke-linecap="round"/><path d="M${x + r - 2} ${y + 10} Q${x + r + 5} ${y - 40} ${x + r - 25} ${y - 40}" stroke="${c.hair}" stroke-width="16" fill="none" stroke-linecap="round"/>`;
  }
}

function armsSvg(c, key) {
  const s = `stroke="${c.shirt}" stroke-width="46" stroke-linecap="round" fill="none"`;
  const h = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="26" fill="${c.skin}"/>`;
  switch (key) {
    case "senala":
      return `<path d="M110 320 L70 590" ${s}/>${h(68, 600)}<path d="M290 320 L385 205" ${s}/>${h(388, 198)}`;
    case "brazos_cruzados":
      return `<path d="M110 320 L95 470 L285 440" ${s}/><path d="M290 320 L305 470 L115 440" ${s}/>${h(290, 440)}${h(110, 440)}`;
    case "manos_arriba":
      return `<path d="M110 320 L30 160" ${s}/>${h(26, 148)}<path d="M290 320 L370 160" ${s}/>${h(374, 148)}`;
    case "idle":
    default:
      return `<path d="M110 320 L80 590" ${s}/>${h(78, 600)}<path d="M290 320 L320 590" ${s}/>${h(322, 600)}`;
  }
}

function poseSvg(c, key) {
  const { x, y, r } = HEAD;
  const tie = c.id === "jefe" ? `<path d="M200 290 L185 310 L200 440 L215 310Z" fill="#dc2626"/><path d="M160 285 L200 300 L240 285" stroke="#f9fafb" stroke-width="10" fill="none"/>` : "";
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${POSE_W}" height="${POSE_H}" viewBox="0 0 ${POSE_W} ${POSE_H}">
  <!-- PLACEHOLDER Pocket: no es arte de PUÑETOS Studio -->
  <ellipse cx="200" cy="885" rx="150" ry="14" fill="#000" opacity="0.18"/>
  <rect x="125" y="600" width="65" height="275" rx="22" fill="${c.pants}"/>
  <rect x="210" y="600" width="65" height="275" rx="22" fill="${c.pants}"/>
  <path d="M105 300 Q200 265 295 300 L300 630 L100 630Z" fill="${c.shirt}"/>
  ${tie}
  ${armsSvg(c, key)}
  <rect x="175" y="255" width="50" height="45" fill="${c.skin}"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="${c.skin}"/>
  <circle cx="${x - r + 2}" cy="${y + 10}" r="18" fill="${c.skin}"/>
  <circle cx="${x + r - 2}" cy="${y + 10}" r="18" fill="${c.skin}"/>
  ${hairSvg(c)}
</svg>`;
}

/** Superposición de expresión: 240×240 centrada en la cabeza (cejas + detalles). */
function expressionSvg(emotion) {
  const brow = (d) => `<path d="${d}" stroke="#1f1308" stroke-width="9" stroke-linecap="round" fill="none"/>`;
  let body = "";
  switch (emotion) {
    case "feliz":
      body = brow("M50 70 Q80 50 108 66") + brow("M132 66 Q160 50 190 70") + `<ellipse cx="62" cy="150" rx="20" ry="11" fill="#f87171" opacity="0.45"/><ellipse cx="178" cy="150" rx="20" ry="11" fill="#f87171" opacity="0.45"/>`;
      break;
    case "enfadado":
      body = brow("M52 58 L110 82") + brow("M130 82 L188 58") + `<path d="M112 46 L118 58 M128 46 L122 58" stroke="#b91c1c" stroke-width="5" stroke-linecap="round"/>`;
      break;
    case "sorprendido":
      body = brow("M52 52 Q80 30 108 50") + brow("M132 50 Q160 30 188 52");
      break;
    case "triste":
      body = brow("M52 78 Q80 60 108 58") + brow("M132 58 Q160 60 188 78") + `<path d="M96 120 Q92 140 96 150 Q101 140 96 120Z" fill="#60a5fa"/>`;
      break;
    case "neutral":
    default:
      body = brow("M52 66 L108 64") + brow("M132 64 L188 66");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">${body}</svg>`;
}

const mouthClosed = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50" viewBox="0 0 80 50"><path d="M14 24 Q40 34 66 24" stroke="#5b1a1a" stroke-width="7" stroke-linecap="round" fill="none"/></svg>`;
const mouthOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50" viewBox="0 0 80 50"><ellipse cx="40" cy="25" rx="22" ry="17" fill="#5b1a1a"/><ellipse cx="40" cy="34" rx="13" ry="7" fill="#f472b6"/></svg>`;

const BG = [
  { id: "bg_oficina", label: "Oficina", sky: "#dbeafe", floor: "#94a3b8", extra: `<rect x="120" y="380" width="360" height="300" fill="#bfdbfe" stroke="#475569" stroke-width="14"/><rect x="600" y="1150" width="420" height="40" fill="#78350f"/><rect x="620" y="1190" width="24" height="230" fill="#78350f"/><rect x="976" y="1190" width="24" height="230" fill="#78350f"/><rect x="700" y="1030" width="180" height="120" rx="8" fill="#1f2937"/>` },
  { id: "bg_cocina", label: "Cocina", sky: "#fef3c7", floor: "#d6d3d1", extra: `<rect x="0" y="1050" width="1080" height="60" fill="#e7e5e4"/><rect x="0" y="1110" width="1080" height="320" fill="#a8a29e"/><rect x="760" y="300" width="250" height="760" fill="#e5e7eb" stroke="#9ca3af" stroke-width="10"/><circle cx="220" cy="420" r="90" fill="#fff" stroke="#57534e" stroke-width="12"/>` },
  { id: "bg_bar", label: "Bar", sky: "#3f1d0b", floor: "#57301a", extra: `<rect x="0" y="1100" width="1080" height="340" fill="#7c2d12"/><rect x="0" y="1080" width="1080" height="40" fill="#a16207"/><g fill="#fbbf24" opacity="0.8"><circle cx="200" cy="200" r="40"/><circle cx="540" cy="200" r="40"/><circle cx="880" cy="200" r="40"/></g><rect x="80" y="500" width="920" height="16" fill="#a16207"/><g fill="#15803d"><rect x="120" y="420" width="30" height="80"/><rect x="200" y="410" width="30" height="90"/><rect x="290" y="430" width="30" height="70"/></g>` },
  { id: "bg_calle", label: "Calle", sky: "#bae6fd", floor: "#6b7280", extra: `<rect x="40" y="300" width="300" height="1130" fill="#fca5a5"/><rect x="740" y="200" width="300" height="1230" fill="#fcd34d"/><g fill="#e0f2fe"><rect x="90" y="380" width="80" height="110"/><rect x="210" y="380" width="80" height="110"/><rect x="790" y="300" width="80" height="110"/><rect x="910" y="300" width="80" height="110"/></g><rect x="0" y="1720" width="1080" height="20" fill="#f9fafb" opacity="0.6"/>` },
  { id: "bg_salon", label: "Salón", sky: "#ede9fe", floor: "#a78bfa", extra: `<rect x="120" y="1100" width="840" height="260" rx="60" fill="#6d28d9"/><rect x="160" y="1000" width="760" height="160" rx="50" fill="#7c3aed"/><rect x="380" y="380" width="320" height="220" fill="#fef9c3" stroke="#854d0e" stroke-width="16"/>` },
];
const bgSvg = (b) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1430" fill="${b.sky}"/>
  <rect y="1430" width="1080" height="490" fill="${b.floor}"/>
  ${b.extra}
  <text x="540" y="1890" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#000" opacity="0.25">PLACEHOLDER Pocket — ${b.label}</text>
</svg>`;

const PROPS = [
  { id: "prop_cafe", label: "Taza de café", w: 120, h: 120, svg: `<path d="M20 30 H90 V95 Q90 112 72 112 H38 Q20 112 20 95Z" fill="#f9fafb" stroke="#374151" stroke-width="6"/><path d="M90 45 Q115 50 112 70 Q110 88 90 85" stroke="#374151" stroke-width="6" fill="none"/><path d="M40 20 Q48 8 40 0 M62 20 Q70 8 62 0" stroke="#9ca3af" stroke-width="4" fill="none"/>` },
  { id: "prop_movil", label: "Móvil", w: 90, h: 160, svg: `<rect x="5" y="5" width="80" height="150" rx="14" fill="#111827"/><rect x="13" y="20" width="64" height="115" fill="#38bdf8"/>` },
  { id: "prop_papeles", label: "Papeles", w: 180, h: 140, svg: `<rect x="20" y="25" width="140" height="105" fill="#fff" stroke="#9ca3af" stroke-width="4" transform="rotate(-6 90 77)"/><rect x="20" y="15" width="140" height="105" fill="#fff" stroke="#6b7280" stroke-width="4"/><path d="M40 45 H140 M40 65 H140 M40 85 H110" stroke="#9ca3af" stroke-width="6"/>` },
  { id: "prop_planta", label: "Planta", w: 220, h: 360, svg: `<path d="M60 250 H160 L145 355 H75Z" fill="#b45309"/><g fill="#16a34a"><ellipse cx="110" cy="120" rx="40" ry="110"/><ellipse cx="60" cy="170" rx="30" ry="80" transform="rotate(-25 60 170)"/><ellipse cx="160" cy="170" rx="30" ry="80" transform="rotate(25 160 170)"/></g>` },
  { id: "prop_maletin", label: "Maletín", w: 220, h: 170, svg: `<rect x="10" y="40" width="200" height="125" rx="14" fill="#78350f"/><path d="M80 40 V18 H140 V40" stroke="#451a03" stroke-width="12" fill="none"/><rect x="98" y="88" width="24" height="18" fill="#fbbf24"/>` },
];

// --- Escribir assets ---
const catalogCharacters = characters.map((c) => {
  const charPoses = poses.map((p) => ({
    id: `${c.id}_${p.key}`,
    label: p.label,
    src: write(`characters/${c.id}/pose_${p.key}.svg`, poseSvg(c, p.key)),
    width: POSE_W,
    height: POSE_H,
    anchors: {
      face: { x: HEAD.x / POSE_W, y: HEAD.y / POSE_H },
      mouth: { x: 200 / POSE_W, y: 228 / POSE_H },
      eyeL: { x: 162 / POSE_W, y: 165 / POSE_H },
      eyeR: { x: 238 / POSE_W, y: 165 / POSE_H },
    },
  }));
  const charExpr = emotions.map((e) => ({
    id: `${c.id}_cara_${e.key}`,
    emotion: e.key,
    label: e.label,
    src: write(`characters/${c.id}/cara_${e.key}.svg`, expressionSvg(e.key)),
    width: 240,
    height: 240,
  }));
  return {
    id: c.id,
    name: c.name,
    color: c.shirt,
    defaultVoice: c.voice,
    poses: charPoses,
    expressions: charExpr,
    fallbackExpressionId: `${c.id}_cara_neutral`,
  };
});

const catalog = {
  catalogVersion: "placeholder-0.1",
  source: {
    kind: "placeholder",
    note:
      "Catálogo PROVISIONAL generado por scripts/make-placeholder-catalog.mjs con dibujos SVG simples. " +
      "No contiene IDs ni arte de PUÑETOS Studio V3/V8. Reemplazar con `npm run catalog:v3 -- <carpeta V3>`.",
    license: "Dibujos placeholder creados para este repositorio (misma licencia que el código).",
  },
  canvas: { width: 1080, height: 1920 },
  emotions: emotions.map((e) => e.key),
  characters: catalogCharacters,
  backgrounds: BG.map((b) => ({ id: b.id, label: b.label, src: write(`backgrounds/${b.id}.svg`, bgSvg(b)) })),
  props: PROPS.map((p) => ({
    id: p.id,
    label: p.label,
    width: p.w,
    height: p.h,
    src: write(`props/${p.id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}">${p.svg}</svg>`),
  })),
  mouths: [
    { id: "boca_cerrada", kind: "closed", width: 80, height: 50, src: write("mouths/boca_cerrada.svg", mouthClosed) },
    { id: "boca_abierta", kind: "open", width: 80, height: 50, src: write("mouths/boca_abierta.svg", mouthOpen) },
  ],
};

fs.mkdirSync(path.dirname(outCatalog), { recursive: true });
fs.writeFileSync(outCatalog, JSON.stringify(catalog, null, 2) + "\n");
fs.copyFileSync(outCatalog, path.join(root, "catalog.json"));
console.log(`Catálogo placeholder escrito en ${path.relative(root, outCatalog)} y catalog.json`);
