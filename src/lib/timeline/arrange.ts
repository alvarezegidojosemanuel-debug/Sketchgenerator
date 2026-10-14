import type { Take } from "@/lib/schema/pocket";

export interface Slot {
  x: number;
  y: number;
  scale: number;
  zIndex: number;
}

/**
 * Posiciones para 1–8 personajes en el lienzo vertical 1080×1920 (pies en y).
 * Hasta 3 caben en una fila; con 4 o más se hacen dos filas (detrás un poco más pequeños),
 * como en un escenario. Un personaje mide ≈ 500 px de ancho a escala 1.
 */
export function groupLayout(n: number): Slot[] {
  const row = (xs: number[], y: number, scale: number, z: number) => xs.map((x) => ({ x, y, scale, zIndex: z }));
  switch (n) {
    case 0:
      return [];
    case 1:
      return row([540], 1780, 1, 1);
    case 2:
      return row([300, 780], 1780, 1, 1);
    case 3:
      return row([200, 540, 880], 1790, 0.85, 1);
    case 4:
      return [...row([340, 740], 1650, 0.7, 1), ...row([230, 850], 1810, 0.8, 2)];
    case 5:
      return [...row([310, 770], 1650, 0.68, 1), ...row([180, 540, 900], 1810, 0.78, 2)];
    default: {
      const back = Math.ceil(n / 2);
      const front = n - back;
      const xs = (k: number) => Array.from({ length: k }, (_, i) => Math.round(((i + 0.5) * 1080) / k));
      return [...row(xs(back), 1640, 0.6, 1), ...row(xs(front), 1820, 0.7, 2)];
    }
  }
}

/** Coloca a todos los actores de la toma con la distribución de grupo (mantiene el orden). */
export function arrangeTake(take: Take): Take {
  const t = structuredClone(take);
  const slots = groupLayout(t.actors.length);
  const moved = new Map<string, { dx: number; dy: number }>();
  t.actors.forEach((a, i) => {
    const s = slots[i];
    moved.set(a.uid, { dx: s.x - a.x, dy: s.y - a.y });
    Object.assign(a, s);
  });
  // los desplazamientos (eventos body con destino) se trasladan igual que el actor
  for (const e of t.events) {
    if (e.track !== "body" || !e.actorUid) continue;
    const m = moved.get(e.actorUid);
    if (!m) continue;
    if (e.x !== undefined) e.x = Math.round(e.x + m.dx);
    if (e.y !== undefined) e.y = Math.round(e.y + m.dy);
    if (e.scale !== undefined) e.scale = slots[t.actors.findIndex((a) => a.uid === e.actorUid)].scale;
  }
  return t;
}
