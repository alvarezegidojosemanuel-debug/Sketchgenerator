/**
 * Calibraciones faciales y prefabs de expresión guardados por el usuario.
 * Se validan contra el catálogo: solo poses, personajes y piezas REALES.
 */
import { z } from "zod";
import type { Catalog, ExpressionPrefab, FaceOverrides, FaceRig, FaceSlot } from "@/lib/catalog/types";
import { emptyOverrides, findCharacter, findFaceAsset } from "@/lib/catalog";
import type { Issue } from "@/lib/schema/validate";
import { findUnsafeStrings } from "@/lib/schema/validate";

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const SlotT = z.object({
  x: num(-2000, 3000),
  y: num(-2000, 3000),
  scale: num(0.02, 10),
  rot: num(-180, 180).optional(),
  clip: z.array(num(-500, 500)).min(2).max(4).optional(),
});
const Rig = z.object({
  eyeL: SlotT.optional(),
  eyeR: SlotT.optional(),
  browL: SlotT.optional(),
  browR: SlotT.optional(),
  mouth: SlotT.optional(),
  status: z.enum(["estimated", "derived", "calibrated"]),
  source: z.string().max(300).optional(),
  review: z.string().max(300).optional(),
});
const Part = z.object({
  assetId: z.string().max(120),
  crop: z.enum(["left", "right"]).optional(),
  flip: z.boolean().optional(),
  dx: num(-500, 500).optional(),
  dy: num(-500, 500).optional(),
  dscale: num(0.1, 5).optional(),
  rot: num(-180, 180).optional(),
});
const Adjust = z.object({ dx: num(-500, 500).optional(), dy: num(-500, 500).optional(), dscale: num(0.1, 5).optional(), rot: num(-180, 180).optional() });
const Prefab = z.object({
  id: z.string().regex(/^expression\.[a-z0-9_]+\.[a-z0-9_]+$/, "formato expression.<personaje>.<nombre>"),
  characterId: z.string().max(40),
  emotion: z.string().max(40),
  label: z.string().min(1).max(60),
  status: z.enum(["draft", "final"]),
  eyeL: Part.nullable().optional(),
  eyeR: Part.nullable().optional(),
  browL: Part.nullable().optional(),
  browR: Part.nullable().optional(),
  mouth: Part,
  talk: z.array(z.string().max(120)).max(8),
  // partialRecord: cada pose ajusta solo los huecos que se han tocado (z.record con enum exige todos)
  poseOverrides: z.record(z.string().max(120), z.partialRecord(z.enum(["eyeL", "eyeR", "browL", "browR", "mouth"]), Adjust)).optional(),
  custom: z.boolean().optional(),
});
const OverridesSchema = z.object({
  kind: z.literal("pocket-face-overrides"),
  version: z.literal(1),
  catalogVersion: z.string().max(80),
  updatedAt: z.string().max(40),
  rigs: z.record(z.string().max(120), Rig),
  expressions: z.record(z.string().max(120), Prefab),
});

export function validateOverrides(input: unknown, catalog: Catalog): { ok: boolean; value?: FaceOverrides; errors: Issue[] } {
  const unsafe = findUnsafeStrings(input);
  if (unsafe.length) return { ok: false, errors: unsafe };
  const parsed = OverridesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })) };
  }
  const v = parsed.data as FaceOverrides;
  const errors: Issue[] = [];
  const poseIds = new Set(catalog.characters.flatMap((c) => c.poses.map((p) => p.id)));
  for (const id of Object.keys(v.rigs)) {
    if (!poseIds.has(id)) errors.push({ path: `rigs.${id}`, message: "pose inexistente en el catálogo" });
  }
  for (const [key, e] of Object.entries(v.expressions)) {
    const ch = findCharacter(catalog, e.characterId);
    if (!ch) {
      errors.push({ path: `expressions.${key}`, message: `personaje "${e.characterId}" inexistente` });
      continue;
    }
    if (key !== e.id || !e.id.startsWith(`expression.${ch.id}.`)) errors.push({ path: `expressions.${key}`, message: "el id no coincide con el personaje" });
    const parts: [string, string | undefined][] = [
      ["mouth", e.mouth.assetId],
      ...(["eyeL", "eyeR", "browL", "browR"] as const).map((s) => [s, e[s]?.assetId] as [string, string | undefined]),
      ...e.talk.map((t, i) => [`talk[${i}]`, t] as [string, string]),
    ];
    for (const [slot, aid] of parts) {
      if (aid && !findFaceAsset(ch, aid)) errors.push({ path: `expressions.${key}.${slot}`, message: `pieza "${aid}" no pertenece a ${ch.name}` });
    }
    for (const pid of Object.keys(e.poseOverrides ?? {})) {
      if (!ch.poses.some((p) => p.id === pid)) errors.push({ path: `expressions.${key}.poseOverrides.${pid}`, message: "pose de otro personaje o inexistente" });
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: v, errors: [] };
}

export function withRig(ov: FaceOverrides | null, catalog: Catalog, poseId: string, rig: FaceRig): FaceOverrides {
  const base = ov ? structuredClone(ov) : emptyOverrides(catalog);
  base.rigs[poseId] = { ...structuredClone(rig), status: "calibrated", source: "Calibrado en Pocket", review: undefined };
  base.updatedAt = new Date().toISOString();
  return base;
}

export function withExpression(ov: FaceOverrides | null, catalog: Catalog, characterId: string, e: ExpressionPrefab): FaceOverrides {
  const base = ov ? structuredClone(ov) : emptyOverrides(catalog);
  base.expressions[e.id] = { ...structuredClone(e), characterId };
  base.updatedAt = new Date().toISOString();
  return base;
}

export function withoutEntry(ov: FaceOverrides, kind: "rig" | "expression", id: string): FaceOverrides {
  const base = structuredClone(ov);
  if (kind === "rig") delete base.rigs[id];
  else delete base.expressions[id];
  base.updatedAt = new Date().toISOString();
  return base;
}

export function slotLabel(s: FaceSlot): string {
  return { eyeL: "Ojo izq.", eyeR: "Ojo der.", browL: "Ceja izq.", browR: "Ceja der.", mouth: "Boca" }[s];
}

/**
 * Carga tolerante: conserva todas las entradas válidas y descarta solo las inválidas
 * (nunca se pierde todo el trabajo por una entrada defectuosa).
 */
export function salvageOverrides(input: unknown, catalog: Catalog): { value: FaceOverrides | null; dropped: string[] } {
  const full = validateOverrides(input, catalog);
  if (full.ok && full.value) return { value: full.value, dropped: [] };
  if (typeof input !== "object" || input === null) return { value: null, dropped: ["archivo no válido"] };
  const src = input as Partial<FaceOverrides>;
  const out = emptyOverrides(catalog);
  out.updatedAt = typeof src.updatedAt === "string" ? src.updatedAt : out.updatedAt;
  const dropped: string[] = [];
  for (const [id, rig] of Object.entries(src.rigs ?? {})) {
    const probe = { ...emptyOverrides(catalog), rigs: { [id]: rig } };
    if (validateOverrides(probe, catalog).ok) out.rigs[id] = rig as FaceRig;
    else dropped.push(id);
  }
  for (const [id, e] of Object.entries(src.expressions ?? {})) {
    const probe = { ...emptyOverrides(catalog), expressions: { [id]: e } };
    if (validateOverrides(probe, catalog).ok) out.expressions[id] = e as FaceOverrides["expressions"][string];
    else dropped.push(id);
  }
  return { value: out, dropped };
}
