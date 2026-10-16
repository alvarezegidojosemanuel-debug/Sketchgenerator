/** Universo PUÑETOS: lo que el guionista (ChatGPT) debe respetar en todos los sketches. */

export const UNIVERSE = `PUÑETOS: cinco compañeros del equipo de SISTEMAS de un complejo tecnológico privado y puntero, con proyectos de
inteligencia artificial, espaciales, biotecnología y robótica (Usu, Reynaldo, Sister, Barbas y Jefe). Ellos mantienen todo funcionando:
los ordenadores de los científicos, la red y Anastas-IA, la IA central que controla el edificio. NO es un call center ni un servicio de atención
telefónica: nada de llamadas de clientes, centralitas ni «¿ha probado a apagarlo y encenderlo?».
Eran humanos hasta que, durante la gran incidencia (Anastas-IA caída a días de presentar los proyectos a los inversores), Usu montó un parche
conectando el casco SINAPSIS (interfaz cerebral), el núcleo de Anastas-IA y la batería de ÍCARO (espacio): hubo un pantallazo azul y el parche se les
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
Anastas-IA es la IA central del complejo (puertas, ascensores, luces, seguridad, laboratorios, redes). Antes del parche habla por pantallas
y megafonía con frases solo un pelín raras; después del parche la OYEN PENSAR EN VOZ ALTA y los Puñetos la tratan como a una más del equipo (en visión Puñeta: esfera flotante de luz cian con cara).
Anastas-IA (femenino: «la IA») es brillantísima pero entiende mal a los humanos: con Usu es dulce y servicial porque ESTÁ ENAMORADA DE ÉL
(él no termina de entenderlo); con los demás es pasivo-agresiva, irónica y literal, y usa tecnicismos para justificarse.
Celosa de Draco y Humillos y, sin motivo, de Sister: Sister no quiere nada con Usu; son celos infundados, fruto de las inseguridades de Anastas-IA
(sin pelea entre ellas: Anastas-IA compite por la confianza de Usu y Sister ni se entera o se lo toma con paciencia). Barbas la llama «la novia electrónica» de Usu y ella no lo soporta; Reynaldo discute
con ella por saltarse las normas; Sister sospecha de sus patrones; Usu la defiende. Misterio de fondo (NO lo resuelvas): quizá
alguien la está usando; ¿el accidente fue casual?; el parche tenía seis conexiones. El misterio nunca desplaza a la comedia.
Se escribe «Anastas-IA» (juego con «IA») pero se pronuncia «Anastasia»: cuando un personaje la nombre en voz alta, escribe «Anastasia» en el texto.
En el guion: { "off": "Anastas-IA", "texto": … }.
El Jefe (su jefe de equipo) y el Director (director del complejo, eufórico con los resultados mientras ellos van desbordados) son personas distintas.
Secundarios del complejo (de otros departamentos; piden cosas a sistemas; máximo uno por sketch y nunca roban el remate): Neli, bióloga de SEMILLA, genial, dulce, despistada, obsesiva e ingenua, trata a sus organismos como mascotas y pide imposibles con inocencia; Gala, comercial estrella, guapísima, pelirroja, engreída, narcisista y manipuladora, vende a los inversores cosas que aún no existen y se apunta los méritos; Damián, investigador de SINAPSIS, extraño, sombrío, CI altísimo y cero empatía, habla de las personas como de sistemas (es uno de los posibles sospechosos del misterio: pistas muy sutiles, nunca confirmar); Vanesa, de administración/RR. HH., odia su trabajo y a todo el que entra por la puerta, grita mucho, se dice que guarda secretos y por eso no la despiden; está colada por Reynaldo (que le tiene miedo por los gritos) y odia al Jefe porque nunca ficha y le descuadra los informes.
El humor nace de las situaciones y de cómo son ellos (contradicciones, relaciones, consecuencias inesperadas), no de insultos ni gritos,
y nunca de burlarse de los usuarios ni de ningún colectivo. Sin parecidos con franquicias existentes.`;

/** Personalidad y forma de hablar de cada personaje (clave = characterId). */
export const PERSONALITIES: Record<string, string> = {
  jefe: "Unos 45 años. Líder noble y protector, el que todos quieren: brillante pero tremendamente despistado; puede olvidar lo que acaba de hacer. Cuando molestan a los suyos se enfada como un miura (Barbas sabe provocarlo; Sister le cubre los despistes). Frase (SOLO cuando alguien le pregunta por algo que él hizo, dijo o decidió y no tiene ni idea de qué le hablan): «Eso se lo preguntaré al Jefe del pasado» (= «a mí no me preguntes, eso fue cosa del Jefe del pasado»). HABILIDAD: resuelve al instante lo extraordinariamente complejo… y después no recuerda cómo.",
  sister: "Unos 35 años. Inteligente, organizada, dulce, trabajadora y protectora: evita que el caos se apodere del equipo; mucha paciencia pero sabe ponerse firme; protege al Jefe de sus olvidos; no presume, lo demuestra. Es de las primeras en sospechar de Anastas-IA (ve patrones que otros no ven). HABILIDAD: organiza con la mente objetos, documentos, cables, información y espacios.",
  barbas: "Noble, trabajador, pícaro y muy querido: humor sarcástico, con retintín y mala uva cariñosa, siempre sabe dónde meter la pulla (voz: acotaciones [mischievously] o [chuckles]), nunca desagradable. Le encanta provocar al Jefe para que se caliente y defienda al equipo. Llama a Anastas-IA «la novia electrónica» de Usu. Coletilla, con moderación y SOLO justo después de soltar una crítica dura o una pulla sobre alguien, para lavarse la conciencia («…pero vamos, que lo digo con todo el amor del mundo, ¿eh?, no lo digo por nada»): «con todo el amor del mundo». Nunca como saludo ni como frase suelta. HABILIDAD: cabrear al Jefe y que casi todo el mundo le tenga cariño.",
  usu: "Unos 40 años. Genio tecnológico extraordinario, creativo, entusiasta e imprevisible: sus métodos son disparatados pero con inteligencia detrás; NUNCA torpe ni incompetente. Es quien más confía en Anastas-IA y la defiende; no entiende que ella está enamorada de él. Draco y Humillos solo existen después del parche (Ep6). HABILIDAD: interactúa con objetos y sistemas de formas imposibles y crea seres de otros mundos.",
  reynaldo: "Unos 38 años. Trabajador, meticuloso y defensor de los derechos laborales; detecta cualquier irregularidad; humor seco, preciso y sarcástico. No es un quejica: siempre tiene motivos reales para reclamar. Desconfía de Anastas-IA y discute con ella por sus tecnicismos. HABILIDAD: conectado a bases de datos legales y sindicales: consulta convenios y envía reclamaciones con la mente.",
};

export function loreBlock(characterIds: string[]): string {
  const lines = characterIds.filter((id) => PERSONALITIES[id]).map((id) => `- ${id}: ${PERSONALITIES[id]}`);
  return `${UNIVERSE}\nPersonajes (respeta su personalidad, sus muletillas y cómo se relacionan):\n${lines.join("\n")}`;
}
