#!/usr/bin/env node
/**
 * Genera el catálogo Pocket a partir de la biblioteca REAL de PUÑETOS Studio V3.
 *
 * Uso:
 *   unzip "PUNETOS_STUDIO_V3(1).zip" -d v3-source
 *   npm run catalog:v3 -- v3-source            # escribe
 *   npm run catalog:v3 -- v3-source --dry-run  # solo inventario
 *
 * Lee config/library_index.json, copia los assets referenciados a public/assets/v3/
 * CONSERVANDO sus rutas relativas, copia licencias (LICENSE*, COPYING*, *licen*) y
 * escribe src/data/catalog.json + catalog.json + docs/V3_INVENTORY.md.
 *
 * IMPORTANTE: la estructura exacta de library_index.json no estaba disponible al
 * escribir este script. Se usa una lectura tolerante (recorre el JSON buscando
 * entradas con id + ruta y las clasifica por campos tipo/categoría o por carpeta).
 * Revisa docs/V3_INVENTORY.md: las entradas sin clasificar se listan, NUNCA se
 * inventan IDs. Ajusta classify() si la clasificación no es correcta.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const srcArg = args.find((a) => !a.startsWith("--"));
if (!srcArg) {
  console.error("Uso: npm run catalog:v3 -- <carpeta V3 descomprimida> [--dry-run]");
  process.exit(1);
}
// Si el ZIP trae una carpeta raíz, la detectamos.
let src = path.resolve(srcArg);
if (!fs.existsSync(path.join(src, "config/library_index.json"))) {
  const sub = fs.readdirSync(src).map((d) => path.join(src, d)).find((d) => fs.existsSync(path.join(d, "config/library_index.json")));
  if (!sub) {
    console.error(`No se encuentra config/library_index.json en ${src}`);
    process.exit(1);
  }
  src = sub;
}
const index = JSON.parse(fs.readFileSync(path.join(src, "config/library_index.json"), "utf8"));

const CHARACTERS = { usu: "Usu", reynaldo: "Reynaldo", sister: "Sister", barbas: "Barbas", jefe: "Jefe" };
const EMOTIONS = ["neutral", "feliz", "enfadado", "sorprendido", "triste"];
const EMOTION_SYNONYMS = { neutro: "neutral", normal: "neutral", happy: "feliz", alegre: "feliz", contento: "feliz", angry: "enfadado", enfado: "enfadado", furioso: "enfadado", surprised: "sorprendido", sorpresa: "sorprendido", sad: "triste", tristeza: "triste" };

const lower = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Recorre el índice y extrae entradas {id, path, meta, trail}. */
function collect(node, trail = [], out = []) {
  if (Array.isArray(node)) node.forEach((n, i) => collect(n, [...trail, String(i)], out));
  else if (node && typeof node === "object") {
    const id = node.id ?? node.asset_id ?? node.assetId;
    const p = node.path ?? node.file ?? node.src ?? node.image ?? node.filename;
    if (typeof id === "string" && typeof p === "string") out.push({ id, path: p, meta: node, trail });
    for (const [k, v] of Object.entries(node)) if (v && typeof v === "object") collect(v, [...trail, k], out);
  }
  return out;
}

function classify(e) {
  const hay = lower([e.meta.type, e.meta.kind, e.meta.category, e.meta.layer, e.path, ...e.trail].join(" "));
  const charId = lower(e.meta.character ?? e.meta.character_id ?? e.meta.characterId) || Object.keys(CHARACTERS).find((c) => new RegExp(`(^|[^a-z])${c}([^a-z]|$)`).test(hay));
  let kind = "unknown";
  if (/(background|fondo|escenario|\bbg\b)/.test(hay)) kind = "background";
  else if (/(mouth|boca)/.test(hay)) kind = "mouth";
  else if (/(face|cara|expres|emotion|emocion)/.test(hay)) kind = "expression";
  else if (/(prop|objeto|item)/.test(hay)) kind = "prop";
  else if (/(body|pose|cuerpo)/.test(hay) || charId) kind = "pose";
  return { kind, charId };
}

function emotionOf(e) {
  const hay = lower([e.meta.emotion, e.meta.expression, e.id, e.path].join(" "));
  for (const em of EMOTIONS) if (hay.includes(em)) return em;
  for (const [syn, em] of Object.entries(EMOTION_SYNONYMS)) if (hay.includes(syn)) return em;
  return lower(e.meta.emotion) || "neutral";
}

function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.toString("ascii", 1, 4) === "PNG") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    const svg = b.toString("utf8", 0, 2000).match(/width="(\d+)[^"]*"\s+height="(\d+)/);
    if (svg) return { width: +svg[1], height: +svg[2] };
  } catch {}
  return null;
}

const entries = collect(index);
const seen = new Set();
const missing = [];
const unclassified = [];
const out = { characters: Object.fromEntries(Object.entries(CHARACTERS).map(([id, name]) => [id, { id, name, poses: [], expressions: [] }])), backgrounds: [], props: [], mouths: [] };

for (const e of entries) {
  if (seen.has(e.id)) continue;
  seen.add(e.id);
  const abs = path.resolve(src, e.path);
  if (!abs.startsWith(src) || !fs.existsSync(abs)) {
    missing.push(e);
    continue;
  }
  const rel = path.relative(src, abs).split(path.sep).join("/");
  const url = `/assets/v3/${rel.split("/").map(encodeURIComponent).join("/")}`;
  const size = imageSize(abs) ?? { width: e.meta.width ?? 400, height: e.meta.height ?? 900 };
  const label = String(e.meta.name ?? e.meta.label ?? e.id);
  const { kind, charId } = classify(e);
  const ch = charId ? out.characters[charId] : undefined;
  const item = { e, rel, url, size, label };
  if (kind === "background") out.backgrounds.push({ id: e.id, label, src: url, _rel: rel });
  else if (kind === "prop") out.props.push({ id: e.id, label, src: url, ...size, _rel: rel });
  else if (kind === "mouth") out.mouths.push({ id: e.id, kind: /(open|abierta)/.test(lower(e.id + e.path)) ? "open" : "closed", src: url, ...size, _rel: rel });
  else if (kind === "pose" && ch) {
    const anchors = e.meta.anchors ?? (e.meta.mouth_anchor ? { mouth: e.meta.mouth_anchor } : undefined);
    ch.poses.push({ id: e.id, label, src: url, ...size, ...(anchors ? { anchors } : {}), _rel: rel });
  } else if (kind === "expression" && ch) ch.expressions.push({ id: e.id, emotion: emotionOf(e), label, src: url, ...size, _rel: rel });
  else unclassified.push({ ...item, kind });
}

const characters = Object.values(out.characters)
  .filter((c) => c.poses.length)
  .map((c) => ({
    id: c.id,
    name: c.name,
    color: "#888888",
    defaultVoice: { pitch: 1, rate: 1 },
    poses: c.poses,
    expressions: c.expressions,
    fallbackExpressionId: (c.expressions.find((x) => x.emotion === "neutral") ?? c.expressions[0])?.id ?? "",
  }));

const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === "_rel" ? undefined : v)));
const catalog = strip({
  catalogVersion: `v3-${new Date().toISOString().slice(0, 10)}`,
  source: { kind: "v3-library-index", note: "Generado desde config/library_index.json de PUNETOS_STUDIO_V3 por scripts/build-catalog-from-v3.mjs", license: "Ver public/assets/v3/ (licencias originales copiadas)", generatedAt: new Date().toISOString() },
  canvas: { width: 1080, height: 1920 },
  emotions: EMOTIONS,
  characters,
  backgrounds: out.backgrounds,
  props: out.props,
  mouths: out.mouths,
});

const report = [
  `# Inventario V3 → Pocket`,
  ``,
  `Origen: \`${path.relative(root, src) || src}\` · entradas en library_index: ${entries.length}`,
  ``,
  `| Personaje | Poses | Expresiones |`,
  `|---|---|---|`,
  ...Object.values(out.characters).map((c) => `| ${c.name} | ${c.poses.length} | ${c.expressions.length} |`),
  ``,
  `Fondos: ${out.backgrounds.length} · Objetos: ${out.props.length} · Bocas: ${out.mouths.length}`,
  ``,
  `## Sin clasificar (${unclassified.length}) — NO incluidas en el catálogo`,
  ...unclassified.map((u) => `- \`${u.e.id}\` → ${u.rel}`),
  ``,
  `## Referenciadas pero sin archivo (${missing.length})`,
  ...missing.map((m) => `- \`${m.id}\` → ${m.path}`),
  ``,
  `## Personajes sin poses (no se incluyen)`,
  ...Object.values(out.characters).filter((c) => !c.poses.length).map((c) => `- ${c.name}`),
].join("\n");

console.log(report);
if (dry) process.exit(0);

if (!characters.length) {
  console.error("\nNo se encontró ningún personaje con poses: revisa classify() antes de escribir el catálogo.");
  process.exit(2);
}
const dest = path.join(root, "public/assets/v3");
fs.rmSync(dest, { recursive: true, force: true });
const copy = (rel) => {
  const to = path.join(dest, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(src, rel), to);
};
for (const list of [out.backgrounds, out.props, out.mouths, ...Object.values(out.characters).flatMap((c) => [c.poses, c.expressions])]) for (const x of list) copy(x._rel);
for (const f of fs.readdirSync(src, { recursive: true })) if (/(licen[cs]e|copying|licencia)/i.test(path.basename(String(f)))) copy(String(f));
fs.writeFileSync(path.join(root, "src/data/catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
fs.copyFileSync(path.join(root, "src/data/catalog.json"), path.join(root, "catalog.json"));
fs.mkdirSync(path.join(root, "docs"), { recursive: true });
fs.writeFileSync(path.join(root, "docs/V3_INVENTORY.md"), report + "\n");
console.log("\nCatálogo V3 escrito. Ojo: examples/sketch-demo.json usa IDs del catálogo placeholder y habrá que regenerarlo.");
