/**
 * Tipos del catálogo Pocket (V8). El catálogo es la ÚNICA fuente de IDs válidos:
 * validador, generador de prompts y renderer leen de aquí.
 *
 * Modelo facial (heredado de PUÑETOS STUDIO V8): el cuerpo (pose) no lleva cara;
 * ojos, cejas y boca son capas independientes superpuestas. Cada pose tiene un
 * "rig" con la posición/escala de cada hueco (slot) facial, y cada expresión
 * (prefab) dice qué pieza va en cada hueco. Expresión efectiva = personaje + emoción + pose.
 */

export type FaceSlot = "eyeL" | "eyeR" | "browL" | "browR" | "mouth";
export const FACE_SLOTS: FaceSlot[] = ["eyeL", "eyeR", "browL", "browR", "mouth"];

/** Posición del centro de la pieza en píxeles de la imagen de la pose; escala sobre el lienzo normalizado de la pieza. */
export interface SlotTransform {
  x: number;
  y: number;
  /** Escala en unidades de píxel ORIGINAL de la pieza (se compensa la normalización del asset). */
  scale: number;
  rot?: number;
  /** Recorte elíptico [rx, ry, dx?, dy?] en px de la pose, centrado en el slot (+dx, dy):
   *  interior de las gafas de Reynaldo, contorno de la barba de Barbas. */
  clip?: number[];
}

export interface FaceRig {
  eyeL?: SlotTransform;
  eyeR?: SlotTransform;
  browL?: SlotTransform;
  browR?: SlotTransform;
  mouth?: SlotTransform;
  /** estimated = calculado automáticamente; derived = extendido desde calibraciones a mano; calibrated = ajustado por una persona. */
  status: "estimated" | "derived" | "calibrated";
  source?: string;
  review?: string;
}

export interface Pose {
  /** ID real V8, p. ej. "char.usu.pose_neutral_front". */
  id: string;
  /** Clave de pose compartida entre personajes, p. ej. "pose_neutral_front". */
  key: string;
  label: string;
  src: string;
  width: number;
  height: number;
  /** Factor para que todas las poses midan lo mismo en el lienzo 1080×1920. */
  displayScale: number;
  facing: "front" | "left" | "right";
  rig?: FaceRig;
  /** Pose dibujada entera (con la cara incluida, sin capas faciales): humanos y poses de ChatGPT. */
  flat?: boolean;
  /** Misma pose con la boca abierta (pose «flat»): se muestra mientras el personaje habla. */
  talkSrc?: string;
  /** Aspecto: «humano» (antes del parche) o «puneto». Sin valor = Puñeto. */
  look?: "humano" | "puneto";
}

export interface FaceAsset {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  /** Caja del contenido visible dentro del lienzo normalizado [x0, y0, x1, y1]. */
  bbox: [number, number, number, number];
  /** pair = la imagen contiene los dos lados (se recorta por mitades); single = un solo elemento. */
  kind: "pair" | "single";
  includesBrows?: boolean;
  slope?: number;
  curve?: number;
  /** Contenido normalizado / original: se divide la escala para respetar el tamaño original. */
  normScale?: number;
  /** Puntos de anclaje en px del lienzo normalizado (pieza completa o cada mitad). Bocas: labio superior. */
  anchors?: { full?: [number, number]; left?: [number, number]; right?: [number, number] };
  /** Cristal [cx, cy, rx, ry] de cada mitad (ojos con montura). */
  lens?: { left?: [number, number, number, number]; right?: [number, number, number, number] };
  /** Suavizar los bordes del recorte al componer (piezas con trozo de barba). */
  feather?: boolean;
  note?: string;
  original?: string;
}

/** Referencia a una pieza dentro de un prefab. */
export interface PartRef {
  assetId: string;
  /** Mitad del lienzo a mostrar (para piezas dobles). Sin crop = pieza completa. */
  crop?: "left" | "right";
  flip?: boolean;
  dx?: number;
  dy?: number;
  /** Multiplicador de escala sobre el slot. */
  dscale?: number;
  rot?: number;
}

export interface SlotAdjust {
  dx?: number;
  dy?: number;
  dscale?: number;
  rot?: number;
}

export interface ExpressionPrefab {
  /** p. ej. "expression.usu.enfado" (formato de IDs de V8). */
  id: string;
  emotion: string;
  label: string;
  /** draft = borrador creado por Pocket sin revisar; final = revisado y guardado. */
  status: "draft" | "final";
  eyeL?: PartRef | null;
  eyeR?: PartRef | null;
  browL?: PartRef | null;
  browR?: PartRef | null;
  mouth: PartRef;
  /** Bocas abiertas para el lip-sync aproximado. */
  talk: string[];
  /** Ajustes específicos personaje+emoción+pose. */
  poseOverrides?: Record<string, Partial<Record<FaceSlot, SlotAdjust>>>;
  custom?: boolean;
}

export interface Character {
  id: string;
  name: string;
  color: string;
  defaultVoice: { pitch: number; rate: number };
  /** false para Usu y Jefe: las gafas de sol están dibujadas en el cuerpo. */
  hasEyes: boolean;
  poses: Pose[];
  face: { eyes: FaceAsset[]; brows: FaceAsset[]; mouths: FaceAsset[] };
  expressions: ExpressionPrefab[];
  fallbackExpressionId: string;
}

export interface Background {
  id: string;
  label: string;
  src: string;
  placeholder?: boolean;
  user?: boolean;
}

export interface Prop {
  id: string;
  label: string;
  src: string;
  width: number;
  height: number;
  placeholder?: boolean;
  user?: boolean;
}

export interface Sound {
  id: string;
  label: string;
  /** URL del audio, o "synth:<nombre>" para los sonidos sintetizados incluidos. */
  src: string;
  /** Duración aproximada (s). */
  duration: number;
  builtin?: boolean;
  user?: boolean;
}

export interface Catalog {
  catalogVersion: string;
  source: {
    kind: "placeholder" | "v8-library-index";
    note: string;
    license?: string;
    generatedAt?: string;
  };
  canvas: { width: number; height: number };
  emotions: string[];
  emotionLabels?: Record<string, string>;
  characters: Character[];
  backgrounds: Background[];
  props: Prop[];
  sounds?: Sound[];
}

/** Calibraciones y prefabs guardados por el usuario (IndexedDB / archivo exportado). */
export interface FaceOverrides {
  kind: "pocket-face-overrides";
  version: 1;
  catalogVersion: string;
  updatedAt: string;
  rigs: Record<string, FaceRig>;
  expressions: Record<string, ExpressionPrefab & { characterId: string }>;
}
