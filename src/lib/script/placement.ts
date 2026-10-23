import type { Catalog } from "@/lib/catalog/types";
import type { Take } from "@/lib/schema/pocket";
import { compileScript, resolveCharacter } from "./compile";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Pasa al guion («colocar» de la escena) la colocación inicial de los actores de una toma editada a mano
 * (arrastrados en el editor): x, y, z, tamaño y hacia dónde miran. Devuelve el guion nuevo, o null si la
 * toma no sale del guion.
 */
export function placementToScript(script: Obj, takeIndex: number, take: Take, catalog: Catalog): Obj | null {
  if (!Array.isArray(script.escenas)) return null;
  const { project, marks } = compileScript(script, catalog);
  const si = marks.findIndex((m) => m?.take === takeIndex);
  const built = project?.takes[takeIndex];
  if (si < 0 || !built) return null;
  const next = structuredClone(script) as Obj;
  const sc = (next.escenas as unknown[])[si];
  if (!isObj(sc)) return null;
  const colocar: Obj = isObj(sc.colocar) ? sc.colocar : {};
  for (const a of take.actors) {
    const was = built.actors.find((b) => b.uid === a.uid);
    if (!was) continue;
    const key = Object.keys(colocar).find((k) => resolveCharacter(k, catalog) === a.characterId) ?? catalog.characters.find((c) => c.id === a.characterId)?.name ?? a.characterId;
    const o: Obj = isObj(colocar[key]) ? (colocar[key] as Obj) : {};
    const same = a.x === was.x && a.y === was.y && a.zIndex === was.zIndex && a.scale === was.scale && !!a.flip === !!was.flip;
    if (same) continue;
    o.x = Math.round(a.x);
    o.y = Math.round(a.y);
    if (a.zIndex !== was.zIndex) o.z = a.zIndex;
    // el tamaño de «colocar» multiplica al de la escena: se ajusta en la misma proporción
    if (a.scale !== was.scale && was.scale > 0) o.escala = r3((typeof o.escala === "number" ? o.escala : 1) * (a.scale / was.scale));
    if (!!a.flip !== !!was.flip) o.mira = a.flip ? "izquierda" : "derecha";
    colocar[key] = o;
    // lo que anda en la escena («acciones» con x/y) se desplaza lo mismo: el recorrido entero se mueve junto
    const dx = Math.round(a.x - was.x), dy = Math.round(a.y - was.y);
    if ((dx || dy) && Array.isArray(sc.acciones)) {
      for (const ac of sc.acciones as unknown[]) {
        if (!isObj(ac) || resolveCharacter(ac.quien, catalog) !== a.characterId) continue;
        if (typeof ac.x === "number" && dx) ac.x = Math.round(ac.x + dx);
        if (typeof ac.y === "number" && dy) ac.y = Math.round(ac.y + dy);
      }
    }
  }
  sc.colocar = colocar;
  return next;
}
