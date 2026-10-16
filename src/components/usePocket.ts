"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyOverrides, catalog as defaultCatalog } from "@/lib/catalog";
import type { FaceOverrides } from "@/lib/catalog/types";
import { withFixedCast } from "@/lib/voice/fixedCast";
import demoRaw from "@/data/sketch-demo.json";
import demoUsuReyRaw from "@/data/sketch-usu-reynaldo.json";
import demoFxRaw from "@/data/sketch-interacciones.json";
import demoBsodRaw from "@/data/sketch-pantallazo.json";
import demoOrigenRaw from "@/data/sketch-origen.json";
import pruebaHumanosRaw from "@/data/prueba-humanos.json";
import lentejasRaw from "@/data/sketch-lentejas.json";
import jefePasadoRaw from "@/data/sketch-jefe-del-pasado.json";
import fallecidoRaw from "@/data/sketch-fallecido.json";
import ep1Raw from "@/data/ep1.json";
import ep2Raw from "@/data/ep2.json";
import ep3Raw from "@/data/ep3.json";
import ep4Raw from "@/data/ep4.json";
import ep5Raw from "@/data/ep5.json";
import type { PocketProject } from "@/lib/schema/pocket";
import { validateProject, type Issue } from "@/lib/schema/validate";
import { faceStore, libraryStore, newProjectId, projectStore, type LibraryItem } from "@/lib/storage/projects";
import { salvageOverrides } from "@/lib/face/overrides";
import type { SketchIntent } from "@/lib/generator/prompt";

export type Tab = "idea" | "generar" | "ver" | "editar" | "caras" | "proyectos";

const LAST_ID_KEY = "pocket:lastProjectId";
const INTENT_KEY = "pocket:intent";

export const DEMOS = {
  "usu-reynaldo": demoUsuReyRaw,
  "usu-jefe": demoRaw,
  interacciones: demoFxRaw,
  pantallazo: demoBsodRaw,
  origen: demoOrigenRaw,
  "prueba-humanos": pruebaHumanosRaw,
  lentejas: lentejasRaw,
  "jefe-del-pasado": jefePasadoRaw,
  fallecido: fallecidoRaw,
  ep1: ep1Raw,
  ep2: ep2Raw,
  ep3: ep3Raw,
  ep4: ep4Raw,
  ep5: ep5Raw,
} as const;

export function demoProject(which: keyof typeof DEMOS = "usu-jefe"): PocketProject {
  const r = validateProject(structuredClone(DEMOS[which]), defaultCatalog);
  if (!r.project) throw new Error("El sketch demo no valida: " + JSON.stringify(r.errors));
  return r.project;
}

const defaultIntent: SketchIntent = { idea: "", duration: 30, characterIds: ["usu", "jefe"], tone: "absurdo", backgroundId: null };

function safeLocal<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function usePocket() {
  const [tab, setTab] = useState<Tab>("idea");
  const [intent, setIntentState] = useState<SketchIntent>(defaultIntent);
  const [project, setProjectState] = useState<PocketProject>(() => demoProject("usu-reynaldo"));
  const [projectId, setProjectId] = useState<string>(() => "demo");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [faceTarget, setFaceTarget] = useState<{ characterId: string; poseId: string; expressionId?: string } | null>(null);
  const [localFace, setLocalFace] = useState<FaceOverrides | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const libUrls = useRef(new Map<string, { blob: Blob; url: string }>());
  const urlOf = (it: LibraryItem) => {
    const cur = libUrls.current.get(it.id);
    if (cur && cur.blob === it.blob) return cur.url;
    if (cur) URL.revokeObjectURL(cur.url);
    const url = URL.createObjectURL(it.blob);
    libUrls.current.set(it.id, { blob: it.blob, url });
    return url;
  };
  const catalog = useMemo(() => {
    const c = applyOverrides(defaultCatalog, localFace);
    const props = library.filter((x) => x.kind === "prop").map((x) => ({ id: x.id, label: x.label, src: urlOf(x), width: x.width, height: x.height, user: true }));
    const bgs = library.filter((x) => x.kind === "background").map((x) => ({ id: x.id, label: x.label, src: urlOf(x), user: true }));
    const snd = library.filter((x) => x.kind === "sound").map((x) => ({ id: x.id, label: x.label, src: urlOf(x), duration: x.duration ?? 1, user: true }));
    return {
      ...c,
      sounds: [...(defaultCatalog.sounds ?? []), ...snd],
      // los recursos propios van primero; los provisionales detrás
      props: [...props, ...c.props],
      backgrounds: [...bgs, ...c.backgrounds],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFace, library]);

  useEffect(() => {
    libraryStore
      .list()
      .then((items) => setLibrary(items.sort((a, b) => a.createdAt - b.createdAt)))
      .catch(() => {});
  }, []);

  const saveLibraryItem = useCallback(async (item: LibraryItem) => {
    await libraryStore.put(item);
    setLibrary((l) => [...l.filter((x) => x.id !== item.id), item].sort((a, b) => a.createdAt - b.createdAt));
  }, []);
  const removeLibraryItem = useCallback(async (id: string) => {
    await libraryStore.remove(id);
    setLibrary((l) => l.filter((x) => x.id !== id));
  }, []);
  const loaded = useRef(false);
  const dirty = useRef(false);

  // Calibraciones faciales guardadas en este navegador.
  useEffect(() => {
    faceStore
      .get()
      .then((ov) => {
        if (!ov) return;
        const { value, dropped } = salvageOverrides(ov, defaultCatalog);
        if (value) setLocalFace(value);
        if (dropped.length) setStorageError(`Se ignoraron ${dropped.length} calibraciones no válidas: ${dropped.join(", ")}`);
      })
      .catch(() => {});
  }, []);

  const saveFace = useCallback(async (ov: FaceOverrides) => {
    setLocalFace(ov);
    await faceStore.save(ov);
  }, []);

  // Restaurar intención y último proyecto.
  useEffect(() => {
    const saved = safeLocal(() => localStorage.getItem(INTENT_KEY), null);
    if (saved) {
      const parsed = safeLocal(() => JSON.parse(saved) as SketchIntent, null);
      if (parsed && Array.isArray(parsed.characterIds)) setIntentState({ ...defaultIntent, ...parsed });
    }
    const lastId = safeLocal(() => localStorage.getItem(LAST_ID_KEY), null);
    if (lastId && lastId !== "demo") {
      projectStore
        .get(lastId)
        .then((rec) => {
          if (rec) {
            setProjectState(withFixedCast(rec.project));
            setProjectId(rec.id);
          }
        })
        .catch((e: unknown) => setStorageError(String(e)))
        .finally(() => (loaded.current = true));
    } else {
      loaded.current = true;
    }
  }, []);

  const setIntent = useCallback((next: SketchIntent) => {
    setIntentState(next);
    safeLocal(() => localStorage.setItem(INTENT_KEY, JSON.stringify(next)), undefined);
  }, []);

  /** Sustituye el proyecto (importación/carga). Crea un borrador nuevo salvo que se indique id. */
  const replaceProject = useCallback((p: PocketProject, id?: string) => {
    const nid = id ?? newProjectId();
    setProjectState(withFixedCast(p));
    setProjectId(nid);
    dirty.current = id === undefined;
    safeLocal(() => localStorage.setItem(LAST_ID_KEY, nid), undefined);
  }, []);

  /** Edición inmutable: recibe un borrador clonado. */
  const editProject = useCallback((fn: (draft: PocketProject) => void) => {
    setProjectState((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
    dirty.current = true;
  }, []);

  // Autoguardado en IndexedDB (el demo se guarda como copia propia al editarlo).
  useEffect(() => {
    if (!loaded.current || !dirty.current) return;
    const h = setTimeout(() => {
      let id = projectId;
      if (id === "demo") {
        id = newProjectId();
        setProjectId(id);
      }
      setSaveState("saving");
      projectStore
        .save(id, project)
        .then(() => {
          dirty.current = false;
          setSaveState("saved");
          setStorageError(null);
          safeLocal(() => localStorage.setItem(LAST_ID_KEY, id), undefined);
        })
        .catch((e: unknown) => {
          setSaveState("error");
          setStorageError(e instanceof Error ? e.message : String(e));
        });
    }, 700);
    return () => clearTimeout(h);
  }, [project, projectId]);

  const validation = useMemo(() => validateProject(project, catalog), [project, catalog]);
  const issues: Issue[] = validation.errors;

  return { tab, setTab, intent, setIntent, project, projectId, replaceProject, editProject, issues, saveState, storageError, catalog, localFace, saveFace, faceTarget, setFaceTarget, library, saveLibraryItem, removeLibraryItem };
}

export type PocketState = ReturnType<typeof usePocket>;
