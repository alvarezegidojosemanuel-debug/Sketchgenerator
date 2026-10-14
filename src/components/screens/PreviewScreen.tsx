"use client";

import { useEffect, useState } from "react";
import { projectSchedule } from "@/lib/timeline/evaluate";
import { ttsSupported } from "@/lib/tts";
import { Stage } from "../Stage";
import { usePlayer } from "../usePlayer";
import type { PocketState } from "../usePocket";
import { IssueList } from "../ui";

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export function PreviewScreen({ s }: { s: PocketState }) {
  const { project, catalog } = s;
  const [voice, setVoice] = useState(true);
  const [subs, setSubs] = useState(true);
  const [hasTts, setHasTts] = useState(true);
  useEffect(() => setHasTts(ttsSupported()), []);
  const pl = usePlayer(project, catalog, { voice: voice && hasTts });
  const { slots } = projectSchedule(project);
  const take = project.takes[pl.pos.takeIndex];

  return (
    <div className="screen screen-stage">
      <div className="title-row">
        <h1>{project.metadata.title}</h1>
        <span className="muted">
          Toma {pl.pos.takeIndex + 1}/{project.takes.length}
          {take?.name ? ` · ${take.name}` : ""}
        </span>
      </div>
      {s.issues.length > 0 && <IssueList errors={s.issues} max={3} />}
      <Stage catalog={catalog} frame={pl.frame} showSubtitles={subs} />
      <div className="transport">
        <button type="button" className="btn btn-round btn-primary" onClick={pl.playing ? pl.pause : pl.play} aria-label={pl.playing ? "Pausar" : "Reproducir"}>
          {pl.playing ? "❚❚" : "▶"}
        </button>
        <button type="button" className="btn btn-round" onClick={pl.stop} aria-label="Detener">
          ■
        </button>
        <div className="scrub">
          <input type="range" min={0} max={pl.total} step={0.05} value={pl.pos.global} onChange={(e) => pl.seek(Number(e.target.value))} aria-label="Posición" />
          <div className="ticks">
            {slots.slice(1).map((sl) => (
              <span key={sl.index} style={{ left: `${(sl.offset / pl.total) * 100}%` }} />
            ))}
          </div>
          <span className="time">
            {fmt(pl.pos.global)} / {fmt(pl.total)}
          </span>
        </div>
      </div>
      {pl.holding && <p className="fine">⏸ Esperando a que termine la voz (el diálogo manda)…</p>}
      <div className="row">
        <label className="switch">
          <input type="checkbox" checked={voice} disabled={!hasTts} onChange={(e) => setVoice(e.target.checked)} />
          <span>Voces del navegador</span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} />
          <span>Subtítulos</span>
        </label>
      </div>
      <p className="fine">
        {hasTts ? "Con voces, el diálogo manda: si una frase dura más que su bloque, la escena espera a que termine y la boca se mueve solo mientras suena. Las voces dependen del dispositivo; no se genera audio exportable." : "Este navegador no ofrece síntesis de voz: se muestran solo subtítulos."}
      </p>
      <button type="button" className="btn btn-secondary btn-block" onClick={() => s.setTab("editar")}>
        ✎ Editar este sketch
      </button>
    </div>
  );
}
