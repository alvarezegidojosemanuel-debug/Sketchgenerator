/**
 * Procesado de imágenes subidas (funciones puras sobre RGBA para poder probarlas):
 * - quitar fondo blanco/uniforme conectado con los bordes (ChatGPT a veces no da transparencia),
 * - recortar márgenes transparentes.
 */
export function removeBackground(data: Uint8ClampedArray, w: number, h: number, tolerance = 28): number {
  const at = (x: number, y: number) => (y * w + x) * 4;
  // color de fondo = media de las 4 esquinas
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const bg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + data[i + c], 0) / 4);
  if (corners.some((i) => data[i + 3] < 10)) return 0; // ya tiene transparencia
  const close = (i: number) => Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) <= tolerance * 3;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  let removed = 0;
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!close(i)) continue;
    data[i + 3] = 0;
    removed++;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  // suavizar el borde: píxeles opacos pegados a transparentes y parecidos al fondo → semitransparentes
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (data[i + 3] === 0) continue;
    const x = p % w;
    const y = (p / w) | 0;
    const nearT = (x > 0 && data[i - 1] === 0) || (x < w - 1 && data[i + 7] === 0) || (y > 0 && data[i - w * 4 + 3] === 0) || (y < h - 1 && data[i + w * 4 + 3] === 0);
    if (nearT && Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) <= tolerance * 6) data[i + 3] = 110;
  }
  return removed;
}

export function opaqueBounds(data: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
}

/** Tamaños en escena (alto en px del lienzo 1080×1920). Un personaje mide ≈ 700 px. */
export const PROP_SIZES = [
  { id: "tiny", label: "Muy pequeño (móvil, taza)", height: 120 },
  { id: "small", label: "Pequeño (libro, reloj)", height: 220 },
  { id: "medium", label: "Mediano (silla, planta)", height: 420 },
  { id: "large", label: "Grande (mesa, dragón)", height: 650 },
  { id: "huge", label: "Muy grande (puerta, nevera)", height: 950 },
] as const;
