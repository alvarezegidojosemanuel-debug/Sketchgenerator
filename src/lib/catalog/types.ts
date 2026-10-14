/**
 * Tipos del catálogo Pocket. El catálogo es la ÚNICA fuente de IDs válidos:
 * el validador, el generador de prompts y el renderer leen de aquí.
 */

/** Punto normalizado (0..1) dentro de la imagen de la pose. */
export interface Anchor {
  x: number;
  y: number;
}

export interface PoseAnchors {
  /** Centro de la superposición de expresión (cara). */
  face?: Anchor;
  /** Centro de la boca. Si falta, la boca usa el fallback manual del proyecto. */
  mouth?: Anchor;
  eyeL?: Anchor;
  eyeR?: Anchor;
}

export interface Pose {
  id: string;
  label: string;
  src: string;
  width: number;
  height: number;
  anchors?: PoseAnchors;
}

export interface Expression {
  id: string;
  /** Emoción genérica a la que corresponde (neutral, feliz, ...). */
  emotion: string;
  label: string;
  /** Imagen superpuesta sobre la cara; null si la expresión no tiene capa propia. */
  src: string | null;
  width?: number;
  height?: number;
}

export interface Character {
  id: string;
  name: string;
  /** Color de interfaz (no afecta a assets). */
  color: string;
  defaultVoice: { pitch: number; rate: number };
  poses: Pose[];
  expressions: Expression[];
  /** Expresión declarada como fallback cuando se pide una no registrada. */
  fallbackExpressionId: string;
}

export interface Background {
  id: string;
  label: string;
  src: string;
}

export interface Prop {
  id: string;
  label: string;
  src: string;
  width: number;
  height: number;
}

export interface MouthAsset {
  id: string;
  kind: "closed" | "open";
  src: string;
  width: number;
  height: number;
}

export interface Catalog {
  catalogVersion: string;
  source: {
    kind: "placeholder" | "v3-library-index";
    note: string;
    license?: string;
    generatedAt?: string;
  };
  canvas: { width: number; height: number };
  emotions: string[];
  characters: Character[];
  backgrounds: Background[];
  props: Prop[];
  mouths: MouthAsset[];
}
