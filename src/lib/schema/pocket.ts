import { z } from "zod";

z.config(z.locales.es());

/**
 * Contrato JSON canónico Pocket ("pocket-1").
 * Son campos PROPUESTOS para Pocket; no equivalen automáticamente al esquema
 * de PUÑETOS Studio V3/V8 (ver src/lib/adapters/v3.ts para la conversión).
 *
 * Coordenadas: píxeles del lienzo 1080×1920. (x, y) de un actor = punto de
 * apoyo de los pies (centro inferior de la imagen de pose).
 */

export const SCHEMA_VERSION = "pocket-1" as const;

export const LIMITS = {
  maxInputBytes: 300_000,
  maxTakes: 30,
  maxActorsPerTake: 8,
  maxPropsPerTake: 12,
  maxEventsPerTake: 200,
  maxEventsTotal: 1500,
  maxTakeDuration: 60,
  maxTotalDuration: 180,
  maxTextLength: 280,
  maxTitleLength: 120,
  maxIdLength: 80,
  minScale: 0.1,
  maxScale: 4,
  /** Margen permitido fuera del lienzo para entradas/salidas de escena. */
  margin: 600,
} as const;

const id = z
  .string()
  .min(1)
  .max(LIMITS.maxIdLength)
  .regex(/^[A-Za-z0-9_.:-]+$/, "solo letras, números, '_', '-', '.', ':'");

const time = z.number().finite().min(0, "debe ser >= 0");
const positive = z.number().finite().gt(0, "debe ser > 0");
const coordX = z.number().finite().min(-LIMITS.margin).max(1080 + LIMITS.margin);
const coordY = z.number().finite().min(-LIMITS.margin).max(1920 + LIMITS.margin);
const scale = z.number().finite().min(LIMITS.minScale).max(LIMITS.maxScale);
const zIndex = z.number().int().min(-100).max(100);

export const VoiceSettings = z.object({
  rate: z.number().finite().min(0.5).max(2).optional(),
  pitch: z.number().finite().min(0).max(2).optional(),
  /** Nombre de voz del navegador (Web Speech). Si no existe en el dispositivo se usa la por defecto. */
  voiceName: z.string().max(120).optional(),
});

const eventBase = {
  id,
  start: time,
  duration: positive,
};

export const DialogueEvent = z.object({
  ...eventBase,
  track: z.literal("dialogue"),
  actorUid: id,
  text: z.string().min(1).max(LIMITS.maxTextLength),
  voice: VoiceSettings.optional(),
});

export const BodyEvent = z.object({
  ...eventBase,
  track: z.literal("body"),
  actorUid: id,
  /** Nueva pose (ID del catálogo). Opcional: si falta se mantiene la actual. */
  poseId: id.optional(),
  /** Posición destino; se interpola desde la posición actual durante `duration`. */
  x: coordX.optional(),
  y: coordY.optional(),
  scale: scale.optional(),
  flip: z.boolean().optional(),
  ease: z.enum(["linear", "inOut", "instant"]).optional(),
});

export const FaceEvent = z.object({
  ...eventBase,
  track: z.literal("face"),
  actorUid: id,
  expressionId: id.optional(),
  /** Emoción genérica; se resuelve a una expresión del personaje (o su fallback declarado). */
  emotion: z.string().max(40).optional(),
});

export const MouthEvent = z.object({
  ...eventBase,
  track: z.literal("mouth"),
  actorUid: id,
  /** auto: anclaje del catálogo; calibrated: offset manual (dx, dy) en px de la pose. */
  mode: z.enum(["auto", "calibrated"]),
  dx: z.number().finite().min(-400).max(400).optional(),
  dy: z.number().finite().min(-400).max(400).optional(),
});

export const EyesEvent = z.object({
  ...eventBase,
  track: z.literal("eyes"),
  actorUid: id,
  gazeX: z.number().finite().min(-1).max(1),
  gazeY: z.number().finite().min(-1).max(1),
});

export const PropsEvent = z.object({
  ...eventBase,
  track: z.literal("props"),
  /** Opcional: actor relacionado (solo informativo en pocket-1). */
  actorUid: id.optional(),
  propId: id,
  layer: z.enum(["props-back", "props-front"]),
  x: coordX,
  y: coordY,
  scale: scale.optional(),
  zIndex: zIndex.optional(),
});

export const PocketEvent = z.discriminatedUnion("track", [
  DialogueEvent,
  BodyEvent,
  FaceEvent,
  MouthEvent,
  EyesEvent,
  PropsEvent,
]);

export const Actor = z.object({
  uid: id,
  characterId: id,
  poseId: id,
  x: coordX,
  y: coordY,
  scale: scale.default(1),
  zIndex: zIndex.default(0),
  flip: z.boolean().optional(),
  expressionId: id.optional(),
});

export const Take = z.object({
  id,
  name: z.string().max(LIMITS.maxTitleLength).optional(),
  duration: positive.max(LIMITS.maxTakeDuration),
  backgroundId: id.nullable(),
  actors: z.array(Actor).max(LIMITS.maxActorsPerTake),
  events: z.array(PocketEvent).max(LIMITS.maxEventsPerTake),
});

export const PocketProject = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  catalogVersion: z.string().min(1).max(80),
  metadata: z.object({
    title: z.string().min(1).max(LIMITS.maxTitleLength),
    language: z.string().min(2).max(20).default("es-ES"),
    approxDuration: positive.max(LIMITS.maxTotalDuration),
    idea: z.string().max(1000).optional(),
  }),
  canvas: z.object({ width: z.literal(1080), height: z.literal(1920) }),
  takes: z.array(Take).min(1).max(LIMITS.maxTakes),
});

export type VoiceSettings = z.infer<typeof VoiceSettings>;
export type DialogueEvent = z.infer<typeof DialogueEvent>;
export type BodyEvent = z.infer<typeof BodyEvent>;
export type FaceEvent = z.infer<typeof FaceEvent>;
export type MouthEvent = z.infer<typeof MouthEvent>;
export type EyesEvent = z.infer<typeof EyesEvent>;
export type PropsEvent = z.infer<typeof PropsEvent>;
export type PocketEvent = z.infer<typeof PocketEvent>;
export type Actor = z.infer<typeof Actor>;
export type Take = z.infer<typeof Take>;
export type PocketProject = z.infer<typeof PocketProject>;
export type Track = PocketEvent["track"];

export const TRACKS: Track[] = ["dialogue", "body", "face", "mouth", "eyes", "props"];

/** Orden de capas de profundidad del renderer. */
export const DEPTH_LAYERS = ["background", "props-back", "actors", "props-front"] as const;
