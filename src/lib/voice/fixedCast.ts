/**
 * Reparto FIJO del dispositivo: la voz elegida para cada personaje se recuerda y se aplica a cualquier
 * proyecto que se abra (también a los episodios de ejemplo), para no tener que repetir el reparto.
 */
import type { PocketProject } from "@/lib/schema/pocket";

const KEY = "pocket:fixedCast";
type Fixed = { eleven?: NonNullable<PocketProject["metadata"]["elevenVoices"]>; piper?: NonNullable<PocketProject["metadata"]["voices"]> };

function read(): Fixed {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Fixed;
  } catch {
    return {};
  }
}

function write(f: Fixed) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* sin almacenamiento */
  }
}

export function rememberEleven(cid: string, entry: NonNullable<PocketProject["metadata"]["elevenVoices"]>[string]) {
  const f = read();
  f.eleven = { ...(f.eleven ?? {}), [cid]: entry };
  write(f);
}

export function rememberPiper(cid: string, entry: NonNullable<PocketProject["metadata"]["voices"]>[string]) {
  const f = read();
  f.piper = { ...(f.piper ?? {}), [cid]: entry };
  write(f);
}

export function fixedCast(): Fixed {
  return read();
}

/** Aplica el reparto fijo a un proyecto (devuelve una copia). */
export function withFixedCast(p: PocketProject): PocketProject {
  const f = read();
  if (!f.eleven && !f.piper) return p;
  return {
    ...p,
    metadata: {
      ...p.metadata,
      ...(f.eleven ? { elevenVoices: { ...(p.metadata.elevenVoices ?? {}), ...f.eleven } } : {}),
      ...(f.piper ? { voices: { ...(p.metadata.voices ?? {}), ...f.piper } } : {}),
    },
  };
}
