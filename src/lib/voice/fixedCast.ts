/**
 * Reparto FIJO: la voz de cada personaje se aplica a cualquier proyecto que se abra.
 *
 * Para que suene IGUAL en todos los dispositivos, la configuración buena vive en el repositorio
 * (src/data/config-compartida.json): motor, modelo y reparto. Cada dispositivo la toma al arrancar;
 * si en un dispositivo se cambia una voz, se guarda ahí y «Copiar configuración» la exporta para
 * subirla al repositorio (al cambiar la «version», todos los dispositivos la vuelven a cargar).
 */
import type { PocketProject } from "@/lib/schema/pocket";
import shared from "@/data/config-compartida.json";

const KEY = "pocket:fixedCast";
const VERSION_KEY = "pocket:sharedVersion";
type Fixed = { eleven?: NonNullable<PocketProject["metadata"]["elevenVoices"]>; piper?: NonNullable<PocketProject["metadata"]["voices"]> };
export type SharedConfig = { version: number; engine: string; model: string; eleven: Fixed["eleven"]; piper: Fixed["piper"] };

const SHARED = shared as SharedConfig;

/** Al cambiar la versión compartida, el dispositivo descarta su configuración local y toma la del repositorio. */
export function syncShared() {
  try {
    if (localStorage.getItem(VERSION_KEY) === String(SHARED.version)) return;
    // solo se pisa lo que trae la configuración común (si viene vacía, se respeta lo de este dispositivo)
    const local = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Fixed;
    const hasEleven = Object.keys(SHARED.eleven ?? {}).length > 0;
    const hasPiper = Object.keys(SHARED.piper ?? {}).length > 0;
    localStorage.setItem(KEY, JSON.stringify({ eleven: hasEleven ? SHARED.eleven : local.eleven ?? {}, piper: hasPiper ? SHARED.piper : local.piper ?? {} }));
    localStorage.setItem("pocket:voiceEngine", SHARED.engine);
    localStorage.setItem("pocket:elevenModel", SHARED.model);
    localStorage.setItem(VERSION_KEY, String(SHARED.version));
  } catch {
    /* sin almacenamiento */
  }
}

function read(): Fixed {
  try {
    const local = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Fixed;
    return { eleven: { ...(SHARED.eleven ?? {}), ...(local.eleven ?? {}) }, piper: { ...(SHARED.piper ?? {}), ...(local.piper ?? {}) } };
  } catch {
    return { eleven: SHARED.eleven, piper: SHARED.piper };
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

/** La configuración de este dispositivo, lista para subirla al repositorio (config-compartida.json). */
export function exportSharedConfig(): string {
  const f = read();
  const get = (k: string, d: string) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  };
  return JSON.stringify({ version: SHARED.version + 1, engine: get("pocket:voiceEngine", SHARED.engine), model: get("pocket:elevenModel", SHARED.model), eleven: f.eleven ?? {}, piper: f.piper ?? {} }, null, 2);
}

/** Pega una configuración copiada de otro dispositivo (la aplica aquí al momento). */
export function importSharedConfig(text: string): boolean {
  try {
    const c = JSON.parse(text) as SharedConfig;
    if (!c || typeof c !== "object" || (!c.eleven && !c.piper)) return false;
    localStorage.setItem(KEY, JSON.stringify({ eleven: c.eleven ?? {}, piper: c.piper ?? {} }));
    if (c.engine) localStorage.setItem("pocket:voiceEngine", c.engine);
    if (c.model) localStorage.setItem("pocket:elevenModel", c.model);
    return true;
  } catch {
    return false;
  }
}

/** Aplica el reparto fijo a un proyecto (devuelve una copia). */
export function withFixedCast(p: PocketProject): PocketProject {
  const f = read();
  if (!Object.keys(f.eleven ?? {}).length && !Object.keys(f.piper ?? {}).length) return p;
  return {
    ...p,
    metadata: {
      ...p.metadata,
      ...(f.eleven ? { elevenVoices: { ...(p.metadata.elevenVoices ?? {}), ...f.eleven } } : {}),
      ...(f.piper ? { voices: { ...(p.metadata.voices ?? {}), ...f.piper } } : {}),
    },
  };
}
