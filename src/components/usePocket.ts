"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { catalog } from "@/lib/catalog";
import demoRaw from "@/data/sketch-demo.json";
import type { PocketProject } from "@/lib/schema/pocket";
import { validateProject, type Issue } from "@/lib/schema/validate";
import { newProjectId, projectStore } from "@/lib/storage/projects";
import type { SketchIntent } from "@/lib/generator/prompt";

export type Tab = "idea" | "generar" | "ver" | "editar" | "proyectos";

const LAST_ID_KEY = "pocket:lastProjectId";
const INTENT_KEY = "pocket:intent";

export function demoProject(): PocketProject {
  const r = validateProject(structuredClone(demoRaw), catalog);
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
  const [project, setProjectState] = useState<PocketProject>(() => demoProject());
  const [projectId, setProjectId] = useState<string>(() => "demo");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [storageError, setStorageError] = useState<string | null>(null);
  const loaded = useRef(false);
  const dirty = useRef(false);

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
            setProjectState(rec.project);
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
    setProjectState(p);
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

  const validation = useMemo(() => validateProject(project, catalog), [project]);
  const issues: Issue[] = validation.errors;

  return { tab, setTab, intent, setIntent, project, projectId, replaceProject, editProject, issues, saveState, storageError, catalog };
}

export type PocketState = ReturnType<typeof usePocket>;
