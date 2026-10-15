"use client";

import { useState } from "react";
import { findCharacter } from "@/lib/catalog";
import { castFor, castIds, findPiperVoice, NARRATOR_ID, speakerCharacterId, PIPER_VOICES, type CastEntry } from "@/lib/voice/catalog";
import { previewVoice, type Progress } from "@/lib/voice/piper";
import type { PocketState } from "./usePocket";
import { Card, Field, Stepper } from "./ui";

/** Reparto de voces del proyecto: voz, tono y velocidad por personaje (motor Piper). */
export function VoiceCast({ s }: { s: PocketState }) {
  const { project, catalog, editProject } = s;
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chars = castIds(project);
  const cast = project.metadata.voices;

  const set = (cid: string, patch: Partial<CastEntry>) =>
    editProject((p) => {
      const cur = castFor(cid, p.metadata.voices);
      p.metadata.voices = { ...(p.metadata.voices ?? {}), [cid]: { ...cur, ...patch } };
    });

  const sampleLine = (cid: string) =>
    project.takes.flatMap((t) => t.events.filter((e) => e.track === "dialogue" && speakerCharacterId(t, e.actorUid, (e as { voiceOf?: string }).voiceOf) === cid)).map((e) => (e as { text: string }).text)[0] ??
    "Hola, soy yo. ¿Qué tal suena mi voz?";

  const test = async (cid: string) => {
    setBusy(cid);
    setError(null);
    try {
      await previewVoice(sampleLine(cid), cid, cast, setProgress);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <Card title="Reparto de voces">
      <p className="fine">Voces neuronales gratuitas que se generan en tu dispositivo. Cada voz se descarga una vez (25–110 MB) y queda guardada.</p>
      {chars.map((cid) => {
        const c = castFor(cid, cast);
        const v = findPiperVoice(c.voiceId);
        return (
          <div key={cid} className="cast-row">
            <div className="cast-head">
              <b>{cid === NARRATOR_ID ? "Narrador (voz en off)" : findCharacter(catalog, cid)?.name ?? cid}</b>
              <button type="button" className="btn btn-small btn-secondary" disabled={busy !== null} onClick={() => test(cid)}>
                {busy === cid ? "…" : "▶ Probar"}
              </button>
            </div>
            <div className="grid2">
              <Field label="Voz">
                <select
                  value={c.voiceId}
                  onChange={(e) => {
                    const nv = findPiperVoice(e.target.value);
                    set(cid, { voiceId: e.target.value, speaker: nv?.speakers ? Object.values(nv.speakers)[0] : undefined });
                  }}
                >
                  {PIPER_VOICES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label} · {x.accent}
                    </option>
                  ))}
                </select>
              </Field>
              {v?.speakers ? (
                <Field label="Hablante">
                  <select value={c.speaker ?? 0} onChange={(e) => set(cid, { speaker: Number(e.target.value) })}>
                    {Object.entries(v.speakers).map(([name, id]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Licencia">
                  <span className="fine">{v?.license}</span>
                </Field>
              )}
              <Field label="Tono">
                <Stepper value={c.pitch} step={0.02} min={0.7} max={1.4} onChange={(x) => set(cid, { pitch: x })} />
              </Field>
              <Field label="Velocidad">
                <Stepper value={c.speed} step={0.05} min={0.6} max={1.6} onChange={(x) => set(cid, { speed: x })} />
              </Field>
            </div>
            {v?.attribution && <p className="fine">Licencia {v.license}: cita «{v.attribution}» en la descripción del vídeo.</p>}
          </div>
        );
      })}
      {progress && (
        <div className="progress">
          <div style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
          <span>{progress.label}</span>
        </div>
      )}
      {error && <p className="error-text">No se pudo generar la voz: {error}</p>}
    </Card>
  );
}
