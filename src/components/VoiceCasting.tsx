"use client";

import { useState } from "react";
import { findCharacter } from "@/lib/catalog";
import { castIds, castLabel } from "@/lib/voice/catalog";
import { designVoices, presetFor, saveDesignedVoice, type DesignPreview } from "@/lib/voice/casting";
import { DEFAULT_ELEVEN } from "@/lib/voice/elevenlabs";
import { rememberEleven } from "@/lib/voice/fixedCast";
import type { PocketState } from "./usePocket";
import { Card, Field } from "./ui";

/** Casting a medida: describe cómo suena cada personaje, ElevenLabs crea voces nuevas y eliges la mejor. */
export function VoiceCasting({ s, code, onSaved }: { s: PocketState; code: string; onSaved?: () => void }) {
  const { project, catalog, editProject } = s;
  const ids = castIds(project);
  const [open, setOpen] = useState<string | null>(null);
  const [desc, setDesc] = useState<Record<string, string>>({});
  const [sample, setSample] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, DesignPreview[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const label = (cid: string) => castLabel(cid)?.replace(" (en off)", "").replace(" (voz en off)", "") ?? findCharacter(catalog, cid)?.name ?? cid;

  const create = async (cid: string) => {
    const p = presetFor(cid, label(cid));
    setBusy(cid);
    setError(null);
    try {
      setPreviews((x) => ({ ...x, [cid]: [] }));
      const list = await designVoices(code, desc[cid] ?? p.description, sample[cid] ?? p.sample);
      setPreviews((x) => ({ ...x, [cid]: list }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const choose = async (cid: string, pv: DesignPreview) => {
    setBusy(cid);
    setError(null);
    try {
      const p = presetFor(cid, label(cid));
      const saved = await saveDesignedVoice(code, `Puñetos · ${label(cid)}`, desc[cid] ?? p.description, pv.id);
      editProject((pr) => {
        const cur = pr.metadata.elevenVoices?.[cid];
        const entry = { ...DEFAULT_ELEVEN, ...(cur ?? {}), voiceId: saved.voiceId, name: saved.name };
        pr.metadata.elevenVoices = { ...(pr.metadata.elevenVoices ?? {}), [cid]: entry };
        rememberEleven(cid, entry);
      });
      setDone((x) => ({ ...x, [cid]: saved.name }));
      setPreviews((x) => ({ ...x, [cid]: [] }));
      setOpen(null);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const play = (b64: string) => void new Audio(`data:audio/mpeg;base64,${b64}`).play().catch(() => {});

  return (
    <Card title="🎭 Casting de voces a medida">
      <p className="fine">
        Pocket describe a ElevenLabs cómo es cada personaje y crea <b>voces nuevas solo para él</b>. Escucha las muestras (dicen una frase suya) y elige una: se
        guarda en tu cuenta y queda fija. Cada intento gasta unos 150–250 caracteres. Necesita que la clave tenga permiso de voces (escritura).
      </p>
      {error && <p className="error-text">{error}</p>}
      {ids.map((cid) => {
        const p = presetFor(cid, label(cid));
        const pv = previews[cid] ?? [];
        return (
          <div key={cid} className="cast-row">
            <div className="cast-head">
              <b>{label(cid)}</b>
              {done[cid] && <span className="fine">✓ {done[cid]}</span>}
              <button type="button" className="btn btn-small btn-secondary" onClick={() => setOpen(open === cid ? null : cid)}>
                {open === cid ? "Cerrar" : "🎭 Crear voz a medida"}
              </button>
            </div>
            {open === cid && (
              <>
                <Field label="Cómo suena (puedes retocarlo)">
                  <textarea rows={4} maxLength={1000} value={desc[cid] ?? p.description} onChange={(e) => setDesc((x) => ({ ...x, [cid]: e.target.value }))} />
                </Field>
                <Field label="Frase de prueba (100–1000 caracteres)">
                  <textarea rows={3} maxLength={1000} value={sample[cid] ?? p.sample} onChange={(e) => setSample((x) => ({ ...x, [cid]: e.target.value }))} />
                </Field>
                <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => create(cid)}>
                  {busy === cid && !pv.length ? "Creando voces…" : pv.length ? "↻ Otras 3 voces" : "Crear 3 voces"}
                </button>
                {pv.length > 0 && (
                  <div className="grid2">
                    {pv.map((v, i) => (
                      <div key={v.id} className="row">
                        <button type="button" className="btn btn-small btn-secondary" onClick={() => play(v.audio)}>
                          ▶ Voz {i + 1}
                        </button>
                        <button type="button" className="btn btn-small btn-primary" disabled={busy !== null} onClick={() => choose(cid, v)}>
                          ✓ Elegir
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </Card>
  );
}
