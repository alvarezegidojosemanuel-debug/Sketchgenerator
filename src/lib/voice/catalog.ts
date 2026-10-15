/**
 * Voces neuronales gratuitas (Piper, se ejecutan en el navegador). Licencias comprobadas en el
 * MODEL_CARD de cada voz (huggingface.co/rhasspy/piper-voices, v1.0.0): todas permiten uso comercial;
 * las marcadas con `attribution` piden citar la fuente (p. ej. en la descripción del vídeo).
 */
export interface PiperVoice {
  id: string;
  label: string;
  accent: "España" | "México" | "Argentina";
  /** Ruta dentro de rhasspy/piper-voices (sin extensión). */
  path: string;
  /** Voces con varios hablantes: nombre → id. */
  speakers?: Record<string, number>;
  license: string;
  attribution?: string;
  sizeMB: number;
}

export const PIPER_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0";

export const PIPER_VOICES: PiperVoice[] = [
  { id: "es_ES-davefx-medium", label: "davefx (hombre)", accent: "España", path: "es/es_ES/davefx/medium/es_ES-davefx-medium", license: "CC0", sizeMB: 61 },
  { id: "es_ES-sharvard-medium", label: "sharvard", accent: "España", path: "es/es_ES/sharvard/medium/es_ES-sharvard-medium", speakers: { Hombre: 0, Mujer: 1 }, license: "CC BY 3.0", attribution: "Voz «sharvard» (Piper), corpus Sharvard – CC BY 3.0", sizeMB: 74 },
  { id: "es_ES-carlfm-x_low", label: "carlfm (hombre)", accent: "España", path: "es/es_ES/carlfm/x_low/es_ES-carlfm-x_low", license: "Dominio público", sizeMB: 27 },
  { id: "es_ES-mls_10246-low", label: "mls 10246", accent: "España", path: "es/es_ES/mls_10246/low/es_ES-mls_10246-low", license: "CC BY 4.0", attribution: "Voz «mls_10246» (Piper), Multilingual LibriSpeech – CC BY 4.0", sizeMB: 61 },
  { id: "es_ES-mls_9972-low", label: "mls 9972", accent: "España", path: "es/es_ES/mls_9972/low/es_ES-mls_9972-low", license: "CC BY 4.0", attribution: "Voz «mls_9972» (Piper), Multilingual LibriSpeech – CC BY 4.0", sizeMB: 61 },
  { id: "es_MX-ald-medium", label: "ald (hombre)", accent: "México", path: "es/es_MX/ald/medium/es_MX-ald-medium", license: "Unlicense", sizeMB: 61 },
  { id: "es_MX-claude-high", label: "claude", accent: "México", path: "es/es_MX/claude/high/es_MX-claude-high", license: "Apache 2.0", sizeMB: 61 },
  { id: "es_AR-daniela-high", label: "daniela (mujer)", accent: "Argentina", path: "es/es_AR/daniela/high/es_AR-daniela-high", license: "CC BY-SA 4.0", attribution: "Voz «daniela» (Piper), Google crowdsourced es-AR – CC BY-SA 4.0", sizeMB: 109 },
];

export interface CastEntry {
  voiceId: string;
  speaker?: number;
  /** Tono: 1 = original. Se cambia sin alterar la velocidad. */
  pitch: number;
  /** Velocidad: 1 = original. */
  speed: number;
}

/** Reparto por defecto (se puede cambiar por proyecto en Ver → Reparto de voces). */
export const DEFAULT_CAST: Record<string, CastEntry> = {
  usu: { voiceId: "es_ES-davefx-medium", pitch: 1.12, speed: 1.05 },
  reynaldo: { voiceId: "es_ES-sharvard-medium", speaker: 0, pitch: 1.08, speed: 1.08 },
  sister: { voiceId: "es_ES-sharvard-medium", speaker: 1, pitch: 1.04, speed: 1.02 },
  barbas: { voiceId: "es_ES-davefx-medium", pitch: 0.86, speed: 0.95 },
  jefe: { voiceId: "es_ES-sharvard-medium", speaker: 0, pitch: 0.88, speed: 0.95 },
  narrador: { voiceId: "es_ES-davefx-medium", pitch: 0.94, speed: 0.92 },
};

/** Clave de reparto del narrador (diálogos sin actorUid). */
export const NARRATOR_ID = "narrador";

/** Personajes que necesitan voz en el proyecto (+ narrador si hay voz en off). */
export function castIds(project: { takes: { actors: { characterId: string }[]; events: { track: string; actorUid?: string }[] }[] }): string[] {
  const ids = [...new Set(project.takes.flatMap((t) => t.actors.map((a) => a.characterId)))];
  if (project.takes.some((t) => t.events.some((e) => e.track === "dialogue" && !e.actorUid))) ids.push(NARRATOR_ID);
  return ids;
}

/** characterId de la voz que dice un diálogo. */
export function speakerCharacterId(take: { actors: { uid: string; characterId: string }[] }, actorUid: string | undefined): string {
  if (!actorUid) return NARRATOR_ID;
  return take.actors.find((a) => a.uid === actorUid)?.characterId ?? "";
}

export function findPiperVoice(id: string): PiperVoice | undefined {
  return PIPER_VOICES.find((v) => v.id === id);
}

export function castFor(characterId: string, cast?: Record<string, CastEntry>): CastEntry {
  return cast?.[characterId] ?? DEFAULT_CAST[characterId] ?? { voiceId: "es_ES-davefx-medium", pitch: 1, speed: 1 };
}

/** Créditos que hay que incluir (voces con licencia de atribución usadas en el reparto). */
export function attributionsFor(cast: Record<string, CastEntry>, characterIds: string[]): string[] {
  const out = new Set<string>();
  for (const c of characterIds) {
    const v = findPiperVoice(castFor(c, cast).voiceId);
    if (v?.attribution) out.add(v.attribution);
  }
  return [...out];
}
