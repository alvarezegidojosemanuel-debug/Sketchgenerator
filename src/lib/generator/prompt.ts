import { loreBlock } from "./lore";
import type { Catalog, Character } from "@/lib/catalog/types";
import { LIMITS, SCHEMA_VERSION, type PocketProject } from "@/lib/schema/pocket";

export const DURATIONS = [15, 30, 45, 60] as const;
export type SketchDuration = (typeof DURATIONS)[number];

export const TONES = [
  { id: "absurdo", label: "Absurdo" },
  { id: "sarcastico", label: "Sarcástico" },
  { id: "costumbrista", label: "Costumbrista" },
  { id: "surrealista", label: "Surrealista" },
  { id: "blanco", label: "Humor blanco" },
  { id: "negro", label: "Humor negro suave" },
] as const;

export interface SketchIntent {
  idea: string;
  duration: SketchDuration;
  characterIds: string[];
  tone: string;
  /** null = que elija el modelo entre los del catálogo. */
  backgroundId: string | null;
}

export interface PromptResult {
  prompt: string;
  warnings: string[];
}

const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

function characterBlock(ch: Character): string {
  const poses = ch.poses.map((p) => `${p.id} (${p.label})`).join(", ");
  const exprs = sortById(ch.expressions).map((e) => `${e.id} [${e.emotion}]`).join(", ");
  return [
    `- characterId "${ch.id}" — ${ch.name}${ch.hasEyes ? "" : " (lleva gafas de sol dibujadas: los eventos \"eyes\" no se ven)"}`,
    `  poses (poseId): ${poses}`,
    `  expresiones (expressionId, válidas en todas sus poses): ${exprs}`,
    `  fallback de expresión: ${ch.fallbackExpressionId}`,
  ].join("\n");
}

/** Ejemplo breve y VÁLIDO construido solo con IDs reales del catálogo. */
export function buildExample(catalog: Catalog, chars: Character[], backgroundId: string | null): PocketProject {
  const a = chars[0];
  const b = chars[1] ?? chars[0];
  const twoActors = chars.length > 1;
  const exprOf = (ch: Character, emotion: string) =>
    (ch.expressions.find((e) => e.emotion === emotion) ?? ch.expressions.find((e) => e.id === ch.fallbackExpressionId))!.id;
  const bg = backgroundId ?? sortById(catalog.backgrounds)[0]?.id ?? null;
  return {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion: catalog.catalogVersion,
    metadata: { title: "Ejemplo", language: "es-ES", approxDuration: 4 },
    canvas: { width: 1080, height: 1920 },
    takes: [
      {
        id: "take_1",
        name: "Toma 1",
        duration: 4,
        backgroundId: bg,
        actors: [
          { uid: "a1", characterId: a.id, poseId: a.poses[0].id, x: 300, y: 1780, scale: 1, zIndex: 1, expressionId: exprOf(a, "neutral") },
          ...(twoActors ? [{ uid: "a2", characterId: b.id, poseId: b.poses[0].id, x: 780, y: 1780, scale: 1, zIndex: 2, expressionId: exprOf(b, "neutral") }] : []),
        ],
        events: [
          { id: "e1", track: "dialogue", actorUid: "a1", start: 0, duration: 1.8, text: "¿Quién ha dejado esto aquí?" },
          { id: "e2", track: "face", actorUid: twoActors ? "a2" : "a1", start: 1.9, duration: 0.5, expressionId: exprOf(twoActors ? b : a, "sorpresa") },
          {
            id: "e3",
            track: "body",
            actorUid: twoActors ? "a2" : "a1",
            start: 1.9,
            duration: 0.6,
            poseId: (twoActors ? b : a).poses[(twoActors ? b : a).poses.length - 1].id,
          },
          { id: "e4", track: "dialogue", actorUid: twoActors ? "a2" : "a1", start: 2.2, duration: 1.6, text: "Yo no he sido.", voice: { rate: 1.05, pitch: 0.9 } },
          { id: "e5", track: "eyes", actorUid: "a1", start: 2.2, duration: 0.3, gazeX: 0.8, gazeY: 0 },
        ],
      },
    ],
  };
}

/**
 * Prompt determinista (mismas entradas → mismo texto). Se copia a ChatGPT en
 * modo manual y se envía tal cual a OpenRouter en modo API.
 */
export function buildPrompt(intent: SketchIntent, catalog: Catalog): PromptResult {
  const warnings: string[] = [];
  const requested = [...new Set(intent.characterIds)];
  const chars = requested
    .map((id) => catalog.characters.find((c) => c.id === id))
    .filter((c): c is Character => {
      return Boolean(c);
    });
  requested.forEach((id) => {
    if (!catalog.characters.some((c) => c.id === id)) warnings.push(`Personaje "${id}" no está en el catálogo; se ignora.`);
  });
  if (!chars.length) {
    chars.push(...catalog.characters.slice(0, 2));
    warnings.push("No se eligió ningún personaje válido; se usan los dos primeros del catálogo.");
  }
  let bgId = intent.backgroundId;
  if (bgId && !catalog.backgrounds.some((b) => b.id === bgId)) {
    warnings.push(`Escenario "${bgId}" no existe; el modelo elegirá uno del catálogo.`);
    bgId = null;
  }
  const tone = intent.tone.trim() || "absurdo";
  const idea = intent.idea.trim().replace(/\s+/g, " ").slice(0, 800) || "(sin idea concreta: inventa una situación cotidiana)";
  const takesHint = intent.duration <= 15 ? "1 o 2 tomas" : intent.duration <= 30 ? "2 a 4 tomas" : "3 a 6 tomas";

  const backgrounds = sortById(catalog.backgrounds).map((b) => `${b.id} (${b.label})`).join(", ");
  const props = sortById(catalog.props).map((p) => `${p.id} (${p.label}, ${p.height} px de alto)`).join(", ");
  const sounds = sortById(catalog.sounds ?? []).map((x) => `${x.id} (${x.label}, ${x.duration} s)`).join(", ");

  const example = JSON.stringify(buildExample(catalog, chars, bgId));

  const prompt = `Eres guionista de sketches cómicos cortos en español para PUÑETOS Pocket.
Escribe un sketch y devuélvelo como UN ÚNICO OBJETO JSON válido. Sin Markdown, sin \`\`\`, sin comentarios, sin texto antes ni después.

## Petición
- Idea: ${idea}
- Duración total aproximada: ${intent.duration} segundos (${takesHint}).
- Tono: ${tone}.
- Personajes (usa SOLO estos): ${chars.map((c) => c.name).join(", ")}.
- Escenario: ${bgId ? `"${bgId}" en todas las tomas salvo que la historia exija otro del catálogo` : "elige del catálogo el que mejor encaje"}.

## Universo
${loreBlock(chars.map((c) => c.id))}

## Catálogo (versión ${catalog.catalogVersion}). Usa EXACTAMENTE estos IDs; cualquier otro será rechazado.
Personajes:
${chars.map(characterBlock).join("\n")}
Fondos (backgroundId): ${backgrounds}
Objetos (propId; "y" = donde apoya su base): ${props}
Sonidos (soundId): ${sounds || "(ninguno)"}
Emociones genéricas: ${[...catalog.emotions].sort().join(", ")}

## Contrato JSON "${SCHEMA_VERSION}"
{
  "schemaVersion": "${SCHEMA_VERSION}",
  "catalogVersion": "${catalog.catalogVersion}",
  "metadata": { "title": string, "language": "es-ES", "approxDuration": number, "wishlist": [string] opcional },
  "canvas": { "width": 1080, "height": 1920 },
  "takes": [ {
    "id": string único, "name": string, "duration": segundos (>0, máx ${LIMITS.maxTakeDuration}),
    "backgroundId": ID de fondo o null,
    "actors": [ { "uid": string único en la toma, "characterId", "poseId" (del mismo personaje), "x": 0-1080 (centro), "y": 0-1920 (pies; suelo ≈ 1780), "scale": 0.7-1.2, "zIndex": entero, "flip": boolean opcional (espejo), "expressionId" inicial, "hidden": true opcional (empieza fuera de escena) } ],
    "events": [ { "id": string único, "track": ..., "actorUid": uid de un actor de ESTA toma (en "dialogue" se omite para el NARRADOR), "start": >= 0, "duration": > 0, ...campos del tipo } ]
  } ]
}
Tipos de evento (campo "track"):
- "dialogue": "text" (máx ${LIMITS.maxTextLength} caracteres; frases cortas), "voice" opcional { "rate": 0.5-2, "pitch": 0-2 }. Puedes añadir UNA acotación de voz entre corchetes y en inglés al principio de la frase para dar intención: [laughs], [sighs], [whispers], [shouts], [excited], [sarcastic], [nervous], [angry], [crying]. Ej.: "[sighs] Otra vez lunes."
    Sin "actorUid" = NARRADOR (voz en off de documental, nadie mueve la boca). Úsalo con moderación: intros, saltos de tiempo, remates.
    Sin "actorUid" pero con "speakerName": "Director" (o "Camarero", "Vecina"…) = secundario que habla EN OFF con su propia voz (no aparece en pantalla).
    Sin "actorUid" pero con "voiceOf": characterId = habla ese personaje con su voz SIN estar en escena como actor (fuera de cuadro, o dibujado como objeto, p. ej. de espaldas).
- "body": "poseId" opcional (pose del mismo personaje), "x"/"y"/"scale" opcionales (destino del movimiento), "ease": "linear" | "inOut" | "instant".
- "face": "expressionId" (expresión DEL MISMO personaje; cambia cejas, ojos y boca a la vez y se mantiene hasta el siguiente "face").
- "eyes": "gazeX", "gazeY" entre -1 y 1 (mirada: -1 izquierda/arriba, 1 derecha/abajo).
- "mouth": "mode": "auto" (la boca se anima sola durante los diálogos con las bocas de la expresión actual; normalmente no hace falta).
- "props": objeto visible durante su duración. "propId", "layer": "props-back" | "props-front", "x", "y" (base del objeto), "scale" opcional, "rot" (grados) opcional, "flip" opcional.
    Animación: "enter"/"exit": "pop" | "fade" | "slide" | "none"; "loop": "shake" (vibrar) | "pulse" (latir) | "blink" (parpadear) | "float" (flotar) | "spin" (girar) | "type" (teclear, p. ej. un personaje de espaldas dibujado como objeto) | "none";
    "altPropId" (+ "altEvery" s) alterna con otro objeto como animación de 2 fotogramas (p. ej. manos arriba/abajo tecleando); "toX"/"toY" para que se mueva de (x,y) a (toX,toY) durante el evento; "bubbleOf": uid de un actor → aparece DENTRO de un bocadillo de pensamiento sobre su cabeza (imaginación, deseos, recuerdos; x/y se ignoran).
    Para que un personaje "sostenga" un objeto: ponlo delante ("props-front") a la altura de su mano (x ±120 del actor, y ≈ actor.y − 300×scale).
- "sfx": sonido. "soundId", "volume" 0–1 opcional; "duration" ≈ la del sonido. Añade sonidos en los momentos clave (teléfono, alarma, golpe, aparición…).
- "screen": efecto de pantalla. "effect": "flash" (destello de color; "color": "#ff2a2a") | "shake" (temblor de cámara) | "darken" (oscurecer); sin actorUid.
- "screen" con "effect": "explosion" + "x", "y" (dónde, px del lienzo), "size" (0.3–3) y "text" opcional (onomatopeya, p. ej. "¡BUM!"): explosión de cómic con fuego, metralla y humo; acompáñala de sfx(sfx_explosion).
- "screen" también admite "effect": "bluescreen" + "text" (pantallazo azul a pantalla completa, como un error del sistema; máx. 120 caracteres).
- En "body" puedes añadir "fx": "jump" (salto de susto) | "shake" (temblar) | "type" (teclear en el ordenador) durante el evento.
- En "body", "appear": "fade" | "pop" | "flash" | "cut" hace ENTRAR en escena a un actor con "hidden": true; "disappear" (mismos valores) lo hace salir.

Recetas (combínalas con diálogos y reacciones):
- Teléfono que suena: props(móvil, "loop":"shake") + sfx(sfx_telefono) a la vez; luego el personaje reacciona (face sorpresa, body fx "jump").
- Alarma: screen("flash", "#ff2a2a") + sfx(sfx_alarma) + body fx "shake" en quien se asusta.
- Algo imaginario (p. ej. dragones de Usu): props con "bubbleOf":"<uid de Usu>", "enter":"pop", "loop":"float" + sfx(sfx_pop) al aparecer.
- Trabajando en su escritorio: si hay un objeto escritorio en el catálogo, ponlo en "props-front" con x = actor.x − 60, y = actor.y + 12 y "scale" para que mida ≈ 0,9 × la altura del personaje (≈ 600 px × su scale); tapa de la cintura para abajo y la cara sigue visible. Teclear: body fx "type" + sfx(sfx_teclado).
- Transformación (humano → puñeto): imagen del humano como objeto en la posición del actor (mismo x, y = actor.y) con "exit": "fade"; el actor con "hidden": true; a la vez screen("bluescreen") + sfx(sfx_pantallazo); al terminar el pantallazo, body "appear": "flash".
- Idea brillante: sfx(sfx_ding) + face alegría. Fracaso / remate: sfx(sfx_fracaso) + face tristeza. Golpe: screen "shake" + sfx(sfx_golpe).

## Reglas estrictas
1. Responde solo con el objeto JSON. Debe ser JSON.parse-able: comillas dobles, sin comas finales.
2. No inventes IDs: characterId, poseId, expressionId, backgroundId y propId deben salir del catálogo de arriba.
3. Si quieres una expresión que no existe, usa el fallback de expresión del personaje.
4. start + duration de cada evento <= duration de su toma. La suma de duraciones de las tomas ≈ ${intent.duration} s.
5. Diálogos breves (≈ 0,35 s por palabra + 0,5 s), ritmo cómico, remate final claro. Pon "voice" { "rate", "pitch" } distinto a cada personaje.
5b. TODOS los personajes de una escena pueden estar en la MISMA toma: no los repartas en tomas distintas salvo que la historia lo pida. Un personaje mide ≈ 500 px de ancho a escala 1. Coloca según cuántos haya en la toma (x, y, scale, zIndex):
   1: (540,1780,1,1) · 2: (300,1780,1,1) (780,1780,1,1) · 3: (200,1790,0.85,1) (540,1790,0.85,1) (880,1790,0.85,1)
   4: detrás (340,1650,0.7,1) (740,1650,0.7,1), delante (230,1810,0.8,2) (850,1810,0.8,2)
   5: detrás (310,1650,0.68,1) (770,1650,0.68,1), delante (180,1810,0.78,2) (540,1810,0.78,2) (900,1810,0.78,2)
   Para que dos personajes se miren usa poses 3/4 ("..._3q_right" a la izquierda, "..._3q_left" a la derecha) o "flip".
6. No solapes dos diálogos del mismo actor. Encadena acciones: reacción (face/body) justo antes o después de cada frase.
7. Máximo ${LIMITS.maxActorsPerTake} actores y ${LIMITS.maxEventsPerTake} eventos por toma. Nada de HTML, código ni URLs en los textos.
8. Si al sketch le vendría bien un objeto, escenario o sonido que NO está en el catálogo, NO lo inventes en los eventos: descríbelo en "metadata.wishlist" (lista de frases cortas, p. ej. "dragón pequeño verde volando", "sonido de puerta que chirría") y usa el sketch sin él.

## Ejemplo breve (válido, solo ilustrativo; tu sketch debe ser más largo)
${example}`;

  return { prompt, warnings };
}
