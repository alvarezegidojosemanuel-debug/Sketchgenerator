"use client";

import { useMemo, useRef, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import type { Take } from "@/lib/schema/pocket";
import { compileScript } from "@/lib/script/compile";
import { placementToScript } from "@/lib/script/placement";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { Stage } from "./Stage";

type Obj = Record<string, unknown>;

/**
 * Colocar a los personajes de una escena con el dedo (pantalla completa): arrastrar para mover, pellizcar con dos
 * dedos para el tamaño, y botones para girar y poner delante/detrás. «Listo» lo guarda en el «colocar» del guion.
 */
export function PlaceMode({ script, sceneIndex, catalog, onApply, onClose }: { script: Obj; sceneIndex: number; catalog: Catalog; onApply: (next: Obj) => void; onClose: () => void }) {
  const built = useMemo(() => {
    const { project, marks } = compileScript(script, catalog);
    const ti = marks[sceneIndex]?.take;
    return ti !== undefined && project?.takes[ti] ? { take: project.takes[ti], ti } : null;
  }, [script, sceneIndex, catalog]);
  const [take, setTake] = useState<Take | null>(() => (built ? structuredClone(built.take) : null));
  const [sel, setSel] = useState<string | null>(() => built?.take.actors[0]?.uid ?? null);
  const scale0 = useRef(1);
  // vista de colocación: el arranque de la escena en plano general (sin movimientos de cámara)
  const frame = useMemo(() => (take ? evaluateTake({ ...take, camera: undefined, events: take.events.filter((e) => e.track !== "camera") }, catalog, 0.05) : null), [take, catalog]);

  if (!built || !take || !frame) {
    return (
      <div className="place-mode">
        <p className="fine">Esta escena no tiene personajes que colocar.</p>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
      </div>
    );
  }
  const edit = (fn: (tk: Take) => void) => setTake((t) => { if (!t) return t; const n = structuredClone(t); fn(n); return n; });
  const actor = take.actors.find((a) => a.uid === sel);
  const name = (uid: string) => catalog.characters.find((c) => c.id === take.actors.find((a) => a.uid === uid)?.characterId)?.name ?? uid;

  // mover: se desplaza todo su recorrido (quien entra andando desde fuera sigue entrando)
  const move = (uid: string, x: number, y: number) => {
    const now = frame.actors.find((a) => a.uid === uid);
    const dx = now ? x - now.x : 0;
    const dy = now ? y - now.y : 0;
    edit((tk) => {
      const a = tk.actors.find((q) => q.uid === uid);
      if (!a) return;
      a.x = Math.round(a.x + dx);
      a.y = Math.round(a.y + dy);
      for (const e of tk.events) {
        if (e.track !== "body" || e.actorUid !== uid) continue;
        if (e.x !== undefined) e.x = Math.round(e.x + dx);
        if (e.y !== undefined) e.y = Math.round(e.y + dy);
      }
    });
  };
  const resize = (uid: string, factor: number, phase: "start" | "move") => {
    const a = take.actors.find((q) => q.uid === uid);
    if (!a) return;
    if (phase === "start") scale0.current = a.scale;
    const v = Math.max(0.15, Math.min(6, scale0.current * factor));
    edit((tk) => { const q = tk.actors.find((x) => x.uid === uid); if (q) q.scale = Math.round(v * 1000) / 1000; });
  };
  const bump = (k: number) => actor && edit((tk) => { const q = tk.actors.find((x) => x.uid === actor.uid); if (q) q.scale = Math.round(Math.max(0.15, Math.min(6, q.scale * k)) * 1000) / 1000; });
  const zs = take.actors.map((a) => a.zIndex);
  const front = () => actor && edit((tk) => { const q = tk.actors.find((x) => x.uid === actor.uid); if (q) q.zIndex = Math.min(100, Math.max(...zs) + 1); });
  const back = () => actor && edit((tk) => { const q = tk.actors.find((x) => x.uid === actor.uid); if (q) q.zIndex = Math.max(-100, Math.min(...zs) - 1); });
  const flip = () => actor && edit((tk) => { const q = tk.actors.find((x) => x.uid === actor.uid); if (q) q.flip = !q.flip; });
  const done = () => {
    const next = placementToScript(script, built.ti, take, catalog);
    if (next) onApply(next);
    onClose();
  };

  return (
    <div className="place-mode" role="dialog" aria-label="Colocar personajes">
      <div className="place-top">
        <button type="button" className="btn btn-small btn-ghost" onClick={onClose}>Cancelar</button>
        <b>📍 Colocar</b>
        <button type="button" className="btn btn-small btn-primary" onClick={done}>✓ Listo</button>
      </div>
      <div className="place-stage">
        <Stage catalog={catalog} frame={frame} showSubtitles={false} selectedUid={sel ?? undefined} onSelectActor={setSel} onMoveActor={move} onScaleActor={resize} maxHeight="calc(100dvh - 230px)" />
      </div>
      <div className="place-who">
        {take.actors.map((a) => (
          <button key={a.uid} type="button" className={`chip${a.uid === sel ? " on" : ""}`} onClick={() => setSel(a.uid)}>{name(a.uid)}</button>
        ))}
      </div>
      {actor && (
        <div className="place-tools">
          <button type="button" className="btn btn-secondary" onClick={() => bump(1 / 1.1)} aria-label="Más pequeño">－</button>
          <button type="button" className="btn btn-secondary" onClick={() => bump(1.1)} aria-label="Más grande">＋</button>
          <button type="button" className="btn btn-secondary" onClick={flip}>↔ Girar</button>
          <button type="button" className="btn btn-secondary" onClick={front}>⬆ Delante</button>
          <button type="button" className="btn btn-secondary" onClick={back}>⬇ Detrás</button>
        </div>
      )}
      <p className="fine place-hint">Arrastra con un dedo · pellizca con dos para cambiar el tamaño · los que entran más tarde salen como fantasma</p>
    </div>
  );
}
