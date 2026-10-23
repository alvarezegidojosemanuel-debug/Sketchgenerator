import rawCatalog from "@/data/catalog.json";
import rawOverrides from "@/data/face-overrides.json";
import { BUILTIN_SOUNDS } from "@/lib/sfx/synth";

/**
 * Ambientes grabados de verdad (Freesound, CC0 — dominio público): call center de leonelmail (#579568) y oficina
 * de Chelly01 (#541117), en capas desfasadas para que el murmullo no se entienda, con un teléfono lejano (#119555).
 * Bucles de 60 s sin corte, a −30 LUFS.
 */
const RECORDED_SOUNDS: Sound[] = [
  { id: "sfx_ambiente_oficina", label: "Ambiente oficina (grabado)", src: "/assets/sfx/ambiente_oficina.mp3", duration: 60, builtin: true },
  { id: "sfx_ambiente_recepcion", label: "Ambiente recepción (grabado)", src: "/assets/sfx/ambiente_recepcion.mp3", duration: 60, builtin: true },
  // sintetizado (tools/sfx/pajaros.py): trinos, gorjeos lejanos y brisa, bucle de 30 s
  { id: "sfx_ambiente_pajaros", label: "Ambiente exterior · pájaros", src: "/assets/sfx/pajaros.mp3", duration: 30, builtin: true },
];
import type { Catalog, Character, ExpressionPrefab, FaceAsset, FaceOverrides, Pose, Sound } from "./types";

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

/** Catálogo por defecto (base + overrides del repositorio + sonidos incluidos). La app añade los locales del usuario. */
export const catalog: Catalog = { ...applyOverrides(baseCatalog, repoOverrides), sounds: [...BUILTIN_SOUNDS, ...RECORDED_SOUNDS] };

export function findSound(c: Catalog, id: string) {
  return c.sounds?.find((x) => x.id === id);
}

export function isPlaceholderCatalog(c: Catalog): boolean {
  return c.source.kind === "placeholder";
}

export function findCharacter(c: Catalog, id: string): Character | undefined {
  return c.characters.find((ch) => ch.id === id);
}

export function findPose(c: Catalog, characterId: string, poseId: string): Pose | undefined {
  return findCharacter(c, characterId)?.poses.find((p) => p.id === poseId);
}

/** Estatura de referencia de las láminas de poses humanas (todas se dibujan igual de altas). */
export const REF_HEIGHT_CM = 184;

/** Escala de dibujo de una pose: displayScale × estatura del personaje (solo poses humanas «flat»). */
export function poseScale(c: Catalog, characterId: string, pose: Pose | undefined): number {
  if (!pose) return 1;
  const h = pose.flat ? findCharacter(c, characterId)?.heightCm : undefined;
  return pose.displayScale * (h ? h / REF_HEIGHT_CM : 1);
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
