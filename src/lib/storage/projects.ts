/**
 * Persistencia local en IndexedDB (sin base de datos en servidor).
 * Borrar los datos del navegador elimina los borradores: exporta JSON para guardar copia.
 */
import type { PocketProject } from "@/lib/schema/pocket";
import type { FaceOverrides } from "@/lib/catalog/types";

const DB_NAME = "punetos-pocket";
const STORE = "projects";
const FACE_STORE = "face";
const CLIP_STORE = "voiceClips";
const LIB_STORE = "library";
const VERSION = 4;

export interface StoredProject {
  id: string;
  title: string;
  updatedAt: number;
  project: PocketProject;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB no disponible en este navegador"));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(FACE_STORE)) db.createObjectStore(FACE_STORE);
      if (!db.objectStoreNames.contains(CLIP_STORE)) db.createObjectStore(CLIP_STORE);
      if (!db.objectStoreNames.contains(LIB_STORE)) db.createObjectStore(LIB_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const projectStore = {
  list: async (): Promise<StoredProject[]> => {
    const all = await tx<StoredProject[]>("readonly", (s) => s.getAll() as IDBRequest<StoredProject[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get: (id: string) => tx<StoredProject | undefined>("readonly", (s) => s.get(id) as IDBRequest<StoredProject | undefined>),
  save: async (id: string, project: PocketProject): Promise<StoredProject> => {
    const rec: StoredProject = { id, title: project.metadata.title, updatedAt: Date.now(), project };
    await tx("readwrite", (s) => s.put(rec));
    return rec;
  },
  remove: (id: string) => tx("readwrite", (s) => s.delete(id)),
};

export function newProjectId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Calibraciones faciales y prefabs guardados en este navegador. */
export const faceStore = {
  get: () => tx<FaceOverrides | undefined>("readonly", (s) => s.get("local") as IDBRequest<FaceOverrides | undefined>, FACE_STORE),
  save: (ov: FaceOverrides) => tx("readwrite", (s) => s.put(ov, "local"), FACE_STORE),
};

/** Audio de voz ya generado (Piper), para no volver a sintetizar la misma frase. */
export const clipCache = {
  get: (key: string) => tx<{ samples: Float32Array; sampleRate: number } | undefined>("readonly", (s) => s.get(key) as IDBRequest<{ samples: Float32Array; sampleRate: number } | undefined>, CLIP_STORE),
  put: (key: string, v: { samples: Float32Array; sampleRate: number }) => tx("readwrite", (s) => s.put(v, key), CLIP_STORE),
  clear: () => tx("readwrite", (s) => s.clear(), CLIP_STORE),
};

/** Recursos propios (objetos, escenarios, sonidos) guardados en este dispositivo. */
export interface LibraryItem {
  id: string;
  kind: "prop" | "background" | "sound";
  label: string;
  blob: Blob;
  /** Tamaño en escena (px del lienzo 1080×1920) para objetos; tamaño original para escenarios. */
  width: number;
  height: number;
  /** Duración (s) para sonidos. */
  duration?: number;
  createdAt: number;
  /** Descripción usada para generarlo (si se generó). */
  prompt?: string;
}

export const libraryStore = {
  list: () => tx<LibraryItem[]>("readonly", (s) => s.getAll() as IDBRequest<LibraryItem[]>, LIB_STORE),
  put: (item: LibraryItem) => tx("readwrite", (s) => s.put(item), LIB_STORE),
  remove: (id: string) => tx("readwrite", (s) => s.delete(id), LIB_STORE),
};
