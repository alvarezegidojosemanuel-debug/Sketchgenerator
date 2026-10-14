import rawCatalog from "@/data/catalog.json";
import type { Catalog, Character, Expression, Pose } from "./types";

export type * from "./types";

/** Catálogo empaquetado con la app (generado por scripts/, no editar a mano). */
export const catalog = rawCatalog as Catalog;

export function isPlaceholderCatalog(c: Catalog): boolean {
  return c.source.kind === "placeholder";
}

export function findCharacter(c: Catalog, id: string): Character | undefined {
  return c.characters.find((ch) => ch.id === id);
}

export function findPose(c: Catalog, characterId: string, poseId: string): Pose | undefined {
  return findCharacter(c, characterId)?.poses.find((p) => p.id === poseId);
}

export function findExpression(c: Catalog, characterId: string, expressionId: string): Expression | undefined {
  return findCharacter(c, characterId)?.expressions.find((e) => e.id === expressionId);
}

export function findBackground(c: Catalog, id: string) {
  return c.backgrounds.find((b) => b.id === id);
}

export function findProp(c: Catalog, id: string) {
  return c.props.find((p) => p.id === id);
}

export function mouthFor(c: Catalog, kind: "closed" | "open") {
  return c.mouths.find((m) => m.kind === kind);
}

/** Expresión de un personaje para una emoción genérica, o su fallback declarado. */
export function expressionForEmotion(
  c: Catalog,
  characterId: string,
  emotion: string,
): { expression: Expression | undefined; usedFallback: boolean } {
  const ch = findCharacter(c, characterId);
  if (!ch) return { expression: undefined, usedFallback: false };
  const exact = ch.expressions.find((e) => e.emotion === emotion);
  if (exact) return { expression: exact, usedFallback: false };
  return { expression: ch.expressions.find((e) => e.id === ch.fallbackExpressionId), usedFallback: true };
}
