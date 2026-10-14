/**
 * Persistencia local en IndexedDB (sin base de datos en servidor).
 * Borrar los datos del navegador elimina los borradores: exporta JSON para guardar copia.
 */
import type { PocketProject } from "@/lib/schema/pocket";
import type { FaceOverrides } from "@/lib/catalog/types";

const DB_NAME = "punetos-pocket";
const STORE = "projects";
const FACE_STORE = "face";
const VERSION = 2;

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
