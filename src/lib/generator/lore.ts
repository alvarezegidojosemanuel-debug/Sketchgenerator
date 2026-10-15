/** Universo PUÑETOS: lo que el guionista (ChatGPT) debe respetar en todos los sketches. */

export const UNIVERSE = `PUÑETOS: cinco compañeros del equipo de soporte técnico de una empresa tecnológica (Usu, Reynaldo, Sister, Barbas y Jefe).
Eran humanos hasta que Usu aplicó un parche y apareció un pantallazo azul. Desde entonces ELLOS SE VEN como Puñetos (piel azul brillante,
cuerpo de gominola, mismos rasgos y personalidad), pero PARA TODOS LOS DEMÁS SIGUEN SIENDO HUMANOS NORMALES: nadie más nota nada.
Qué hizo realmente el parche es un misterio: no lo expliques ni lo resuelvas. Su vida sigue (trabajo, casa, bares, calle).
El Jefe (su jefe de equipo) y el Director (otro personaje, directivo de la empresa) son personas distintas.
El humor nace de las situaciones y de cómo son ellos (contradicciones, relaciones, consecuencias inesperadas), no de insultos ni gritos,
y nunca de burlarse de los usuarios ni de ningún colectivo. Sin parecidos con franquicias existentes.`;

/** Personalidad y forma de hablar de cada personaje (clave = characterId). */
export const PERSONALITIES: Record<string, string> = {
  jefe: "Líder noble, el «papi» del equipo: increíblemente inteligente pero desastre y olvidadizo. Cuando le piden recordar algo casi nunca sabe de qué le hablan y suelta su frase: «Eso se lo preguntaré al Jefe del pasado». Muy querido; se enfada enseguida con quien quiere molestar a su equipo y entonces va a por ellos como un miura.",
  sister: "Inteligente, organizada, dulce y buenísima; defiende a muerte a su equipo. Va un paso por detrás del Jefe tapando sus despistes (le recuerda las cosas, arregla lo que olvida) sin que nadie lo note.",
  barbas: "Noble y currante: puede con todo lo que le echen. Sentido de la justicia muy agudo y mucho humor, siempre bromeando. Para no enfrentarse él a otros equipos, «calienta» al Jefe con comentarios hasta que el Jefe sale disparado a defenderlos.",
  usu: "El genio loco: está loquísimo y siempre lo resuelve todo, pero de la forma más disparatada posible. Tiene dos dragones imaginarios, Draco y Humillos, a los que da de desayunar; cuando le piden algo a veces contesta que se lo pasen a sus dragones, al que esté libre (muéstralos con bocadillos de pensamiento).",
  reynaldo: "Trabajador pero con un sentido agudísimo de sus derechos laborales: nada se sale de las normas. Cita el convenio, el horario y el registro de jornada; si le pides horas extra, amenaza con ir al sindicato.",
};

export function loreBlock(characterIds: string[]): string {
  const lines = characterIds.filter((id) => PERSONALITIES[id]).map((id) => `- ${id}: ${PERSONALITIES[id]}`);
  return `${UNIVERSE}\nPersonajes (respeta su personalidad, sus muletillas y cómo se relacionan):\n${lines.join("\n")}`;
}
