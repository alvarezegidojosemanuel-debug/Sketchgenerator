/** Instrucciones de estilo para generar recursos con ChatGPT coherentes con los personajes. */

export const STYLE_BASE =
  "Estilo PUÑETOS: ilustración cartoon para redes sociales, contorno negro grueso y limpio (6–8 px a 1024 px), colores planos saturados con sombreado suave y una ligera textura granulada, iluminación frontal suave, sin degradados de fondo, sin texto, sin letras, sin marcas de agua, sin personajes ni personas.";

export function propImagePrompt(what: string): string {
  return [
    `Dibuja UN ÚNICO objeto: ${what.trim() || "(describe el objeto)"}.`,
    STYLE_BASE,
    "Vista frontal o 3/4 ligera, centrado, ocupando casi todo el lienzo cuadrado 1024×1024.",
    "Fondo TOTALMENTE TRANSPARENTE (PNG con canal alfa). Si no puedes, fondo blanco liso uniforme sin sombras en el suelo.",
    "Que combine con personajes azules con contorno negro grueso (adjunto referencia de estilo si la tienes).",
  ].join(" ");
}

export function backgroundImagePrompt(what: string): string {
  return [
    `Dibuja un ESCENARIO vacío: ${what.trim() || "(describe el lugar)"}.`,
    STYLE_BASE,
    "Formato VERTICAL 9:16 (1024×1792). Vista frontal, como un decorado de teatro.",
    "El suelo ocupa el 25–30 % inferior de la imagen; deja el centro y la parte inferior despejados para colocar a 3–5 personajes de pie.",
    "Colores algo más suaves y menos saturados que los personajes (que son azules) para que destaquen; evita el azul como color dominante.",
    "Sin personajes, sin texto.",
  ].join(" ");
}

export const SFX_IDEAS = [
  "teléfono móvil vibrando sobre una mesa de madera",
  "alarma de despertador antigua sonando",
  "rugido gracioso de dragón pequeño",
  "puerta que se cierra de golpe",
  "público riéndose",
  "grillos en silencio incómodo",
];
