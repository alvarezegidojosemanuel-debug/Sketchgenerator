"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Catalog } from "@/lib/catalog/types";
import { compileScript, estimate, normKey, resolveCharacter } from "@/lib/script/compile";
import { PlaceMode } from "../PlaceMode";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { Stage } from "../Stage";
import type { PocketState } from "../usePocket";
import { Field } from "../ui";
import { downloadText, exportProjectText, importProjectText, projectFileName } from "@/lib/import-export";
import { CategoryFilter, filterPoses } from "../PoseCategories";
import type { PoseCategoryMap } from "@/lib/catalog/poseCategories";
import { animationsFor, cleanAnimation, type AnimLibrary, type Animation } from "@/lib/animation/animations";

/**
 * EDITOR DE GUION. Se edita el sketch como se piensa: escenas y, dentro, pasos (frase, gesto, efecto…).
 * Izquierda: la estructura. Centro: cómo queda en ese momento. Derecha: las propiedades del paso elegido.
 * Cada cambio vuelve a montar el sketch y se guarda solo.
 */

type Obj = Record<string, unknown>;
type Script = Obj & { escenas: Obj[] };
type Sel = { scene: number; step: number | null; action?: number };

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const words = (t: string) => t.replace(/\[[^\]]*\]/g, "").trim().split(/\s+/).filter(Boolean).length;

/** Tipos de paso: icono, nombre y cómo se reconoce. */
const KINDS: { id: string; icon: string; label: string; is: (st: Obj) => boolean; make: (ctx: { cast: string[] }) => Obj }[] = [
  { id: "dice", icon: "🗣", label: "Frase", is: (st) => st.dice !== undefined, make: ({ cast }) => ({ dice: cast[0] ?? "Usu", texto: "" }) },
  { id: "off", icon: "📢", label: "Voz en off", is: (st) => st.off !== undefined, make: () => ({ off: "Anastas-IA", texto: "" }) },
  { id: "narrador", icon: "🎙", label: "Narrador", is: (st) => st.narrador !== undefined, make: () => ({ narrador: "" }) },
  { id: "coro", icon: "👥", label: "A coro", is: (st) => st.coro !== undefined, make: ({ cast }) => ({ coro: cast.slice(0, 2), texto: "" }) },
  { id: "gesto", icon: "🤸", label: "Gesto", is: (st) => st.quien !== undefined && st.gesto !== undefined && st.camara === undefined, make: ({ cast }) => ({ quien: cast[0] ?? "Usu", gesto: "neutro" }) },
  { id: "cara", icon: "😐", label: "Cara", is: (st) => st.cara !== undefined, make: ({ cast }) => ({ cara: cast[0] ?? "Usu", emocion: "sorpresa" }) },
  { id: "mira", icon: "👀", label: "Mira a", is: (st) => st.mira !== undefined, make: ({ cast }) => ({ mira: cast[0] ?? "Usu", a: cast[1] ?? cast[0] ?? "Usu" }) },
  { id: "efecto", icon: "💥", label: "Efecto", is: (st) => st.efecto !== undefined, make: ({ cast }) => ({ efecto: "sorpresa", donde: cast[0] ?? "Usu" }) },
  { id: "pausa", icon: "⏸", label: "Pausa", is: (st) => st.pausa !== undefined, make: () => ({ pausa: 0.8 }) },
  { id: "sonido", icon: "🔊", label: "Sonido", is: (st) => st.sonido !== undefined, make: () => ({ sonido: "pop" }) },
  { id: "objeto", icon: "📦", label: "Objeto", is: (st) => st.objeto !== undefined, make: () => ({ objeto: "", donde: "centro" }) },
  { id: "rotulo", icon: "🪧", label: "Rótulo", is: (st) => st.rotulo !== undefined, make: () => ({ rotulo: "" }) },
  { id: "camara", icon: "🎥", label: "Cámara", is: (st) => st.camara !== undefined, make: () => ({ camara: "general" }) },
  { id: "entra", icon: "🚪", label: "Entra", is: (st) => st.entra !== undefined, make: ({ cast }) => ({ entra: cast[0] ?? "Usu" }) },
  { id: "sale", icon: "🏃", label: "Sale", is: (st) => st.sale !== undefined, make: ({ cast }) => ({ sale: cast[0] ?? "Usu" }) },
  { id: "huye", icon: "💨", label: "Huye", is: (st) => st.huye !== undefined, make: ({ cast }) => ({ huye: cast[0] ?? "Usu" }) },
  { id: "tiembla", icon: "〰", label: "Tiembla", is: (st) => st.tiembla !== undefined || st.salta !== undefined, make: ({ cast }) => ({ tiembla: cast[0] ?? "Usu" }) },
  { id: "teclea", icon: "⌨", label: "Teclea", is: (st) => st.teclea !== undefined, make: ({ cast }) => ({ teclea: cast[0] ?? "Usu", durante: 2 }) },
  { id: "empuja", icon: "🤜", label: "Empuja", is: (st) => st.empuja !== undefined, make: ({ cast }) => ({ empuja: cast[0] ?? "Usu", a: cast[1] ?? "Usu" }) },
];
const kindOf = (st: Obj) => KINDS.find((k) => k.is(st));
/** Los más usados, a mano en el botón de añadir. */
const QUICK = ["dice", "gesto", "efecto", "pausa", "off", "objeto"];

const EFFECTS: [string, string][] = [
  ["sorpresa", "❗ Sorpresa"], ["sudor", "💧 Sudor"], ["enfado", "💢 Enfado"], ["risa", "😂 Risa"], ["lineas", "💨 Líneas de velocidad"],
  ["mareo", "💫 Mareo"], ["humo", "☁ Humo"], ["corazones", "💕 Corazones"], ["onomatopeya", "💬 Onomatopeya (con texto)"], ["titulo", "🎬 Título (texto grande)"],
  ["explosion", "💥 Explosión"], ["pantallazo", "🟦 Pantallazo azul"], ["destello", "⚡ Destello"], ["temblor", "〰 Temblor de pantalla"], ["oscuro", "🌑 Apagón"],
];
const EMOTIONS = ["", "neutral", "alegria", "risa", "enfado", "sorpresa", "tristeza"];
const SOUNDS = ["pop", "whoosh", "ding", "boing", "golpe", "fracaso", "teclado", "telefono", "alarma", "pantallazo", "servidor", "explosion", "portazo"];

function summary(st: Obj): ReactNode {
  const k = kindOf(st);
  const t = str(st.texto);
  switch (k?.id) {
    case "dice":
      return <><b>{str(st.dice)}</b>{st.gesto ? <em> · {str(st.gesto)}</em> : null}: {t || <i className="muted">(sin texto)</i>}</>;
    case "off":
      return <><b>{str(st.off)}</b> <em>(off)</em>: {t || <i className="muted">(sin texto)</i>}</>;
    case "narrador":
      return <><b>Narrador</b>: {str(st.narrador) || t}</>;
    case "coro":
      return <><b>{(Array.isArray(st.coro) ? st.coro : []).join(", ")}</b> a coro: {t}</>;
    case "gesto":
      return <><b>{str(st.quien)}</b> → {str(st.gesto)}</>;
    case "cara":
      return <><b>{str(st.cara)}</b> pone cara de {str(st.emocion) || "neutral"}</>;
    case "mira":
      return <><b>{str(st.mira)}</b> mira a {str(st.a)}</>;
    case "efecto":
      return <>{str(st.efecto)}{st.donde ? <> sobre <b>{str(st.donde)}</b></> : null}{t ? <> «{t}»</> : null}</>;
    case "pausa":
      return <>Pausa de {String(st.pausa)} s</>;
    case "sonido":
      return <>Sonido «{str(st.sonido)}»</>;
    case "objeto":
      return <>Objeto <code>{str(st.objeto) || "—"}</code></>;
    case "rotulo":
      return <>«{str(st.rotulo)}»</>;
    case "camara":
      return <>Plano {str(st.camara)}{st.quien ? <> de <b>{str(st.quien)}</b></> : null}</>;
    case "entra":
    case "sale":
    case "huye":
    case "teclea":
      return <><b>{str(st[k.id])}</b> {k.label.toLowerCase()}</>;
    case "tiembla":
      return <><b>{str(st.tiembla ?? st.salta)}</b> {st.salta !== undefined ? "salta" : "tiembla"}</>;
    case "empuja":
      return <><b>{str(st.empuja)}</b> empuja a {str(st.a)}</>;
    default:
      return <code>{JSON.stringify(st).slice(0, 60)}</code>;
  }
}

/** Prefijo de poses que usa ese personaje en la escena («p» Puñeto / «h» humano). */
function posePrefix(cid: string, vista: string, catalog: Catalog): "p" | "h" {
  const ch = catalog.characters.find((c) => c.id === cid);
  const want = normKey(vista).startsWith("human") ? "h" : "p";
  return want === "p" && !ch?.poses.some((p) => p.key === "pose_p_neutro") ? "h" : want;
}

/** Al insertar (+1) o borrar (−1) un paso en «at», las acciones de las columnas siguen pegadas a sus pasos. */
function shiftActions(sc: Obj, at: number, delta: 1 | -1) {
  if (!Array.isArray(sc.acciones)) return;
  const out: Obj[] = [];
  for (const a of sc.acciones as Obj[]) {
    if (!isObj(a)) continue;
    let d0 = Number(a.desde) || 0;
    let d1 = typeof a.hasta === "number" ? a.hasta : d0;
    if (delta === 1) {
      if (d0 >= at) d0++;
      if (d1 >= at) d1++;
    } else {
      if (d0 === at && d1 === at) continue; // solo abarcaba el paso borrado
      if (d0 > at) d0--;
      if (d1 >= at) d1--;
    }
    out.push({ ...a, desde: d0, hasta: Math.max(d0, d1) });
  }
  sc.acciones = out;
}
function swapActions(sc: Obj, i: number, j: number) {
  if (!Array.isArray(sc.acciones)) return;
  for (const a of sc.acciones as Obj[]) {
    if (!isObj(a)) continue;
    const d0 = Number(a.desde) || 0;
    const d1 = typeof a.hasta === "number" ? a.hasta : d0;
    if (d0 === d1 && (d0 === i || d0 === j)) a.desde = a.hasta = d0 === i ? j : i;
  }
}

const NEW_SCENE = (cast: string[]): Obj => ({ nombre: "Nueva escena", lugar: "bg_cafeteria", personajes: cast, pasos: [] });
const NEW_SCRIPT: Script = { formato: "puñetos-guion-1", titulo: "Nuevo sketch", escenas: [{ nombre: "Escena 1", lugar: "bg_cafeteria", personajes: ["Usu", "Reynaldo"], camara: "auto", pasos: [{ dice: "Usu", texto: "" }] }] };

export function GuionScreen({ s }: { s: PocketState }) {
  const { catalog } = s;
  const stored = s.project.metadata.script;
  const [script, setScriptState] = useState<Script | null>(() => (isObj(stored) && Array.isArray(stored.escenas) ? (structuredClone(stored) as Script) : null));
  const [sel, setSel] = useState<Sel>({ scene: 0, step: 0 });
  const history = useRef<Script[]>([]);
  const pending = useRef<Script | null>(null);
  const propsRef = useRef<HTMLDivElement>(null);
  const [laneChar, setLaneChar] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const f = () => setNarrow(window.innerWidth < 760);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  // otro proyecto abierto (desde Proyectos): se carga su guion
  const pid = useRef(s.projectId);
  const pushed = useRef("");
  useEffect(() => {
    if (pid.current === s.projectId) return;
    pid.current = s.projectId;
    const st = s.project.metadata.script;
    // la copia propia que se crea al editar un capítulo oficial: es el mismo guion, no se recarga
    if (JSON.stringify(st ?? null) === pushed.current) return;
    setScriptState(isObj(st) && Array.isArray(st.escenas) ? (structuredClone(st) as Script) : null);
    history.current = [];
    setSel({ scene: 0, step: 0 });
  }, [s.projectId, s.project]);

  // animaciones retocadas en la pestaña Animación: la copia que lleva el guion se pone al día
  useEffect(() => {
    if (!script || !isObj(script.animaciones)) return;
    const lib = script.animaciones as Record<string, unknown[]>;
    let changed = false;
    const next: Record<string, unknown[]> = {};
    for (const [cid, list] of Object.entries(lib)) {
      next[cid] = (Array.isArray(list) ? list : []).map((x) => {
        const a = cleanAnimation(x);
        const fresh = a ? (s.animLib[cid] ?? []).find((y) => y.nombre === a.nombre) : undefined;
        if (fresh && JSON.stringify(fresh) !== JSON.stringify(a)) {
          changed = true;
          return fresh;
        }
        return x;
      });
    }
    if (changed) {
      const d = { ...script, animaciones: next } as Script;
      pending.current = d;
      setScriptState(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.animLib, script === null]);

  const compiled = useMemo(() => (script ? compileScript(script, catalog) : null), [script, catalog]);

  // el sketch montado pasa al proyecto (y se guarda) poco después de dejar de escribir
  const flush = () => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    const c = compileScript(next, catalog);
    if (!c.project) return;
    const built = c.project;
    pushed.current = JSON.stringify(built.metadata.script ?? null);
    s.editProject((d) => {
      d.takes = built.takes;
      d.metadata.script = built.metadata.script;
      d.metadata.title = built.metadata.title;
      d.metadata.approxDuration = built.metadata.approxDuration;
    });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);
  useEffect(() => {
    if (!pending.current) return;
    const h = setTimeout(() => flushRef.current(), 600);
    return () => clearTimeout(h);
  }, [script]);

  // «Colocar con el dedo» (pantalla completa) y versión para refrescar el formulario de la escena al volver
  const [placing, setPlacing] = useState(false);
  const [placeVer, setPlaceVer] = useState(0);
  const [sheet, setSheet] = useState(false);
  // personaje tocado en el visor de la ventana del paso (para su orientación)
  const [pick, setPick] = useState<string | null>(null);
  const [posNote, setPosNote] = useState<{ uid: string; owner: number; x: number; y: number } | null>(null);
  const update = (fn: (d: Script) => void, keepHistory = true) => {
    if (!script) return;
    const d = structuredClone(script);
    fn(d);
    if (keepHistory) history.current = [...history.current.slice(-60), script];
    pending.current = d;
    setScriptState(d);
  };
  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    pending.current = prev;
    setScriptState(prev);
  };

  /** Copia de seguridad: el sketch entero (guion incluido) en un archivo .json. */
  const saveFile = () => {
    flush();
    // el proyecto con el guion más reciente (aunque aún no se haya pasado al proyecto)
    const c = script ? compileScript(script, catalog) : null;
    const p = c?.project ? { ...structuredClone(s.project), takes: c.project.takes, metadata: { ...s.project.metadata, ...c.project.metadata } } : s.project;
    downloadText(projectFileName(p), exportProjectText(p));
  };
  const loadFile = async (f?: File) => {
    if (!f) return;
    const r = importProjectText(await f.text(), catalog);
    if (!r.ok || !r.project) return alert(`No se pudo abrir el archivo: ${r.errors.map((e) => e.message).join("; ") || "no es un sketch de Pocket"}`);
    const st = r.project.metadata.script;
    if (!isObj(st) || !Array.isArray(st.escenas)) return alert("El archivo no trae guion: ábrelo desde Proyectos → Importar.");
    if (!confirm(`¿Abrir «${r.project.metadata.title}»? Se guarda como una copia nueva; lo que tienes abierto sigue en Proyectos.`)) return;
    pending.current = null;
    s.replaceProject(r.project);
    setScriptState(structuredClone(st) as Script);
    history.current = [];
    setSel({ scene: 0, step: 0 });
  };

  if (!script) {
    return (
      <div className="screen">
        <section className="card">
          <h2>Editor de guion</h2>
          <p className="fine">Este proyecto no tiene guion (se hizo antes de que existiera el editor, o se importó ya montado). Puedes seguir retocándolo en <b>Avanzado</b>, abrir un capítulo o sketch desde <b>Proyectos</b>, o empezar uno nuevo.</p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => { const c = compileScript(NEW_SCRIPT, catalog); if (c.project) { s.replaceProject(c.project); setScriptState(structuredClone(NEW_SCRIPT)); } }}>
              ＋ Empezar un sketch nuevo
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => s.setTab("proyectos")}>🗂 Proyectos</button>
            <label className="btn btn-secondary file-btn">
              📂 Cargar archivo
              <input type="file" accept=".json,application/json" onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
        </section>
      </div>
    );
  }

  const scenes = script.escenas;
  const sc = scenes[Math.min(sel.scene, scenes.length - 1)] ?? {};
  const si = Math.min(sel.scene, scenes.length - 1);
  const steps = (Array.isArray(sc.pasos) ? sc.pasos : []) as Obj[];
  const stepIdx = sel.step !== null && sel.step < steps.length ? sel.step : null;
  const step = stepIdx !== null ? steps[stepIdx] : null;
  const cast = (Array.isArray(sc.personajes) ? sc.personajes : []).filter((x): x is string => typeof x === "string");
  const lanes = narrow ? cast.filter((c) => c === (laneChar && cast.includes(laneChar) ? laneChar : cast[0])) : cast;
  const actions = (Array.isArray(sc.acciones) ? sc.acciones : []) as Obj[];
  const actIdx = sel.action !== undefined && isObj(actions[sel.action]) ? sel.action : null;
  const action = actIdx !== null ? actions[actIdx] : null;

  // momento del sketch que corresponde a lo elegido
  const mark = compiled?.marks[si];
  const take = mark && compiled?.project ? compiled.project.takes[mark.take] : undefined;
  const t0 = mark ? (stepIdx !== null ? mark.times[stepIdx] ?? 0 : 0) : 0;
  const t1 = mark ? (stepIdx !== null ? mark.times[stepIdx + 1] ?? t0 : mark.times[0] ?? 0) : 0;
  const aT1 = mark && action ? mark.times[Math.min(steps.length - 1, Math.max(Number(action.desde) || 0, typeof action.hasta === "number" ? action.hasta : Number(action.desde) || 0)) + 1] ?? 0 : 0;
  const tShow = take && action && !(sheet && stepIdx !== null) ? Math.max(0, Math.min(take.duration - 0.05, aT1 - 0.05)) : take ? Math.min(take.duration - 0.05, stepIdx === null ? Math.max(0.4, t0 + 0.4) : t1 > t0 ? t0 + Math.min(t1 - t0 - 0.05, Math.max(0.35, (t1 - t0) * 0.6)) : t0 + 0.5) : 0;
  const frame = take ? evaluateTake(take, catalog, Math.max(0, tShow)) : null;
  const sceneIssues = (compiled?.issues ?? []).filter((i) => i.path.startsWith(`escenas[${si}]`));
  const stepIssues = stepIdx !== null ? sceneIssues.filter((i) => i.path.startsWith(`escenas[${si}].pasos[${stepIdx}]`)) : sceneIssues.filter((i) => !i.path.includes(".pasos["));
  const totalDur = compiled?.project?.takes.reduce((n, t) => n + t.duration, 0) ?? 0;
  const lineCount = scenes.reduce((n, x) => n + ((Array.isArray(x.pasos) ? x.pasos : []) as Obj[]).filter((p) => isObj(p) && (p.dice !== undefined || p.off !== undefined || p.coro !== undefined || p.narrador !== undefined)).length, 0);

  const select = (next: Sel) => {
    setSel(next);
    // móvil: el paso se abre en una ventana con el visor arriba y su configuración debajo (sin subir y bajar)
    if (typeof window !== "undefined" && window.innerWidth < 760) setSheet(true);
    else if (typeof window !== "undefined" && window.innerWidth < 1000) setTimeout(() => propsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  const playFrom = (scene: number, stepI: number | null) => {
    flush();
    const m = compiled?.marks[scene];
    if (!m) return;
    s.setPlayFrom({ take: m.take, t: Math.max(0, (stepI !== null ? m.times[stepI] ?? 0 : 0) - 0.2) });
    s.setTab("ver");
  };
  const setStep = (fn: (st: Obj) => void) =>
    update((d) => {
      const arr = d.escenas[si].pasos as Obj[];
      if (stepIdx !== null && isObj(arr[stepIdx])) fn(arr[stepIdx]);
    });
  const setScene = (fn: (x: Obj) => void) => update((d) => fn(d.escenas[si]));
  /** Animaciones de un personaje: las del dispositivo y las que ya trae el guion. */
  const animsOf = (cid?: string): Animation[] => {
    if (!cid) return [];
    const m = new Map<string, Animation>();
    const inScript = isObj(script.animaciones) && Array.isArray(script.animaciones[cid]) ? (script.animaciones[cid] as unknown[]).map(cleanAnimation).filter((a): a is Animation => !!a) : [];
    for (const a of inScript) m.set(a.nombre, a);
    for (const a of animationsFor(cid, s.animLib as AnimLibrary)) m.set(a.nombre, a);
    return [...m.values()];
  };
  const lastDrag = useRef(0);
  /**
   * Quién manda sobre la posición de un personaje en un paso: su último movimiento que empieza en o antes de ese
   * paso (manda el paso donde empieza), o si no se ha movido, el principio de la escena (paso 1).
   */
  const posOwner = (uid: string, k: number): { step: number; move?: number } => {
    let best: { step: number; move?: number } = { step: 0 };
    actions.forEach((a, i) => {
      if (!isObj(a) || resolveCharacter(a.quien, catalog) !== uid) return;
      if (typeof a.x !== "number" && typeof a.y !== "number") return;
      const d0 = Number(a.desde) || 0;
      if (d0 <= k && (best.move === undefined || d0 >= best.step)) best = { step: d0, move: i };
    });
    return best;
  };
  /**
   * Arrastrar en el visor de un paso: solo en el paso que manda sobre su posición (así nunca da botes).
   * En otro paso sale un aviso: ir a ese paso, o añadir un movimiento desde aquí.
   */
  const placeAt = (uid: string, x: number, y: number) => {
    if (stepIdx === null) return;
    const k = stepIdx;
    const own = posOwner(uid, k);
    if (own.step !== k) {
      setPosNote({ uid, owner: own.step, x: Math.round(x), y: Math.round(y) });
      return;
    }
    const now = Date.now();
    const keep = now - lastDrag.current > 600;
    lastDrag.current = now;
    update((d) => {
      const scn = d.escenas[si];
      const acts = (Array.isArray(scn.acciones) ? scn.acciones : []) as Obj[];
      const mv = own.move !== undefined && isObj(acts[own.move]) ? acts[own.move] : undefined;
      if (mv) {
        mv.x = Math.round(x);
        mv.y = Math.round(y);
        return;
      }
      const col = (isObj(scn.colocar) ? scn.colocar : {}) as Obj;
      const key = Object.keys(col).find((n) => resolveCharacter(n, catalog) === uid) ?? cast.find((n) => resolveCharacter(n, catalog) === uid) ?? uid;
      const o = (isObj(col[key]) ? col[key] : {}) as Obj;
      o.x = Math.round(x);
      o.y = Math.round(y);
      col[key] = o;
      scn.colocar = col;
    }, keep);
  };
  /**
   * Orientación a mano (espejo horizontal / vertical, giro): en la acción abierta de ese personaje; si no, en lo que
   * manda sobre su posición si es este paso; y si no, una acción nueva en este paso (cambia a partir de aquí).
   */
  const orient = (uid: string, patch: Obj) => {
    if (stepIdx === null) return;
    const k = stepIdx;
    if (action && resolveCharacter(action.quien, catalog) === uid) return setAction((a) => Object.assign(a, patch));
    const own = posOwner(uid, k);
    const name = cast.find((n) => resolveCharacter(n, catalog) === uid) ?? uid;
    if (own.step === k) {
      update((d) => {
        const scn = d.escenas[si];
        const acts = (Array.isArray(scn.acciones) ? scn.acciones : []) as Obj[];
        if (own.move !== undefined && isObj(acts[own.move])) return void Object.assign(acts[own.move], patch);
        const col = (isObj(scn.colocar) ? scn.colocar : {}) as Obj;
        const key = Object.keys(col).find((n) => resolveCharacter(n, catalog) === uid) ?? name;
        col[key] = Object.assign(isObj(col[key]) ? col[key] : {}, patch);
        scn.colocar = col;
      });
      return;
    }
    const at = actions.length;
    update((d) => {
      const x = d.escenas[si];
      if (!Array.isArray(x.acciones)) x.acciones = [];
      (x.acciones as Obj[]).push({ quien: name, desde: k, hasta: k, ...patch });
    });
    setSel({ scene: si, step: k, action: at });
  };
  /** «＋ Moverlo desde aquí»: un movimiento en este paso hasta donde lo has soltado (luego se afina arrastrando). */
  const addMoveHere = () => {
    if (!posNote || stepIdx === null) return;
    const name = cast.find((n) => resolveCharacter(n, catalog) === posNote.uid) ?? posNote.uid;
    const at = actions.length;
    update((d) => {
      const x = d.escenas[si];
      if (!Array.isArray(x.acciones)) x.acciones = [];
      (x.acciones as Obj[]).push({ quien: name, desde: stepIdx, hasta: stepIdx, x: posNote.x, y: posNote.y, modo: "anda" });
    });
    setSel({ scene: si, step: stepIdx, action: at });
    setPosNote(null);
  };
  const setAction = (fn: (a: Obj) => void, fromDrag = false) => {
    const now = Date.now();
    const keep = !fromDrag || now - lastDrag.current > 600;
    if (fromDrag) lastDrag.current = now;
    update((d) => {
      const arr = d.escenas[si].acciones as Obj[];
      if (actIdx !== null && isObj(arr?.[actIdx])) fn(arr[actIdx]);
    }, keep);
  };
  const addAction = (who: string, row: number) => {
    const at = actions.length;
    update((d) => {
      const x = d.escenas[si];
      if (!Array.isArray(x.acciones)) x.acciones = [];
      (x.acciones as Obj[]).push({ quien: who, desde: row, hasta: row });
    });
    select({ scene: si, step: row, action: at });
  };
  const actionAt = (who: string, row: number) => {
    const cid = resolveCharacter(who, catalog);
    for (let i = actions.length - 1; i >= 0; i--) {
      const a = actions[i];
      if (!isObj(a) || resolveCharacter(a.quien, catalog) !== cid) continue;
      const d0 = Number(a.desde) || 0;
      const d1 = typeof a.hasta === "number" ? a.hasta : d0;
      if (row >= d0 && row <= d1) return { a, i, first: row === d0, last: row === d1 };
    }
    return undefined;
  };
  const addStep = (kind: string) => {
    const k = KINDS.find((x) => x.id === kind)!;
    const at = stepIdx !== null ? stepIdx + 1 : steps.length;
    update((d) => {
      const x = d.escenas[si];
      if (!Array.isArray(x.pasos)) x.pasos = [];
      (x.pasos as Obj[]).splice(at, 0, k.make({ cast }));
      shiftActions(x, at, 1);
    });
    setSel({ scene: si, step: at });
  };
  const moveStep = (dir: -1 | 1) => {
    if (stepIdx === null) return;
    const to = stepIdx + dir;
    if (to < 0 || to >= steps.length) return;
    update((d) => {
      const arr = d.escenas[si].pasos as Obj[];
      [arr[stepIdx], arr[to]] = [arr[to], arr[stepIdx]];
      swapActions(d.escenas[si], stepIdx, to);
    });
    setSel({ scene: si, step: to });
  };
  const moveScene = (dir: -1 | 1) => {
    const to = si + dir;
    if (to < 0 || to >= scenes.length) return;
    update((d) => {
      [d.escenas[si], d.escenas[to]] = [d.escenas[to], d.escenas[si]];
    });
    setSel({ scene: to, step: null });
  };

  // ventana del móvil: pasar al paso anterior / siguiente sin cerrarla (la escena es el «paso 0»)
  const isEmptyAction = (a: Obj | null) => !!a && Object.keys(a).every((k) => k === "quien" || k === "desde" || k === "hasta");
  const goSel = (next: Sel) => {
    setPosNote(null);
    if (actIdx !== null && isEmptyAction(action) && next.action !== actIdx) {
      const gone = actIdx;
      update((d) => { (d.escenas[si].acciones as Obj[]).splice(gone, 1); });
      if (next.action !== undefined && next.action > gone) next = { ...next, action: next.action - 1 };
    }
    setSel(next);
  };
  const goStep = (dir: -1 | 1) => {
    const cur = stepIdx === null ? -1 : stepIdx;
    const to = cur + dir;
    if (to < -1 || to >= steps.length) return;
    const who = action ? str(action.quien) : "";
    const hit = who && to >= 0 ? actionAt(who, to) : undefined;
    goSel({ scene: si, step: to === -1 ? null : to, ...(hit ? { action: hit.i } : {}) });
  };
  return (
    <div className={`guion${sheet ? " sheet-open" : ""}`}>
      {sheet && (
        <div className="sheet-bar">
          <button type="button" className="btn btn-small btn-ghost" onClick={() => { if (actIdx !== null) goSel({ scene: si, step: stepIdx }); setSheet(false); }} aria-label="Cerrar">✕</button>
          <button type="button" className="btn btn-small btn-secondary" onClick={() => goStep(-1)} disabled={!action && stepIdx === null} aria-label="Paso anterior">◀</button>
          <span className="sheet-title">{stepIdx !== null ? `Paso ${stepIdx + 1} de ${steps.length}` : action ? `🎭 ${str(action.quien)}` : `🎬 Escena ${si + 1}`}</span>
          <button type="button" className="btn btn-small btn-secondary" onClick={() => goStep(1)} disabled={!action && stepIdx === steps.length - 1} aria-label="Paso siguiente">▶</button>
        </div>
      )}
      {/* ------------------------------------------------ izquierda: estructura */}
      <aside className="guion-col guion-list" aria-label="Escenas y pasos">
        <div className="guion-head">
          <input className="guion-title" value={str(script.titulo)} maxLength={120} onChange={(e) => update((d) => { d.titulo = e.target.value; })} aria-label="Título" />
          <button type="button" className="btn btn-small btn-ghost" onClick={undo} disabled={!history.current.length} title="Deshacer">↶</button>
        </div>
        <div className="row g-file">
          <button type="button" className="btn btn-small btn-secondary" onClick={saveFile} title="Descarga el sketch en un archivo .json (copia de seguridad)">💾 Guardar archivo</button>
          <label className="btn btn-small btn-ghost file-btn" title="Abre un sketch guardado antes en un archivo .json">
            📂 Cargar archivo
            <input type="file" accept=".json,application/json" onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
        <label className="g-check" title="Al elegir una pose para una frase, el personaje se queda en ella hasta que le pongas otra">
          <input type="checkbox" checked={normKey(str(script.gestos)) !== "volver"} onChange={(e) => update((d) => { if (e.target.checked) delete d.gestos; else d.gestos = "volver"; })} />
          Las poses se mantienen (si no, vuelven a la de reposo al acabar cada frase)
        </label>
        <p className="fine">{scenes.length} escena(s) · {lineCount} frase(s) · {totalDur.toFixed(0)} s aprox.</p>
        {scenes.map((x, i) => {
          const ps = (Array.isArray(x.pasos) ? x.pasos : []) as Obj[];
          const open = i === si;
          return (
            <div key={i} className={`g-scene${open ? " open" : ""}`}>
              <div className={`g-row g-scene-row${open && stepIdx === null ? " on" : ""}`}>
                <button type="button" className="g-main" onClick={() => (open ? select({ scene: i, step: null }) : setSel({ scene: i, step: null }))}>
                  <span className="g-ico">🎬</span>
                  <span className="g-txt"><b>{i + 1}. {str(x.nombre) || `Escena ${i + 1}`}</b><small>{str(x.lugar).replace(/^bg_/, "")} · {ps.length} pasos</small></span>
                </button>
                <button type="button" className="g-play" onClick={() => playFrom(i, null)} title="Ver desde aquí" aria-label="Ver desde aquí">▶</button>
              </div>
              {open && cast.length > 0 && (
                <div className="g-lanes-head">
                  {narrow ? (
                    <select className="g-lane-pick" value={lanes[0]} onChange={(e) => setLaneChar(e.target.value)} aria-label="Columna de">
                      {cast.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    lanes.map((c) => <span key={c} className="g-lane-name" title={c}>{c.slice(0, 3)}</span>)
                  )}
                  <span className="fine">Columnas: toca una casilla para que haga algo en ese paso</span>
                </div>
              )}
              {open && (
                <ol className="g-steps">
                  {ps.map((st, k) => {
                    const kd = isObj(st) ? kindOf(st) : undefined;
                    const long = isObj(st) && words(str(st.texto)) > 15;
                    const bad = (compiled?.issues ?? []).some((is) => is.path.startsWith(`escenas[${i}].pasos[${k}]`));
                    return (
                      <li key={k} className={`g-row${k === stepIdx && actIdx === null ? " on" : ""}`}>
                        {lanes.map((c) => {
                          const hit = actionAt(c, k);
                          const mv = hit && (typeof hit.a.x === "number" || typeof hit.a.y === "number");
                          return (
                            <button
                              key={c}
                              type="button"
                              className={`g-cell${hit ? " full" : ""}${hit?.first ? " first" : ""}${hit?.last ? " last" : ""}${hit && hit.i === actIdx ? " on" : ""}`}
                              title={hit ? `${c}: ${hit.a.gesto ? String(hit.a.gesto) : ""}${mv ? " se mueve" : ""}` : `${c}: añadir acción aquí`}
                              onClick={() => (hit ? select({ scene: i, step: k, action: hit.i }) : addAction(c, k))}
                            >
                              {hit?.first ? (hit.a.animacion ? "🎞" : mv ? "🚶" : hit.a.gesto ? "🤸" : "•") : hit ? "" : "+"}
                            </button>
                          );
                        })}
                        <button type="button" className="g-main" onClick={() => select({ scene: i, step: k })}>
                          <span className="g-ico">{kd?.icon ?? "❔"}</span>
                          <span className="g-txt">{isObj(st) ? summary(st) : "?"}</span>
                          {(bad || long) && <span className="g-warn" title={bad ? "Hay un problema en este paso" : "Frase larga (más de 15 palabras)"}>{bad ? "✖" : "⚠"}</span>}
                        </button>
                        <button type="button" className="g-play" onClick={() => playFrom(i, k)} title="Ver desde aquí" aria-label="Ver desde aquí">▶</button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
        <button type="button" className="btn btn-small btn-ghost" onClick={() => { update((d) => { d.escenas.splice(si + 1, 0, NEW_SCENE(cast)); }); setSel({ scene: si + 1, step: null }); }}>
          ＋ Escena
        </button>
      </aside>

      {/* ------------------------------------------------ centro: cómo queda */}
      <section className="guion-col guion-stage" aria-label="Vista previa">
        {frame ? (
          <Stage
            catalog={catalog}
            frame={frame}
            maxHeight={sheet ? (pick ? "calc(42dvh - 112px)" : "calc(42dvh - 64px)") : "58vh"}
            {...(sheet && stepIdx !== null && !(action && (typeof action.x === "number" || typeof action.y === "number"))
              ? { selectedUid: pick ?? (action ? resolveCharacter(action.quien, catalog) ?? null : null), onSelectActor: (uid: string) => setPick(uid), onMoveActor: (uid: string, x: number, y: number) => { setPick(uid); placeAt(uid, x, y); } }
              : action ? { selectedUid: resolveCharacter(action.quien, catalog) ?? null, onMoveActor: (uid: string, x: number, y: number) => { if (uid === resolveCharacter(action.quien, catalog)) setAction((a) => { a.x = Math.round(x); a.y = Math.round(y); if (!a.modo) a.modo = "anda"; }, true); } } : {})}
          />
        ) : <p className="fine">No se puede montar esta escena todavía.</p>}
        {sheet && pick && stepIdx !== null && frame && (() => {
          const fa = frame.actors.find((a) => a.uid === pick);
          if (!fa) return null;
          const nm = cast.find((n) => resolveCharacter(n, catalog) === pick) ?? pick;
          const giro = (v: number) => orient(pick, { giro: Math.max(-180, Math.min(180, Math.round(v))) });
          return (
            <div className="orient-bar" aria-label={`Orientación de ${nm}`}>
              <b>{nm}</b>
              <button type="button" className={`btn btn-small btn-secondary${fa.flip ? " on" : ""}`} onClick={() => orient(pick, { mira: fa.flip ? "derecha" : "izquierda" })} title="Espejo horizontal (mira al otro lado)">↔</button>
              <button type="button" className={`btn btn-small btn-secondary${fa.flipV ? " on" : ""}`} onClick={() => orient(pick, { voltear_v: !fa.flipV })} title="Espejo vertical (boca abajo)">↕</button>
              <button type="button" className="btn btn-small btn-secondary" onClick={() => giro(fa.rot - 15)} title="Girar 15° a la izquierda">⟲</button>
              <span className="fine orient-deg">{Math.round(fa.rot)}°</span>
              <button type="button" className="btn btn-small btn-secondary" onClick={() => giro(fa.rot + 15)} title="Girar 15° a la derecha">⟳</button>
              {fa.rot !== 0 && <button type="button" className="btn btn-small btn-ghost" onClick={() => giro(0)} title="Sin giro">0°</button>}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setPick(null)} aria-label="Cerrar">✕</button>
            </div>
          );
        })()}
        {sheet && posNote && stepIdx !== null && posNote.owner !== stepIdx && (
          <div className="pos-note" role="alert">
            <p>
              La posición de <b>{cast.find((n) => resolveCharacter(n, catalog) === posNote.uid) ?? posNote.uid}</b> la manda el <b>paso {posNote.owner + 1}</b>
              {posOwner(posNote.uid, stepIdx).move !== undefined ? " (donde empieza su último movimiento)" : " (el principio de la escena)"}.
              Para cambiarla, ve a ese paso; para que cambie a partir de aquí, añade un movimiento.
            </p>
            <div className="row">
              <button type="button" className="btn btn-small btn-primary" onClick={() => { const o = posNote.owner; setPosNote(null); goSel({ scene: si, step: o }); }}>Ir al paso {posNote.owner + 1}</button>
              <button type="button" className="btn btn-small btn-secondary" onClick={addMoveHere}>＋ Moverlo desde aquí</button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setPosNote(null)} aria-label="Cerrar aviso">✕</button>
            </div>
          </div>
        )}
        {action && <p className="fine">✋ Arrastra a {str(action.quien)} en la imagen para decir adónde va.</p>}
        <div className="row g-stage-bar">
          <button type="button" className="btn btn-primary btn-small" onClick={() => playFrom(si, stepIdx)}>▶ Ver desde aquí</button>
          <span className="fine">Escena {si + 1}{action ? ` · acción de ${str(action.quien)} (cómo acaba)` : stepIdx !== null ? ` · paso ${stepIdx + 1}` : ""} · segundo {tShow.toFixed(1)} de {take ? take.duration.toFixed(1) : "?"}</span>
        </div>
        <Info step={step} sceneIssues={sceneIssues} stepIssues={stepIssues} cast={cast} catalog={catalog} vista={str(sc.vista)} />
      </section>

      {/* ------------------------------------------------ derecha: propiedades */}
      <aside className="guion-col guion-props" ref={propsRef} aria-label="Propiedades">
        {sheet && stepIdx !== null && (
          <div className="sheet-tabs" role="tablist" aria-label="Qué editar en este paso">
            <button type="button" role="tab" aria-selected={!action} className={`chip${!action ? " on" : ""}`} onClick={() => goSel({ scene: si, step: stepIdx })}>
              {kindOf(step ?? {})?.icon ?? "•"} Paso
            </button>
            {cast.map((c) => {
              const hit = actionAt(c, stepIdx);
              const on = !!action && resolveCharacter(action.quien, catalog) === resolveCharacter(c, catalog);
              return (
                <button key={c} type="button" role="tab" aria-selected={on} className={`chip${on ? " on" : ""}${hit ? " full" : ""}`} onClick={() => {
                  if (hit) goSel({ scene: si, step: stepIdx, action: hit.i });
                  else {
                    // una sola actualización: se quita la acción vacía que estuviera abierta y se crea la nueva
                    const gone = actIdx !== null && isEmptyAction(action) ? actIdx : null;
                    update((d) => {
                      const x = d.escenas[si];
                      if (!Array.isArray(x.acciones)) x.acciones = [];
                      if (gone !== null) (x.acciones as Obj[]).splice(gone, 1);
                      (x.acciones as Obj[]).push({ quien: c, desde: stepIdx, hasta: stepIdx });
                    });
                    setSel({ scene: si, step: stepIdx, action: actions.length - (gone !== null ? 1 : 0) });
                  }
                }} title={hit ? `Lo que hace ${c} en este paso` : `Añadir algo que haga ${c} en este paso`}>
                  {hit ? "🎭" : "＋"} {c}
                </button>
              );
            })}
          </div>
        )}
        {action && actIdx !== null ? (
          <>
            <div className="g-props-head">
              <h2>🎭 {str(action.quien)} <small>· columna</small></h2>
              <div className="row">
                <button type="button" className="btn btn-small btn-danger" onClick={() => { update((d) => { (d.escenas[si].acciones as Obj[]).splice(actIdx, 1); }); setSel({ scene: si, step: Number(action.desde) || 0 }); }} title="Borrar">🗑</button>
              </div>
            </div>
            <ActionProps
              key={`${si}-a${actIdx}`}
              a={action}
              steps={steps}
              vista={str(sc.vista)}
              catalog={catalog}
              cats={s.poseCats}
              set={setAction}
              anims={animsOf(resolveCharacter(action.quien, catalog))}
              pickAnim={(an) => update((d) => {
                const cid = resolveCharacter(action.quien, catalog);
                const arr = d.escenas[si].acciones as Obj[];
                if (!cid || actIdx === null || !isObj(arr?.[actIdx])) return;
                if (!an) { delete arr[actIdx].animacion; return; }
                arr[actIdx].animacion = an.nombre;
                // se copia en el guion: así el proyecto funciona en cualquier dispositivo
                const lib = (isObj(d.animaciones) ? d.animaciones : {}) as Record<string, unknown[]>;
                lib[cid] = [...(Array.isArray(lib[cid]) ? lib[cid] : []).filter((x) => !(isObj(x) && x.nombre === an.nombre)), an];
                d.animaciones = lib;
              })}
            />
          </>
        ) : step && stepIdx !== null ? (
          <>
            <div className="g-props-head">
              <h2>{kindOf(step)?.icon} {kindOf(step)?.label ?? "Paso"} <small>· paso {stepIdx + 1}</small></h2>
              <div className="row">
                <button type="button" className="btn btn-small btn-ghost" onClick={() => moveStep(-1)} disabled={stepIdx === 0} title="Subir">↑</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => moveStep(1)} disabled={stepIdx === steps.length - 1} title="Bajar">↓</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => { update((d) => { (d.escenas[si].pasos as Obj[]).splice(stepIdx + 1, 0, structuredClone(step)); shiftActions(d.escenas[si], stepIdx + 1, 1); }); setSel({ scene: si, step: stepIdx + 1 }); }} title="Duplicar">⧉</button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => { update((d) => { (d.escenas[si].pasos as Obj[]).splice(stepIdx, 1); shiftActions(d.escenas[si], stepIdx, -1); }); setSel({ scene: si, step: stepIdx > 0 ? stepIdx - 1 : steps.length > 1 ? 0 : null }); }} title="Borrar">🗑</button>
              </div>
            </div>
            <StepProps key={`${si}-${stepIdx}`} st={step} cast={cast} vista={str(sc.vista)} catalog={catalog} set={setStep} cats={s.poseCats} />
          </>
        ) : (
          <>
            <div className="g-props-head">
              <h2>🎬 Escena {si + 1}</h2>
              <div className="row">
                <button type="button" className="btn btn-small btn-ghost" onClick={() => moveScene(-1)} disabled={si === 0} title="Subir">↑</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => moveScene(1)} disabled={si === scenes.length - 1} title="Bajar">↓</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => { update((d) => { d.escenas.splice(si + 1, 0, structuredClone(sc)); }); setSel({ scene: si + 1, step: null }); }} title="Duplicar">⧉</button>
                <button type="button" className="btn btn-small btn-danger" disabled={scenes.length < 2} onClick={() => { if (confirm(`¿Borrar la escena «${str(sc.nombre)}»?`)) { update((d) => { d.escenas.splice(si, 1); }); setSel({ scene: Math.max(0, si - 1), step: null }); } }} title="Borrar">🗑</button>
              </div>
            </div>
            {Array.isArray(sc.personajes) && sc.personajes.length > 0 && (
              <button type="button" className="btn btn-primary place-open" onClick={() => setPlacing(true)}>📍 Colocar personajes con el dedo</button>
            )}
            {placing && script && (
              <PlaceMode
                script={script as unknown as Obj}
                sceneIndex={si}
                catalog={catalog}
                onApply={(next) => { update((d) => { d.escenas = (next as Script).escenas; }); setPlaceVer((v) => v + 1); }}
                onClose={() => setPlacing(false)}
              />
            )}
            <SceneProps key={`${si}:${placeVer}`} sc={sc} catalog={catalog} set={setScene} />
          </>
        )}
        <div className="g-add">
          <span className="field-label">Añadir {stepIdx !== null ? "después de este paso" : "al final de la escena"}</span>
          <div className="chips">
            {QUICK.map((id) => {
              const k = KINDS.find((x) => x.id === id)!;
              return <button key={id} type="button" className="chip" onClick={() => addStep(id)}>{k.icon} {k.label}</button>;
            })}
            <select className="chip chip-select" value="" onChange={(e) => e.target.value && addStep(e.target.value)} aria-label="Otro tipo de paso">
              <option value="">Más…</option>
              {KINDS.filter((k) => !QUICK.includes(k.id)).map((k) => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
            </select>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- panel de información (centro)
function Info({ step, sceneIssues, stepIssues, cast, catalog, vista }: { step: Obj | null; sceneIssues: { path: string; message: string }[]; stepIssues: { path: string; message: string }[]; cast: string[]; catalog: Catalog; vista: string }) {
  const t = step ? str(step.texto) || str(step.narrador) : "";
  const w = words(t);
  const who = step ? resolveCharacter(step.dice ?? step.quien, catalog) : undefined;
  const ch = who ? catalog.characters.find((c) => c.id === who) : undefined;
  return (
    <div className="g-info">
      {t && (
        <p className={w > 15 ? "warn-text" : "fine"}>
          {w} palabra{w === 1 ? "" : "s"} · unos {estimate(t).toFixed(1)} s{w > 15 ? " · ⚠ larga: mejor partirla (menos de 15 palabras)" : ""}
        </p>
      )}
      {stepIssues.map((i, k) => <p key={k} className="error-text">✖ {i.message}</p>)}
      {!stepIssues.length && sceneIssues.length > 0 && <p className="warn-text">⚠ {sceneIssues.length} aviso(s) en otros pasos de esta escena (marcados con ✖ en la lista).</p>}
      {ch && (
        <p className="fine">
          <b>{ch.name}</b> tiene {ch.poses.filter((p) => p.key.startsWith(`pose_${posePrefix(ch.id, vista, catalog)}_`) && !p.archived).length} gestos en esta vista.
        </p>
      )}
      <p className="fine">En escena: {cast.join(", ") || "nadie"}. Consejo: frases cortas, y que el chiste se entienda sin conocer la serie.</p>
    </div>
  );
}

// ---------------------------------------------------------------- propiedades de un paso
function StepProps({ st, cast, vista, catalog, set, cats }: { st: Obj; cast: string[]; vista: string; catalog: Catalog; set: (fn: (st: Obj) => void) => void; cats: PoseCategoryMap }) {
  const kind = kindOf(st)?.id;
  const field = (key: string, v: unknown) => set((x) => { if (v === "" || v === undefined || (typeof v === "number" && !Number.isFinite(v))) delete x[key]; else x[key] = v; });
  const who = (key: string, label = "Personaje", options = cast) => (
    <Field label={label}>
      <select value={str(st[key])} onChange={(e) => field(key, e.target.value)}>
        {!options.includes(str(st[key])) && <option value={str(st[key])}>{str(st[key]) || "—"}</option>}
        {options.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </Field>
  );
  const text = (key = "texto", label = "Texto", max = 400) => (
    <Field label={label} hint={key === "texto" ? "Entre corchetes, cómo lo dice: [sadly], [angry], [whispers]…" : undefined}>
      <textarea rows={3} value={str(st[key])} maxLength={max} onChange={(e) => field(key, e.target.value)} />
    </Field>
  );
  const num = (key: string, label: string, step = 0.1, hint?: string) => (
    <Field label={label} hint={hint}>
      <input type="number" step={step} value={typeof st[key] === "number" ? (st[key] as number) : ""} onChange={(e) => field(key, e.target.value === "" ? undefined : Number(e.target.value))} />
    </Field>
  );
  const allNames = [...new Set([...cast, ...catalog.characters.map((c) => c.name)])];

  return (
    <div className="g-form">
      {kind === "dice" && (
        <>
          {who("dice", "Quién habla", allNames)}
          {text()}
          <Gestures cid={resolveCharacter(st.dice, catalog)} vista={vista} catalog={catalog} cats={cats} value={str(st.gesto)} onChange={(g) => field("gesto", g)} label="Gesto mientras lo dice (👄 = mueve la boca)" />
          <Field label="Emoción de la cara">
            <select value={str(st.emocion)} onChange={(e) => field("emocion", e.target.value)}>
              {EMOTIONS.map((e) => <option key={e} value={e}>{e || "— la del gesto —"}</option>)}
            </select>
          </Field>
          {num("pausa_despues", "Pausa después (s)", 0.1, "Silencio antes del siguiente paso (0–4 s).")}
          <label className="g-check"><input type="checkbox" checked={st.columna === true} onChange={(e) => field("columna", e.target.checked || undefined)} /> Mientras habla, hace lo que tenga en su columna (andar, gesto…) en vez del gesto de hablar</label>
        </>
      )}
      {kind === "off" && (
        <>
          <Field label="Quién habla (fuera de cuadro)" hint="«Anastas-IA» hace salir su tele; un nombre de la serie usa su voz.">
            <input list="g-names" value={str(st.off)} onChange={(e) => field("off", e.target.value)} />
            <datalist id="g-names">{["Anastas-IA", ...allNames].map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          {text()}
          {num("pausa_despues", "Pausa después (s)")}
        </>
      )}
      {kind === "narrador" && text("narrador", "Texto del narrador")}
      {kind === "coro" && (
        <>
          <Field label="Quiénes">
            <div className="chips">
              {cast.map((c) => {
                const on = Array.isArray(st.coro) && st.coro.includes(c);
                return <button key={c} type="button" className={`chip${on ? " on" : ""}`} onClick={() => set((x) => { const a = (Array.isArray(x.coro) ? x.coro : []) as string[]; x.coro = on ? a.filter((y) => y !== c) : [...a, c]; })}>{c}</button>;
              })}
            </div>
          </Field>
          {text()}
        </>
      )}
      {kind === "gesto" && (
        <>
          {who("quien")}
          <Gestures cid={resolveCharacter(st.quien, catalog)} vista={vista} catalog={catalog} cats={cats} value={str(st.gesto)} onChange={(g) => field("gesto", g || "neutro")} label="Gesto" />
          <p className="fine">Las posturas (sentado, tumbado, brazos cruzados, con el móvil…) se quedan; los demás gestos vuelven al reposo tras la siguiente frase.</p>
        </>
      )}
      {kind === "cara" && (
        <>
          {who("cara")}
          <Field label="Emoción">
            <select value={str(st.emocion)} onChange={(e) => field("emocion", e.target.value)}>
              {EMOTIONS.filter(Boolean).map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </Field>
        </>
      )}
      {kind === "mira" && (<>{who("mira", "Quién mira")}{who("a", "A quién")}{num("durante", "Durante (s)")}</>)}
      {kind === "efecto" && (
        <>
          <Field label="Efecto">
            <select value={normKey(str(st.efecto))} onChange={(e) => field("efecto", e.target.value)}>
              {!EFFECTS.some(([k]) => k === normKey(str(st.efecto))) && <option value={str(st.efecto)}>{str(st.efecto)}</option>}
              {EFFECTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          {!["pantallazo", "destello", "temblor", "oscuro"].includes(normKey(str(st.efecto))) && (
            <Field label="Sobre quién">
              <select value={str(st.donde)} onChange={(e) => field("donde", e.target.value)}>
                <option value="">— en el centro —</option>
                {[...cast, "Anastas-IA"].map((c) => <option key={c} value={c}>{c === "Anastas-IA" ? "Anastas-IA (su tele)" : c}</option>)}
              </select>
            </Field>
          )}
          {["onomatopeya", "explosion", "pantallazo", "titulo"].includes(normKey(str(st.efecto))) && (
            <Field label="Texto del efecto"><input value={str(st.texto)} maxLength={60} onChange={(e) => field("texto", e.target.value)} /></Field>
          )}
          {normKey(str(st.efecto)) === "destello" && (
            <Field label="Color"><input type="color" value={/^#[0-9a-f]{6}$/i.test(str(st.color)) ? str(st.color) : "#ffffff"} onChange={(e) => field("color", e.target.value)} /></Field>
          )}
          {num("durante", "Durante (s)", 0.1, "Vacío = lo normal de ese efecto.")}
        </>
      )}
      {kind === "pausa" && num("pausa", "Silencio (s)", 0.1, "Hasta 5 s. Las pausas dan ritmo: el chiste suele ir después de una.")}
      {kind === "sonido" && (
        <Field label="Sonido">
          <select value={str(st.sonido)} onChange={(e) => field("sonido", e.target.value)}>
            {[...new Set([str(st.sonido), ...SOUNDS, ...(catalog.sounds ?? []).map((x) => x.id)])].filter(Boolean).map((x) => <option key={x} value={x}>{x.replace(/^sfx_/, "")}</option>)}
          </select>
        </Field>
      )}
      {kind === "objeto" && <PropProps st={st} catalog={catalog} field={field} />}
      {kind === "rotulo" && (<>{text("rotulo", "Rótulo", 200)}{num("durante", "Durante (s)")}</>)}
      {kind === "camara" && (
        <>
          <Field label="Plano">
            <select value={normKey(str(st.camara))} onChange={(e) => field("camara", e.target.value)}>
              <option value="general">General</option>
              <option value="medio">Medio</option>
              <option value="primer_plano">Primer plano</option>
              <option value="punto">Un punto concreto (x, y, zoom)</option>
            </select>
          </Field>
          {normKey(str(st.camara)) === "punto" && (
            <div className="g-grid2">
              {num("x", "x (0–1080)", 10)}
              {num("y", "y (0–1920)", 10)}
              {num("zoom", "Zoom", 0.1)}
              {num("durante", "Durante (s)", 0.1)}
            </div>
          )}
          {!["general", "punto"].includes(normKey(str(st.camara))) && (
            <Field label="De quién">
              <select value={str(st.quien)} onChange={(e) => field("quien", e.target.value)}>
                <option value="">—</option>
                {cast.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <label className="g-check"><input type="checkbox" checked={!!st.mover} onChange={(e) => field("mover", e.target.checked || undefined)} /> Movimiento suave (travelling)</label>
        </>
      )}
      {(kind === "entra" || kind === "sale" || kind === "huye" || kind === "teclea") && who(kind)}
      {kind === "huye" && (
        <Field label="Hacia">
          <select value={str(st.hacia)} onChange={(e) => field("hacia", e.target.value)}>
            <option value="">— el lado más cercano —</option>
            <option value="izquierda">Izquierda</option>
            <option value="derecha">Derecha</option>
          </select>
        </Field>
      )}
      {kind === "teclea" && num("durante", "Durante (s)")}
      {kind === "tiembla" && who(st.salta !== undefined ? "salta" : "tiembla")}
      {kind === "empuja" && (<>{who("empuja", "Quién empuja")}{who("a", "A quién")}</>)}
      <RawJson st={st} set={set} open={!kind} />
    </div>
  );
}

/** Selector de gesto con miniaturas de las poses del personaje. */
function Gestures({ cid, vista, catalog, value, onChange, label, cats }: { cid?: string; vista: string; catalog: Catalog; value: string; onChange: (g: string) => void; label: string; cats: PoseCategoryMap }) {
  const [filter, setFilter] = useState<string[]>([]);
  const ch = cid ? catalog.characters.find((c) => c.id === cid) : undefined;
  if (!ch) return null;
  const pf = posePrefix(ch.id, vista, catalog);
  const all = ch.poses.filter((p) => p.key.startsWith(`pose_${pf}_`) && (!p.archived || normKey(value) === p.key.replace(`pose_${pf}_`, "")));
  if (!all.length) return null;
  const poses = filterPoses(all, cats, filter);
  return (
    <Field label={label}>
      <CategoryFilter poses={all} cats={cats} value={filter} onChange={setFilter} />
      <div className="g-poses">
        <button type="button" className={`g-pose${!value ? " on" : ""}`} onClick={() => onChange("")}><span className="g-pose-none">—</span><small>ninguno</small></button>
        {poses.map((p) => {
          const g = p.key.replace(`pose_${pf}_`, "");
          return (
            <button key={p.id} type="button" className={`g-pose${normKey(value) === g ? " on" : ""}`} onClick={() => onChange(g)} title={g}>
              <img src={p.src} alt="" loading="lazy" />
              <small>{p.talkSrc && p.talkSrc !== p.src ? "👄 " : ""}{g.replace(/_/g, " ")}</small>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function PropProps({ st, catalog, field }: { st: Obj; catalog: Catalog; field: (k: string, v: unknown) => void }) {
  const [q, setQ] = useState("");
  const list = catalog.props.filter((p) => !/_espaldas_|^prop_anastasia_tv|_c\d$/.test(p.id) && (!q || normKey(`${p.id} ${p.label}`).includes(normKey(q))));
  const placed = typeof st.x === "number" && typeof st.y === "number";
  return (
    <>
      <Field label="Objeto">
        <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="g-poses g-props-grid">
          {list.slice(0, 60).map((p) => (
            <button key={p.id} type="button" className={`g-pose${st.objeto === p.id ? " on" : ""}`} onClick={() => field("objeto", p.id)} title={p.id}>
              <img src={p.src} alt="" loading="lazy" />
              <small>{p.label}</small>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Dónde">
        <select value={placed ? "mano" : str(st.donde) || "centro"} onChange={(e) => { const v = e.target.value; if (v === "mano") { field("x", 540); field("y", 1400); } else { field("x", undefined); field("y", undefined); field("donde", v); } }}>
          <option value="izquierda">Aparece a la izquierda</option>
          <option value="centro">Aparece en el centro</option>
          <option value="derecha">Aparece a la derecha</option>
          <option value="mano">Colocado a mano (parte del decorado)</option>
        </select>
      </Field>
      {placed && (
        <div className="g-grid2">
          <Field label="x (0–1080)"><input type="number" step={10} value={st.x as number} onChange={(e) => field("x", Number(e.target.value))} /></Field>
          <Field label="y (base, 0–1920)"><input type="number" step={10} value={st.y as number} onChange={(e) => field("y", Number(e.target.value))} /></Field>
          <Field label="Escala"><input type="number" step={0.05} value={typeof st.escala === "number" ? st.escala : 1} onChange={(e) => field("escala", Number(e.target.value))} /></Field>
          <Field label="Capa">
            <select value={str(st.capa)} onChange={(e) => field("capa", e.target.value)}>
              <option value="">Delante</option>
              <option value="detras">Detrás de los personajes</option>
            </select>
          </Field>
        </div>
      )}
      <Field label="Animación">
        <select value={str(st.anim)} onChange={(e) => field("anim", e.target.value)}>
          <option value="">Quieto</option>
          <option value="flota">Flota</option>
          <option value="vibra">Vibra</option>
          <option value="late">Late</option>
          <option value="gira">Gira</option>
          <option value="parpadea">Parpadea</option>
        </select>
      </Field>
      <Field label="Durante (s)" hint="Vacío = hasta el final de la escena.">
        <input type="number" step={0.5} value={typeof st.durante === "number" ? st.durante : ""} onChange={(e) => field("durante", e.target.value === "" ? undefined : Number(e.target.value))} />
      </Field>
    </>
  );
}

/** Edición directa (para lo que no tiene formulario). */
function RawJson({ st, set, open }: { st: Obj; set: (fn: (st: Obj) => void) => void; open: boolean }) {
  const [txt, setTxt] = useState(() => JSON.stringify(st, null, 1));
  const [err, setErr] = useState(false);
  useEffect(() => setTxt(JSON.stringify(st, null, 1)), [st]);
  return (
    <details className="g-raw" open={open}>
      <summary>Texto del paso (avanzado)</summary>
      <textarea
        rows={5}
        value={txt}
        spellCheck={false}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => {
          try {
            const v = JSON.parse(txt) as unknown;
            if (!isObj(v)) throw new Error();
            setErr(false);
            set((x) => { for (const k of Object.keys(x)) delete x[k]; Object.assign(x, v); });
          } catch {
            setErr(true);
          }
        }}
      />
      {err && <p className="error-text">No es un texto válido; no se ha aplicado.</p>}
    </details>
  );
}

// ---------------------------------------------------------------- acción de la columna de un personaje
function ActionProps({ a, steps, vista, catalog, cats, set, anims, pickAnim }: { a: Obj; steps: Obj[]; vista: string; catalog: Catalog; cats: PoseCategoryMap; set: (fn: (a: Obj) => void) => void; anims: Animation[]; pickAnim: (a: Animation | null) => void }) {
  const field = (key: string, v: unknown) => set((x) => { if (v === "" || v === undefined || (typeof v === "number" && !Number.isFinite(v))) delete x[key]; else x[key] = v; });
  const cid = resolveCharacter(a.quien, catalog);
  const d0 = Number(a.desde) || 0;
  const d1 = typeof a.hasta === "number" ? a.hasta : d0;
  const moves = typeof a.x === "number" || typeof a.y === "number";
  const stepOpt = (k: number) => {
    const st = steps[k];
    const t = isObj(st) ? (str(st.texto) || str(st.rotulo) || str(st.efecto) || kindOf(st)?.label || "") : "";
    return `${k + 1}. ${isObj(st) ? (str(st.dice) || str(st.off) || "") + (str(st.dice) || str(st.off) ? ": " : "") : ""}${t}`.slice(0, 50);
  };
  return (
    <div className="g-form">
      <div className="g-grid2">
        <Field label="Desde el paso">
          <select value={d0} onChange={(e) => { const v = Number(e.target.value); set((x) => { x.desde = v; if ((typeof x.hasta === "number" ? x.hasta : v) < v) x.hasta = v; }); }}>
            {steps.map((_, k) => <option key={k} value={k}>{stepOpt(k)}</option>)}
          </select>
        </Field>
        <Field label="Hasta el paso">
          <select value={d1} onChange={(e) => field("hasta", Number(e.target.value))}>
            {steps.map((_, k) => (k >= d0 ? <option key={k} value={k}>{stepOpt(k)}</option> : null))}
          </select>
        </Field>
      </div>
      <Field label="Animación" hint={anims.length ? undefined : "Este personaje aún no tiene animaciones: créalas en la pestaña 🎞 Animación."}>
        <select value={str(a.animacion)} onChange={(e) => pickAnim(anims.find((x) => x.nombre === e.target.value) ?? null)}>
          <option value="">— ninguna (usa la pose de abajo) —</option>
          {!anims.some((x) => x.nombre === str(a.animacion)) && a.animacion ? <option value={str(a.animacion)}>{str(a.animacion)} (no encontrada)</option> : null}
          {anims.map((x) => <option key={x.nombre} value={x.nombre}>🎞 {x.nombre}{x.bucle ? " (en bucle)" : ""}</option>)}
        </select>
      </Field>
      {!a.animacion && <Gestures cid={cid} vista={vista} catalog={catalog} cats={cats} value={str(a.gesto)} onChange={(g) => field("gesto", g)} label="Qué hace (pose)" />}
      <label className="g-check">
        <input type="checkbox" checked={moves} onChange={(e) => set((x) => { if (e.target.checked) { x.x = 540; x.modo = "anda"; } else { delete x.x; delete x.y; delete x.modo; } })} /> Cambia de sitio
      </label>
      {moves && (
        <>
          <p className="fine">✋ Arrastra al personaje en la vista previa hasta donde tiene que llegar.</p>
          <Field label="Cómo llega">
            <select value={norm3(str(a.modo))} onChange={(e) => field("modo", e.target.value)}>
              <option value="anda">Andando</option>
              <option value="desliza">Deslizándose (sin andar)</option>
              <option value="aparece">Aparece allí de golpe</option>
            </select>
          </Field>
          <div className="g-grid2">
            <Field label="x (0–1080)"><input type="number" step={10} value={typeof a.x === "number" ? a.x : ""} onChange={(e) => field("x", e.target.value === "" ? undefined : Number(e.target.value))} /></Field>
            <Field label="y (pies, 0–1920)"><input type="number" step={10} value={typeof a.y === "number" ? a.y : ""} placeholder="igual" onChange={(e) => field("y", e.target.value === "" ? undefined : Number(e.target.value))} /></Field>
          </div>
        </>
      )}
      <Gestures cid={cid} vista={vista} catalog={catalog} cats={cats} value={str(a.acaba)} onChange={(g) => field("acaba", g)} label="Al acabar se queda en… (ninguno = vuelve a su postura)" />
      <p className="fine">Mientras dura, el personaje lo hace aunque hablen otros. En sus propias frases manda su gesto de hablar, salvo que la frase tenga marcado «hace lo que tenga en su columna».</p>
    </div>
  );
}
const norm3 = (v: string) => (normKey(v).startsWith("apare") ? "aparece" : normKey(v).startsWith("desliz") ? "desliza" : "anda");

// ---------------------------------------------------------------- propiedades de la escena
function SceneProps({ sc, catalog, set }: { sc: Obj; catalog: Catalog; set: (fn: (x: Obj) => void) => void }) {
  const field = (key: string, v: unknown) => set((x) => { if (v === "" || v === undefined) delete x[key]; else x[key] = v; });
  const cast = (Array.isArray(sc.personajes) ? sc.personajes : []).filter((x): x is string => typeof x === "string");
  const castIds = cast.map((c) => resolveCharacter(c, catalog));
  const chars = catalog.characters.filter((c) => c.poses.some((p) => /^pose_[hp]_neutro$/.test(p.key)));
  const bgs = catalog.backgrounds;
  return (
    <div className="g-form">
      <Field label="Nombre"><input value={str(sc.nombre)} maxLength={120} onChange={(e) => field("nombre", e.target.value)} /></Field>
      <Field label="Lugar">
        <div className="g-poses g-bgs">
          {bgs.map((b) => (
            <button key={b.id} type="button" className={`g-pose${sc.lugar === b.id ? " on" : ""}`} onClick={() => field("lugar", b.id)} title={b.id}>
              <img src={b.src} alt="" loading="lazy" />
              <small>{b.label}</small>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Quién sale (en orden, de izquierda a derecha)">
        <div className="chips">
          {chars.map((c) => {
            const on = castIds.includes(c.id);
            return (
              <button key={c.id} type="button" className={`chip${on ? " on" : ""}`} onClick={() => set((x) => { const a = ((Array.isArray(x.personajes) ? x.personajes : []) as string[]); x.personajes = on ? a.filter((y) => resolveCharacter(y, catalog) !== c.id) : [...a, c.name]; })}>
                {c.name}
              </button>
            );
          })}
        </div>
      </Field>
      <div className="g-grid2">
        <Field label="Aspecto">
          <select value={normKey(str(sc.vista)).startsWith("human") ? "humanos" : "punetos"} onChange={(e) => field("vista", e.target.value === "humanos" ? "humanos" : "puñetos")}>
            <option value="punetos">Puñetos</option>
            <option value="humanos">Humanos</option>
          </select>
        </Field>
        <Field label="Paso a la siguiente">
          <select value={normKey(str(sc.transicion)).startsWith("corte") ? "corte" : normKey(str(sc.transicion)).startsWith("blanc") ? "blanco" : ""} onChange={(e) => field("transicion", e.target.value)}>
            <option value="">Fundido a negro</option>
            <option value="corte">Corte seco</option>
            <option value="blanco">Fundido a blanco</option>
          </select>
        </Field>
        <Field label="Ambiente">
          <select value={str(sc.ambiente)} onChange={(e) => field("ambiente", e.target.value)}>
            <option value="">El del lugar</option>
            <option value="oficina">Oficina</option>
            <option value="recepcion">Recepción</option>
            <option value="cafeteria">Cafetería</option>
            <option value="pajaros">Exterior · pájaros</option>
            <option value="pajaros2">Exterior · pájaros (otra toma)</option>
            <option value="no">Sin ambiente</option>
          </select>
        </Field>
        <Field label="Volumen del ambiente">
          <input type="range" min={0} max={1} step={0.05} value={typeof sc.ambiente_volumen === "number" ? sc.ambiente_volumen : 0.25} onChange={(e) => field("ambiente_volumen", Number(e.target.value))} />
        </Field>
        <Field label="Escala del reparto"><input type="number" step={0.05} value={typeof sc.escala === "number" ? sc.escala : ""} placeholder="1" onChange={(e) => field("escala", e.target.value === "" ? undefined : Number(e.target.value))} /></Field>
      </div>
      <label className="g-check"><input type="checkbox" checked={normKey(str(sc.camara)) === "auto"} onChange={(e) => field("camara", e.target.checked ? "auto" : undefined)} /> Cámara automática (se acerca a quien habla)</label>
      <RawSceneExtras sc={sc} set={set} />
    </div>
  );
}

/** «colocar», «tumbados», «pantalla»: a mano, en texto. */
function RawSceneExtras({ sc, set }: { sc: Obj; set: (fn: (x: Obj) => void) => void }) {
  const extras = Object.fromEntries(["colocar", "tumbados", "pantalla"].filter((k) => sc[k] !== undefined).map((k) => [k, sc[k]]));
  const [txt, setTxt] = useState(() => JSON.stringify(extras, null, 1));
  const [err, setErr] = useState(false);
  const [ok, setOk] = useState(false);
  // se aplica en cuanto el texto es válido (en el móvil, tocar una pestaña no siempre quita el foco del cuadro)
  const apply = (t: string, showErr: boolean) => {
    try {
      const v = JSON.parse(t || "{}") as unknown;
      if (!isObj(v)) throw new Error();
      setErr(false);
      setOk(true);
      set((x) => { for (const k of ["colocar", "tumbados", "pantalla"]) { if (v[k] === undefined) delete x[k]; else x[k] = v[k]; } });
    } catch {
      setOk(false);
      if (showErr) setErr(true);
    }
  };
  return (
    <details className="g-raw">
      <summary>Colocación a mano (avanzado)</summary>
      <p className="fine">Posición, postura inicial o quién está tumbado: {"{ \"colocar\": { \"Usu\": { \"x\": 300, \"gesto\": \"sentado_habla\" } } }"}</p>
      <textarea
        rows={6}
        value={txt}
        spellCheck={false}
        onChange={(e) => { setTxt(e.target.value); setErr(false); apply(e.target.value, false); }}
        onBlur={() => apply(txt, true)}
      />
      <div className="row">
        <button type="button" className="btn btn-small btn-secondary" onClick={() => apply(txt, true)}>✓ Aplicar</button>
        {ok && !err && <span className="fine">Aplicado y guardado.</span>}
      </div>
      {err && <p className="error-text">No es un texto válido; no se ha aplicado.</p>}
    </details>
  );
}
