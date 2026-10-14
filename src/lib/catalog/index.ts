import rawCatalog from "@/data/catalog.json";
import rawOverrides from "@/data/face-overrides.json";
import type { Catalog, Character, ExpressionPrefab, FaceAsset, FaceOverrides, Pose } from "./types";

export type * from "./types";
export { FACE_SLOTS } from "./types";

/** Catálogo empaquetado (generado por scripts/v8/import_v8.py, no editar a mano). */
export const baseCatalog = rawCatalog as unknown as Catalog;
/** Calibraciones/prefabs revisados y versionados en el repositorio (src/data/face-overrides.json). */
export const repoOverrides = rawOverrides as unknown as FaceOverrides;

export function emptyOverrides(c: Catalog): FaceOverrides {
  return { kind: "pocket-face-overrides", version: 1, catalogVersion: c.catalogVersion, updatedAt: new Date(0).toISOString(), rigs: {}, expressions: {} };
}

/**
 * Aplica overrides (rigs calibrados y prefabs guardados) sobre un catálogo.
 * Ignora entradas que no correspondan a poses/personajes reales.
 */
export function applyOverrides(c: Catalog, ...layers: (FaceOverrides | null | undefined)[]): Catalog {
  const out: Catalog = structuredClone(c);
  for (const ov of layers) {
    if (!ov) continue;
    for (const ch of out.characters) {
      for (const p of ch.poses) {
        const r = ov.rigs?.[p.id];
        if (r) p.rig = structuredClone(r);
      }
      for (const e of Object.values(ov.expressions ?? {})) {
        if (e.characterId !== ch.id || !e.id.startsWith(`expression.${ch.id}.`)) continue;
        const { characterId: _ignored, ...prefab } = e;
        const idx = ch.expressions.findIndex((x) => x.id === e.id);
        if (idx >= 0) ch.expressions[idx] = structuredClone(prefab);
        else ch.expressions.push(structuredClone(prefab));
      }
    }
  }
  return out;
}

/** Catálogo por defecto (base + overrides del repositorio). La app añade los locales del usuario. */
export const catalog: Catalog = applyOverrides(baseCatalog, repoOverrides);

export function isPlaceholderCatalog(c: Catalog): boolean {
  return c.source.kind === "placeholder";
}

export function findCharacter(c: Catalog, id: string): Character | undefined {
  return c.characters.find((ch) => ch.id === id);
}

export function findPose(c: Catalog, characterId: string, poseId: string): Pose | undefined {
  return findCharacter(c, characterId)?.poses.find((p) => p.id === poseId);
}

export function findExpression(c: Catalog, characterId: string, expressionId: string): ExpressionPrefab | undefined {
  return findCharacter(c, characterId)?.expressions.find((e) => e.id === expressionId);
}

export function findFaceAsset(ch: Character, assetId: string): FaceAsset | undefined {
  return ch.face.eyes.find((a) => a.id === assetId) ?? ch.face.brows.find((a) => a.id === assetId) ?? ch.face.mouths.find((a) => a.id === assetId);
}

export function findBackground(c: Catalog, id: string) {
  return c.backgrounds.find((b) => b.id === id);
}

export function findProp(c: Catalog, id: string) {
  return c.props.find((p) => p.id === id);
}

export function emotionLabel(c: Catalog, emotion: string): string {
  return c.emotionLabels?.[emotion] ?? emotion;
}

/** Expresión de un personaje para una emoción genérica, o su fallback declarado. */
export function expressionForEmotion(
  c: Catalog,
  characterId: string,
  emotion: string,
): { expression: ExpressionPrefab | undefined; usedFallback: boolean } {
  const ch = findCharacter(c, characterId);
  if (!ch) return { expression: undefined, usedFallback: false };
  const exact = ch.expressions.find((e) => e.emotion === emotion);
  if (exact) return { expression: exact, usedFallback: false };
  return { expression: ch.expressions.find((e) => e.id === ch.fallbackExpressionId), usedFallback: true };
}

/** Estado de una combinación personaje + expresión + pose. */
export function variantStatus(pose: Pose | undefined, e: ExpressionPrefab | undefined): { rig: "estimated" | "derived" | "calibrated" | "missing"; prefab: "draft" | "final" | "missing"; poseSpecific: boolean } {
  return {
    rig: pose?.rig ? pose.rig.status : "missing",
    prefab: e ? e.status : "missing",
    poseSpecific: Boolean(pose && e?.poseOverrides?.[pose.id]),
  };
}
