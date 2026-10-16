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
  maxTakeDuration: 180,
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
  /** Sin actorUid = narrador (voz en off, sin personaje en escena). */
  actorUid: id.optional(),
  /** Sin actorUid: voz de este personaje (characterId) fuera de cuadro o dibujado como objeto; si falta, narrador. */
  voiceOf: id.optional(),
  /** Sin actorUid ni voiceOf: secundario que habla en off (p. ej. «Director», «Camarero»), con su propia voz en el reparto. */
  speakerName: z.string().min(1).max(40).optional(),
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
  /** Efecto corporal durante el evento: temblar, saltar o teclear. */
  fx: z.enum(["shake", "jump", "type"]).optional(),
  /** Entrar en escena (aparece) o salir (desaparece) al inicio del evento. */
  appear: z.enum(["cut", "fade", "pop", "flash"]).optional(),
  disappear: z.enum(["cut", "fade", "pop", "flash"]).optional(),
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
  rot: z.number().finite().min(-180).max(180).optional(),
  flip: z.boolean().optional(),
  /** Cómo aparece / desaparece. */
  enter: z.enum(["none", "pop", "fade", "slide"]).optional(),
  exit: z.enum(["none", "pop", "fade", "slide"]).optional(),
  /** Animación mientras está visible (vibrar, latir, parpadear, flotar, girar). */
  loop: z.enum(["none", "shake", "pulse", "blink", "float", "spin", "type"]).optional(),
  /** Desplazamiento: va de (x,y) a (toX,toY) durante el evento. */
  toX: coordX.optional(),
  toY: coordY.optional(),
  /** Animación de 2 fotogramas: alterna propId ↔ altPropId cada altEvery segundos (p. ej. manos tecleando). */
  altPropId: id.optional(),
  altEvery: z.number().finite().min(0.05).max(2).optional(),
  /** Boca sincronizada: muestra altPropId (boca abierta) solo mientras habla este personaje (characterId). */
  talkOf: id.optional(),
  /** Dentro de un bocadillo de pensamiento sobre este actor (x/y se ignoran). */
  bubbleOf: id.optional(),
});

export const SfxEvent = z.object({
  ...eventBase,
  track: z.literal("sfx"),
  soundId: id,
  volume: z.number().finite().min(0).max(1).optional(),
  actorUid: id.optional(),
});

export const ScreenEvent = z.object({
  ...eventBase,
  track: z.literal("screen"),
  /** flash = destello de color (alarma), shake = temblor de cámara, darken = oscurecer, bluescreen = pantallazo azul con texto. */
  effect: z.enum(["flash", "shake", "darken", "bluescreen", "explosion", "comic"]),
  /** Recurso de cómic sobre un actor (effect «comic»): sudor, sorpresa, enfado, lineas, risa, onomatopeya (con text). */
  kind: z.enum(["sudor", "sorpresa", "enfado", "lineas", "risa", "onomatopeya"]).optional(),
  /** Explosión: dónde (px del lienzo) y tamaño. */
  x: coordX.optional(),
  y: coordY.optional(),
  size: z.number().finite().min(0.3).max(3).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  text: z.string().max(120).optional(),
  actorUid: id.optional(),
});

/** Cámara: corte seco a un plano (general, medio o primer plano de un actor, o un punto con zoom). */
export const CameraEvent = z.object({
  ...eventBase,
  track: z.literal("camera"),
  shot: z.enum(["wide", "medium", "close"]),
  actorUid: id.optional(),
  x: coordX.optional(),
  y: coordY.optional(),
  zoom: z.number().finite().min(1).max(3).optional(),
});

export const PocketEvent = z.discriminatedUnion("track", [
  DialogueEvent,
  BodyEvent,
  FaceEvent,
  MouthEvent,
  EyesEvent,
  PropsEvent,
  SfxEvent,
  ScreenEvent,
  CameraEvent,
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
  /** Empieza fuera de escena (invisible) hasta un evento body con "appear". */
  hidden: z.boolean().optional(),
});

export const Take = z.object({
  id,
  name: z.string().max(LIMITS.maxTitleLength).optional(),
  duration: positive.max(LIMITS.maxTakeDuration),
  backgroundId: id.nullable(),
  /** "auto": planos automáticos (general / medio / primer plano en el remate) si no hay eventos de cámara. */
  camera: z.enum(["fixed", "auto"]).optional(),
  /** Paso a la toma siguiente / desde la anterior: «fade» = fundido rápido a negro (0,3 s); sin valor = corte seco. */
  transition: z.enum(["cut", "fade"]).optional(),
  actors: z.array(Actor).max(LIMITS.maxActorsPerTake),
  events: z.array(PocketEvent).max(LIMITS.maxEventsPerTake),
});

/** Voz de un personaje (motor Piper): ver src/lib/voice/catalog.ts. */
export const CastEntry = z.object({
  voiceId: z.string().min(1).max(60),
  speaker: z.number().int().min(0).max(20).optional(),
  pitch: z.number().finite().min(0.7).max(1.4),
  speed: z.number().finite().min(0.6).max(1.6),
});

/** Voz ElevenLabs de un personaje. */
export const ElevenCast = z.object({
  voiceId: z.string().regex(/^[A-Za-z0-9]{8,40}$/),
  name: z.string().max(80).optional(),
  stability: z.number().min(0).max(1),
  similarity: z.number().min(0).max(1),
  style: z.number().min(0).max(1),
  speed: z.number().min(0.7).max(1.2),
  /** Modelo propio de este personaje (p. ej. v3 para un tono más exagerado con acotaciones). */
  model: z.enum(["eleven_multilingual_v2", "eleven_v3", "eleven_flash_v2_5"]).optional(),
});

export const PocketProject = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  catalogVersion: z.string().min(1).max(80),
  metadata: z.object({
    title: z.string().min(1).max(LIMITS.maxTitleLength),
    language: z.string().min(2).max(20).default("es-ES"),
    approxDuration: positive.max(LIMITS.maxTotalDuration),
    idea: z.string().max(1000).optional(),
    /** Reparto de voces por personaje (opcional; si falta se usa el reparto por defecto). */
    voices: z.record(id, CastEntry).optional(),
    /** Reparto de voces ElevenLabs por personaje. */
    elevenVoices: z.record(id, ElevenCast).optional(),
    /** Objetos, escenarios o sonidos que el guionista habría querido usar y no existen (para crearlos). */
    wishlist: z.array(z.string().max(120)).max(12).optional(),
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
export type SfxEvent = z.infer<typeof SfxEvent>;
export type ScreenEvent = z.infer<typeof ScreenEvent>;
export type CameraEvent = z.infer<typeof CameraEvent>;
export type PocketEvent = z.infer<typeof PocketEvent>;
export type Actor = z.infer<typeof Actor>;
export type Take = z.infer<typeof Take>;
export type PocketProject = z.infer<typeof PocketProject>;
export type Track = PocketEvent["track"];

export const TRACKS: Track[] = ["dialogue", "body", "face", "mouth", "eyes", "props", "sfx", "screen", "camera"];

/** Orden de capas de profundidad del renderer. */
export const DEPTH_LAYERS = ["background", "props-back", "actors", "props-front"] as const;
