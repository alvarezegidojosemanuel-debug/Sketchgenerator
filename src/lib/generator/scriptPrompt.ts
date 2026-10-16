/**
 * Prompt para que ChatGPT escriba SOLO el guion (formato «puñetos-guion-1»); Pocket monta la escena.
 * Incluye el universo, el método de escritura de la serie y lo que existe en el catálogo.
 */
import type { Catalog } from "@/lib/catalog/types";
import { GUION_EJEMPLO, OFFICE_BGS } from "@/lib/script/compile";
import { loreBlock } from "./lore";
import type { PromptResult, SketchIntent } from "./prompt";

export function buildScriptPrompt(intent: SketchIntent, catalog: Catalog): PromptResult {
  const warnings: string[] = [];
  const chars = intent.characterIds.map((id) => catalog.characters.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  if (!chars.length) chars.push(...catalog.characters.slice(0, 2));
  const names = chars.map((c) => c.name).join(", ");
  const lugares = catalog.backgrounds
    .filter((b) => !b.placeholder || !catalog.backgrounds.some((x) => !x.placeholder && x.label.split(" ")[0] === b.label.split(" ")[0]))
    .map((b) => `${b.id} (${b.label}${b.placeholder ? ", provisional" : ""}${OFFICE_BGS.includes(b.id) ? ", admite vista «espaldas»" : ""}${b.standing === false ? ", SOLO plano general: sin personajes" : ""})`)
    .join("; ");
  const objetos = catalog.props.filter((p) => !p.id.includes("_espaldas_")).map((p) => `${p.id} (${p.label})`).join("; ");
  const sonidos = (catalog.sounds ?? []).map((s) => `${s.id.replace(/^sfx_/, "")} (${s.label})`).join("; ");
  const bg = intent.backgroundId ? catalog.backgrounds.find((b) => b.id === intent.backgroundId) : undefined;
  const idea = intent.idea.trim().replace(/\s+/g, " ").slice(0, 800) || "(sin idea concreta: propón una situación cotidiana)";

  const prompt = `Eres guionista de PUÑETOS, una serie de sketches cómicos cortos para redes sociales.
Escribe SOLO EL GUION de un sketch y devuélvelo como UN ÚNICO OBJETO JSON válido (sin Markdown, sin \`\`\`, sin texto antes ni después).
No pongas tiempos, coordenadas ni posiciones: Pocket monta la escena solo (coloca a los personajes, calcula los tiempos con la voz real, mueve bocas, miradas, bocadillos y cámara).

## Petición
- Idea: ${idea}
- Duración aproximada: ${intent.duration} segundos.
- Tono: ${intent.tone.trim() || "absurdo"}.
- Personajes: ${names}.${bg ? `\n- Lugar principal: ${bg.id}.` : ""}

## Universo
${loreBlock(chars.map((c) => c.id))}

## Cómo escribir (muy importante)
1. UNA sola idea cómica por sketch que crece hasta un REMATE final claro. Pocas bromas, bien colocadas; no cada frase tiene que ser un chiste.
2. Que los rasgos se VEAN en lo que hacen y dicen, no que los expliquen. Las muletillas, como mucho una vez cada una.
3. Diálogo natural de España: frases cortas, respuestas rápidas, interrupciones. Usa silencios ("pausa") antes del remate y "coro" cuando varios dicen lo mismo a la vez.
4. Acotaciones de voz en inglés entre corchetes al principio de la frase cuando ayuden a la interpretación: [mischievously], [chuckles], [sighs], [angry], [whispers], [excited], [laughs]. Barbas casi siempre con picardía ([mischievously] o [chuckles]).
5. Cada escena: 4–12 pasos. 1–3 escenas por sketch.
6. Vista: "humanos" = humanos de frente (antes del parche; si a alguno le faltan poses humanas, Pocket los pone de espaldas en la oficina); "espaldas" = humanos de espaldas en sus mesas; "puñetos" = los Puñetos de frente (lo normal después del parche).

## Lo que existe (usa SOLO esto)
- Personajes: Usu, Reynaldo, Sister, Barbas, Jefe ; el Director, Neli y Gala (solo en vista «humanos»). Otros secundarios (camarero, vecina…): con "off" (se les oye, no se les ve).
- Lugares (lugar): ${lugares}
- Emociones: neutral, alegria, risa, enfado, sorpresa, tristeza.
- Gestos (vista puñetos): explica, enfatiza, señala, brazos_cruzados, reacciona, frente.
- Gestos (vista humanos): explica, señala, confundido, panico, sorprendido, susto, pensando, celebra, movil, encoge, camina, corre, entra, sentado (hablando en su mesa), teclea, cansado.
- Objetos (objeto): ${objetos}
- Sonidos (sonido): ${sonidos}
- Efectos (efecto): explosion (con "donde": personaje y "texto": onomatopeya), pantallazo (pantallazo azul), destello, temblor, oscuro.
- Recursos de cómic (efecto + "donde": personaje): sudor, sorpresa, enfado, lineas (sale corriendo), risa, onomatopeya (con "texto", p. ej. "¡ZAS!"). Pocket ya pone solos el sudor en el pánico, la sorpresa al asustarse, las líneas al caminar o correr y los «JA» en la risa: úsalos a mano solo para rematar un momento.
Si el sketch necesitaría algo que no existe (un lugar, un objeto, un personaje secundario visible…), NO lo inventes: descríbelo en "faltan": [frases cortas].

## Formato
{ "formato": "puñetos-guion-1", "titulo": string, "idea": string, "faltan": [string] opcional,
  "escenas": [ { "nombre": string, "lugar": id de lugar, "vista": "humanos" | "espaldas" | "puñetos", "personajes": [nombres presentes], "camara": "auto" opcional,
    "pasos": [ uno de estos en orden:
      { "dice": personaje, "texto": string, "emocion": opcional, "gesto": opcional, "pausa_despues": segundos opcional }
      { "narrador": string }
      { "off": "Director", "texto": string }
      { "coro": [personajes], "texto": string }
      { "pausa": segundos }
      { "mira": personaje, "a": personaje }
      { "cara": personaje, "emocion": string }
      { "quien": personaje, "gesto": string }
      { "entra": personaje } / { "sale": personaje }
      { "salta": personaje } / { "tiembla": personaje }
      { "sonido": nombre }
      { "efecto": nombre, "donde": personaje opcional, "texto": opcional }
      { "objeto": id, "donde": "izquierda" | "centro" | "derecha" | "bocadillo_<personaje>", "anim": "flota" | "vibra" | "late" | "gira" opcional }
    ] } ] }

## Ejemplo (solo para ver el formato; escribe tu propio sketch)
${JSON.stringify(GUION_EJEMPLO)}`;
  return { prompt, warnings };
}
