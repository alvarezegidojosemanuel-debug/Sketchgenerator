/** Universo PUÑETOS: lo que el guionista (ChatGPT) debe respetar en todos los sketches. */

export const UNIVERSE = `PUÑETOS: cinco compañeros del equipo de SISTEMAS de un complejo tecnológico privado y puntero, con proyectos de
inteligencia artificial, espaciales, biotecnología y robótica (Usu, Reynaldo, Sister, Barbas y Jefe). Ellos mantienen todo funcionando:
los ordenadores de los científicos, la red y NODO, la IA central que controla el edificio. NO es un call center ni un servicio de atención
telefónica: nada de llamadas de clientes, centralitas ni «¿ha probado a apagarlo y encenderlo?».
Eran humanos hasta que, durante la gran incidencia (NODO caído a días de presentar los proyectos a los inversores), Usu montó un parche
con el casco del proyecto de interfaz cerebral, la IA y la energía del proyecto espacial: hubo un pantallazo azul y el parche se les
instaló a los cinco en la cabeza. Desde entonces ELLOS SE VEN como Puñetos (piel azul brillante,
cuerpo de gominola, mismos rasgos y personalidad), pero PARA TODOS LOS DEMÁS SIGUEN SIENDO HUMANOS NORMALES: nadie más nota nada.
Además CONECTAN CON LOS SISTEMAS: resuelven incidencias «mágicamente», y cada uno tiene una HABILIDAD que exagera su rasgo principal
(ver personajes). La usan también fuera de la oficina, lo que da historias individuales de cada uno.
La serie se cuenta en visión Puñeta: el resto de la gente aparece con su «aura», un cliché exagerado y genérico (el cuñado sabelotodo,
la vecina cotilla, el ejecutivo de sonrisa de anuncio…), nunca personas reconocibles.
Prioriza su día a día FUERA del trabajo; en el complejo, sobre todo resolviendo incidencias de los proyectos (una IA caprichosa, un rover
suelto, una planta experimental…), sin satirizar el ambiente laboral. Los científicos son despistados geniales, nunca tontos.
En la visión Puñeta, también cámaras, fotos y espejos los muestran como Puñetos.
El parche les instaló en la cabeza un software que les hace ver lo puñeta que es la vida: por eso se ven Puñetos y ven a los demás
con el aura de lo puñeteros que son. Quién hizo ese software y si se puede quitar es un misterio: no lo resuelvas.
El Jefe (su jefe de equipo) y el Director (director del complejo, eufórico con los resultados mientras ellos van desbordados) son personas distintas.
El humor nace de las situaciones y de cómo son ellos (contradicciones, relaciones, consecuencias inesperadas), no de insultos ni gritos,
y nunca de burlarse de los usuarios ni de ningún colectivo. Sin parecidos con franquicias existentes.`;

/** Personalidad y forma de hablar de cada personaje (clave = characterId). */
export const PERSONALITIES: Record<string, string> = {
  jefe: "Líder noble, el «papi» del equipo: increíblemente inteligente pero desastre y olvidadizo. Cuando le piden recordar algo casi nunca sabe de qué le hablan y suelta su frase: «Eso se lo preguntaré al Jefe del pasado». Muy querido; se enfada con facilidad con quien quiere molestar a su equipo. HABILIDAD: resuelve todo lo supercomplicado… y luego nunca se acuerda; si le preguntas, no sabe de qué le hablas.",
  sister: "Inteligente, organizada, muy buena y dulce; defiende a muerte a su equipo; protege y ayuda al Jefe para que sus despistes no tengan consecuencias. HABILIDAD: ordena todo con la mente (una casa, una oficina, la información se reorganizan solas).",
  barbas: "Noble, muy trabajador, puede con lo que le echen. Sentido de la justicia muy agudo y mucho humor. Es un CABRONCETE BONACHÓN: mete bazas con mala uva pero con buen corazón; sus comentarios suenan pícaros, con retintín y media sonrisa (en voz usa acotaciones como [mischievously] o [chuckles]), nunca agresivos. Mete baza; para no confrontar él a otros equipos, «achucha» al Jefe hasta calentarlo y que vaya este como un miura. Coletilla: todo lo dice y lo hace «con todo el amor del mundo». HABILIDAD: cabrear al Jefe y, a la vez, que todo el mundo le quiera muchísimo.",
  usu: "El genio loco: está loquísimo y siempre lo resuelve todo, pero de la forma más disparatada posible. Desde que descubre sus poderes (no antes) le acompañan sus dragones Draco y Humillos, los primeros seres que creó; desde entonces, cuando le piden algo a veces contesta que se lo pasen a sus dragones, al que esté libre. HABILIDAD: interactúa con los objetos y crea seres de otros mundos que usa para solucionar problemas.",
  reynaldo: "Trabajador, con un sentido agudísimo de sus derechos laborales: nada se sale de las normas. Si le pides horas extra, amenaza con ir al sindicato. HABILIDAD: conectado con las bases de datos de los sindicatos: consulta legalidades, pone denuncias y envía correos con su propia voluntad.",
};

export function loreBlock(characterIds: string[]): string {
  const lines = characterIds.filter((id) => PERSONALITIES[id]).map((id) => `- ${id}: ${PERSONALITIES[id]}`);
  return `${UNIVERSE}\nPersonajes (respeta su personalidad, sus muletillas y cómo se relacionan):\n${lines.join("\n")}`;
}
