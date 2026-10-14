"use client";

import { useRef, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import { findCharacter } from "@/lib/catalog";
import type { PocketEvent, Take, Track } from "@/lib/schema/pocket";

const LANES: { track: Track; label: string }[] = [
  { track: "dialogue", label: "Diálogo" },
  { track: "body", label: "Cuerpo" },
  { track: "face", label: "Cara" },
  { track: "mouth", label: "Boca" },
  { track: "eyes", label: "Ojos" },
];

interface Props {
  take: Take;
  catalog: Catalog;
  t: number;
  selectedId: string | null;
  onSeek: (t: number) => void;
  onSelect: (id: string, actorUid?: string) => void;
  /** Mover / redimensionar un bloque (valores ya ajustados a la toma). */
  onRetime: (id: string, start: number, duration: number) => void;
  summary: (e: PocketEvent) => string;
}

const LABEL_W = 92;
const ROW_H = 30;
const r2 = (n: number) => Math.round(n * 20) / 20; // ajuste a 0,05 s

/** Línea de tiempo por capas: una fila por personaje y pista, bloques arrastrables (estilo PUÑETOS STUDIO). */
export function TimelineLanes({ take, catalog, t, selectedId, onSeek, onSelect, onRetime, summary }: Props) {
  const [pps, setPps] = useState(60); // píxeles por segundo (zoom)
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "resize"; x0: number; start: number; dur: number; moved: boolean } | null>(null);
  const W = Math.max(take.duration * pps, 200);

  const rows: { key: string; label: string; header?: boolean; events: PocketEvent[]; actorUid?: string }[] = [];
  const propsEvents = take.events.filter((e) => e.track === "props");
  rows.push({ key: "props", label: "Objetos", events: propsEvents });
  for (const a of [...take.actors].sort((x, y) => y.zIndex - x.zIndex)) {
    const name = findCharacter(catalog, a.characterId)?.name ?? a.characterId;
    rows.push({ key: `h_${a.uid}`, label: name, header: true, events: [], actorUid: a.uid });
    for (const l of LANES) {
      rows.push({ key: `${a.uid}_${l.track}`, label: l.label, events: take.events.filter((e) => e.actorUid === a.uid && e.track === l.track), actorUid: a.uid });
    }
  }

  const timeAt = (clientX: number) => {
    const el = area.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(take.duration, (clientX - r.left + el.scrollLeft - LABEL_W) / pps));
  };

  const onBarDown = (e: PocketEvent, mode: "move" | "resize") => (ev: React.PointerEvent) => {
    ev.stopPropagation();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    drag.current = { id: e.id, mode, x0: ev.clientX, start: e.start, dur: e.duration, moved: false };
    onSelect(e.id, e.actorUid);
  };
  const onBarMove = (ev: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = (ev.clientX - d.x0) / pps;
    if (Math.abs(ev.clientX - d.x0) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.mode === "move") {
      const start = r2(Math.max(0, Math.min(take.duration - d.dur, d.start + dt)));
      onRetime(d.id, start, d.dur);
    } else {
      const dur = r2(Math.max(0.1, Math.min(take.duration - d.start, d.dur + dt)));
      onRetime(d.id, d.start, dur);
    }
  };
  const onBarUp = () => {
    drag.current = null;
  };

  const ticks = [];
  const step = pps >= 80 ? 0.5 : pps >= 40 ? 1 : 2;
  for (let s = 0; s <= take.duration + 1e-6; s += step) ticks.push(Math.round(s * 100) / 100);

  return (
    <div className="tl">
      <div className="tl-toolbar">
        <span className="fine">Zoom</span>
        <input type="range" min={20} max={160} step={10} value={pps} onChange={(e) => setPps(Number(e.target.value))} aria-label="Zoom de la línea de tiempo" />
        <span className="fine">{t.toFixed(2)} s</span>
      </div>
      <div className="tl-scroll" ref={area}>
        <div className="tl-inner" style={{ width: W + LABEL_W }}>
          <div className="tl-row tl-ruler" onPointerDown={(e) => onSeek(timeAt(e.clientX))} onPointerMove={(e) => e.buttons && onSeek(timeAt(e.clientX))}>
            <div className="tl-label" />
            <div className="tl-lane">
              {ticks.map((s) => (
                <span key={s} className="tl-tick" style={{ left: s * pps }}>
                  {Number.isInteger(s) ? `${s}s` : ""}
                </span>
              ))}
            </div>
          </div>
          {rows.map((row) => (
            <div key={row.key} className={`tl-row${row.header ? " tl-head" : ""}`} style={{ height: row.header ? 22 : ROW_H }}>
              <div className="tl-label">{row.label}</div>
              <div className="tl-lane" onPointerDown={(e) => !row.header && onSeek(timeAt(e.clientX))}>
                {row.events.map((e) => (
                  <div
                    key={e.id}
                    className={`tl-bar track-${e.track}${e.id === selectedId ? " sel" : ""}`}
                    style={{ left: e.start * pps, width: Math.max(10, e.duration * pps) }}
                    onPointerDown={onBarDown(e, "move")}
                    onPointerMove={onBarMove}
                    onPointerUp={onBarUp}
                    onPointerCancel={onBarUp}
                    title={summary(e)}
                  >
                    <span className="tl-text">{summary(e)}</span>
                    <span className="tl-handle" onPointerDown={onBarDown(e, "resize")} onPointerMove={onBarMove} onPointerUp={onBarUp} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="tl-playhead" style={{ left: LABEL_W + t * pps }} />
        </div>
      </div>
      <p className="fine">Toca un bloque para editarlo · arrástralo para moverlo · arrastra su borde derecho para cambiar la duración · toca la regla para mover el cabezal.</p>
    </div>
  );
}
