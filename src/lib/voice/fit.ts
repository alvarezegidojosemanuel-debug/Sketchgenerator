import type { PocketProject, Take } from "@/lib/schema/pocket";
import { LIMITS } from "@/lib/schema/pocket";

/**
 * Ajusta cada bloque de diálogo a la duración REAL de su voz y desplaza todo lo que viene
 * detrás en la misma toma (efecto «ripple»), ampliando la toma si hace falta. Así la escena
 * ya no tiene que esperar a la voz y queda lista para exportar con el tiempo exacto.
 */
/** Clave de la duración real de un diálogo: `${takeId}:${eventId}`. */
export const clipKey = (takeId: string, eventId: string) => `${takeId}:${eventId}`;

export function fitTakeToAudio(take: Take, durations: Map<string, number>, gap = 0.12): { take: Take; changed: number } {
  const t: Take = structuredClone(take);
  const origEnd = take.events.reduce((m, e) => Math.max(m, e.start + e.duration), 0);
  const tail = Math.max(0, take.duration - origEnd);
  // lo que llegaba hasta el final de la toma tiene que seguir llegando hasta el nuevo final
  const toEnd = new Set(t.events.filter((e) => e.start + e.duration >= take.duration - 1e-3).map((e) => e.id));
  let changed = 0;
  const dialogues = t.events.filter((e) => e.track === "dialogue").sort((a, b) => a.start - b.start);
  for (const d of dialogues) {
    const real = durations.get(clipKey(take.id, d.id));
    if (real === undefined) continue;
    const target = Math.round((real + gap) * 100) / 100;
    const delta = Math.round((target - d.duration) * 100) / 100;
    if (Math.abs(delta) < 0.05) continue;
    const end = d.start + d.duration;
    d.duration = target;
    changed++;
    // «Ripple»: lo que empieza después del final original se desplaza; lo que está EN PANTALLA en ese
    // momento (cruza el final) se estira o encoge lo mismo, para que no quede un hueco sin imagen.
    for (const e of t.events) {
      if (e === d) continue;
      if (e.start >= end - 1e-6) e.start = Math.max(0, Math.round((e.start + delta) * 100) / 100);
      else if (e.start + e.duration > end - 1e-6) e.duration = Math.max(0.05, Math.round((e.duration + delta) * 100) / 100);
    }
  }
  const maxEnd = t.events.reduce((m, e) => Math.max(m, e.start + e.duration), 0);
  t.duration = Math.min(LIMITS.maxTakeDuration, Math.max(0.5, Math.round((maxEnd + tail) * 100) / 100));
  for (const e of t.events) if (toEnd.has(e.id) && e.track !== "dialogue") e.duration = Math.max(0.05, Math.round((t.duration - e.start) * 100) / 100);
  return { take: t, changed };
}

export function fitProjectToAudio(project: PocketProject, durations: Map<string, number>): { project: PocketProject; changed: number } {
  let changed = 0;
  const takes = project.takes.map((tk) => {
    const r = fitTakeToAudio(tk, durations, 0.04);
    changed += r.changed;
    return r.take;
  });
  const total = takes.reduce((s, t) => s + t.duration, 0);
  return { project: { ...project, takes, metadata: { ...project.metadata, approxDuration: Math.min(180, Math.max(1, Math.round(total))) } }, changed };
}
