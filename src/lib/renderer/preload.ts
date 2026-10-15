/** Precarga (y descodifica) todas las imágenes de un proyecto para que nada parpadee al cambiar de pose u objeto. */
import type { Catalog } from "@/lib/catalog/types";
import { findBackground, findCharacter, findPose, findProp } from "@/lib/catalog";
import type { PocketProject } from "@/lib/schema/pocket";

const done = new Map<string, Promise<void>>();

export function projectImageUrls(project: PocketProject, catalog: Catalog): string[] {
  const urls = new Set<string>();
  for (const take of project.takes) {
    if (take.backgroundId) {
      const b = findBackground(catalog, take.backgroundId);
      if (b) urls.add(b.src);
    }
    const chars = new Map(take.actors.map((a) => [a.uid, a.characterId]));
    for (const a of take.actors) {
      const p = findPose(catalog, a.characterId, a.poseId);
      if (p) urls.add(p.src);
    }
    for (const e of take.events) {
      if (e.track === "body" && e.poseId && e.actorUid) {
        const p = findPose(catalog, chars.get(e.actorUid) ?? "", e.poseId);
        if (p) urls.add(p.src);
      }
      if (e.track === "props") {
        for (const id of [e.propId, e.altPropId]) {
          const pr = id ? findProp(catalog, id) : undefined;
          if (pr) urls.add(pr.src);
        }
      }
    }
    // piezas de cara de los personajes de la toma
    for (const cid of new Set(chars.values())) {
      const ch = findCharacter(catalog, cid);
      if (ch) for (const f of [...ch.face.eyes, ...ch.face.brows, ...ch.face.mouths]) urls.add(f.src);
    }
  }
  return [...urls];
}

export function preloadImage(src: string): Promise<void> {
  if (typeof Image === "undefined") return Promise.resolve();
  let p = done.get(src);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).finally(() => resolve());
      };
      img.onerror = () => resolve();
      img.src = src;
    });
    done.set(src, p);
  }
  return p;
}

/** Precarga con tope de tiempo: nunca bloquea la reproducción más de `maxMs`. */
export async function preloadProject(project: PocketProject, catalog: Catalog, maxMs = 6000): Promise<void> {
  const all = Promise.all(projectImageUrls(project, catalog).map(preloadImage));
  await Promise.race([all, new Promise((r) => setTimeout(r, maxMs))]);
}
