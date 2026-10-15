"use client";
/** Casting de voces a medida: descripciones de partida por personaje y llamadas a /api/voice/design y /save. */

export interface CastingPreset {
  /** Cómo debe sonar (para ElevenLabs, en español). */
  description: string;
  /** Frase de prueba en su papel (100–1000 caracteres). */
  sample: string;
}

export const CASTING: Record<string, CastingPreset> = {
  jefe: {
    description:
      "Hombre español de unos 45 años con acento de Madrid. Voz cálida, segura y cercana de líder de equipo, algo nasal, con energía. Habla rápido y se acelera cuando se enfada; de repente se queda en blanco y duda. Tono natural de oficina, nada de locutor.",
    sample:
      "¿Cambios? ¿Qué cambios? A ver, a ver… que nadie toque nada. Esto lo arreglo yo en cinco minutos. ¿Qué estaba diciendo? Bueno, da igual: eso se lo preguntaré al Jefe del pasado.",
  },
  sister: {
    description:
      "Mujer española de unos 35 años con acento de Madrid. Voz dulce, clara y cálida, muy resolutiva y organizada; cuando defiende a los suyos se vuelve firme y directa. Habla con naturalidad y una pizca de ironía cariñosa. Nada de locutora.",
    sample:
      "Jefe, la reunión es el viernes a las diez. Te la he apuntado en el calendario, en un pósit y en la mano, por si acaso. Y no, no te puedes escapar: ya he avisado al Director de que vas.",
  },
  barbas: {
    description:
      "Hombre español corpulento de unos 45 años, voz de dibujo animado: grave, ancha y redonda, un poco tapada y nasal, como de mofletes grandes. Habla despacio y arrastrando las palabras, con tono de buenazo ingenuo y algo bobalicón, pero con picardía: suelta pullas con una risita tonta por lo bajo. Respira fuerte y resopla entre frases. Muy expresivo, nada de locutor.",
    sample:
      "Ehhh… yo no digo nada, Jefe, ¿eh? Je, je, je. Pero lo ha dicho mirando tu silla. Uff… Que no, hombre, que es broma. Bueno… un poquito no es broma. Te lo digo con todo el amor del mundo, ¿eh? Je, je.",
  },
  usu: {
    description:
      "Hombre español de unos 40 años. Voz entusiasta y nerviosa de genio loco y despistado, habla deprisa, sube el tono cuando se le ocurre una idea y se ríe solo de sus ocurrencias. Muy expresivo pero natural, acento de España, nada de locutor.",
    sample:
      "¡Tranquilos! Lo tengo. Un parche. Pequeñito. Bueno, mediano. Vale, el parche más grande que se ha hecho nunca. Pero va a funcionar, os lo juro. Draco, pásame el destornillador; Humillos, tú no, que te comes los cables.",
  },
  reynaldo: {
    description:
      "Hombre español de unos 38 años. Voz seca, precisa y tranquila de trabajador meticuloso que conoce sus derechos, con un punto de sarcasmo cansado. Pronuncia todo con exactitud y suspira a menudo. Acento de España, natural, nada de locutor.",
    sample:
      "Son las seis en punto. Según el artículo treinta y cuatro del convenio, mi jornada ha terminado. Si alguien quiere que me quede, que me lo pida por escrito y con copia al sindicato. Buenas tardes a todos.",
  },
  narrador: {
    description:
      "Narrador español de unos 50 años, voz grave y elegante de documental, con un toque irónico, ritmo pausado y dramático. Acento de España neutro.",
    sample:
      "Viernes. Seis menos un minuto. En el departamento de soporte nadie sospechaba que, en sesenta segundos, todo iba a cambiar para siempre. Bueno… casi todo. La cafetera seguía sin funcionar.",
  },
  extra_director: {
    description:
      "Hombre español de unos 55 años, voz engolada y segura de alto directivo con sonrisa comercial, que pasa de amable a gritar con autoridad en un segundo. Acento de Madrid, nada de locutor.",
    sample:
      "Buenos días, equipo. Quiero resultados, quiero eficiencia y quiero esa incidencia cerrada antes del viernes. ¿Que no? ¡Pues fuera de mi despacho! ¡Y mándame una reunión para el viernes a primera hora!",
  },
};

export function presetFor(cid: string, label: string): CastingPreset {
  return (
    CASTING[cid] ?? {
      description: `Voz española natural para «${label}», personaje secundario de una comedia de oficina. Acento de España, nada de locutor.`,
      sample: "Hola, buenos días. Perdonen que les moleste, pero creo que aquí ha pasado algo muy raro y alguien me lo tiene que explicar ahora mismo, por favor.",
    }
  );
}

export interface DesignPreview {
  id: string;
  audio: string;
}

export type DesignModel = "eleven_ttv_v3" | "eleven_multilingual_ttv_v2";

export async function designVoices(code: string, description: string, text: string, model: DesignModel = "eleven_ttv_v3"): Promise<DesignPreview[]> {
  const r = await fetch("/api/voice/design", { method: "POST", headers: { "content-type": "application/json", "x-pocket-code": code }, body: JSON.stringify({ description, text, model }) });
  const j = (await r.json().catch(() => ({}))) as { previews?: DesignPreview[]; message?: string };
  if (!r.ok || !j.previews) throw new Error(j.message ?? `Error ${r.status}`);
  return j.previews;
}

export async function saveDesignedVoice(code: string, name: string, description: string, generatedVoiceId: string): Promise<{ voiceId: string; name: string }> {
  const r = await fetch("/api/voice/save", { method: "POST", headers: { "content-type": "application/json", "x-pocket-code": code }, body: JSON.stringify({ name, description, generatedVoiceId }) });
  const j = (await r.json().catch(() => ({}))) as { voiceId?: string; name?: string; message?: string };
  if (!r.ok || !j.voiceId) throw new Error(j.message ?? `Error ${r.status}`);
  return { voiceId: j.voiceId, name: j.name ?? name };
}
