/**
 * Persistencia local en IndexedDB (sin base de datos en servidor).
 * Borrar los datos del navegador elimina los borradores: exporta JSON para guardar copia.
 */
import type { PocketProject } from "@/lib/schema/pocket";

const DB_NAME = "punetos-pocket";
const STORE = "projects";
const VERSION = 1;

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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
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
