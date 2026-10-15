"use client";

import { castIds, castLabel } from "@/lib/voice/catalog";
import { rememberEleven } from "@/lib/voice/fixedCast";

import { useEffect, useState } from "react";
import { findCharacter } from "@/lib/catalog";
import {
  accessCode,
  autoCast,
  DEFAULT_ELEVEN,
  ELEVEN_MODELS,
  elevenModel,
  elevenStatus,
  isSpainVoice,
  sortForSpain,
  listElevenVoices,
  playVoicePreview,
  type ElevenCastEntry,
  type ElevenModel,
  type ElevenVoice,
} from "@/lib/voice/elevenlabs";
import type { PocketState } from "./usePocket";
import { Card, Field, Stepper } from "./ui";

interface Props {
  s: PocketState;
  model: ElevenModel;
  onModel: (m: ElevenModel) => void;
  code: string;
  onCode: (c: string) => void;
}

/** Reparto de voces ElevenLabs: código de acceso, modelo y voz/ajustes por personaje. */
export function ElevenCast({ s, model, onModel, code, onCode }: Props) {
  const { project, catalog, editProject } = s;
  const [status, setStatus] = useState<Awaited<ReturnType<typeof elevenStatus>>>(null);
  const [voices, setVoices] = useState<ElevenVoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftCode, setDraftCode] = useState(code);
  const chars = castIds(project);
  const cast = project.metadata.elevenVoices ?? {};

  useEffect(() => {
    elevenStatus().then(setStatus);
  }, []);

  const load = async (c = code) => {
    setError(null);
    try {
      const v = sortForSpain(await listElevenVoices(c));
      setVoices(v);
      // personajes sin voz: reparto automático
      const missing = chars.filter((ch) => !cast[ch]);
      if (missing.length) {
        const auto = autoCast(v, missing);
        editProject((p) => {
          p.metadata.elevenVoices = { ...(p.metadata.elevenVoices ?? {}), ...auto };
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (code && status?.enabled && !voices) void load(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, status?.enabled]);

  const set = (cid: string, patch: Partial<ElevenCastEntry>) =>
    editProject((p) => {
      const cur = p.metadata.elevenVoices?.[cid] ?? { voiceId: voices?.[0]?.id ?? "", ...DEFAULT_ELEVEN };
      const next = { ...cur, ...patch };
      p.metadata.elevenVoices = { ...(p.metadata.elevenVoices ?? {}), [cid]: next };
      rememberEleven(cid, next); // queda fijada para todos los proyectos
    });

  if (status && !status.enabled) {
    return (
      <Card title="ElevenLabs">
        <p className="error-text">
          {!status.hasKey ? "Falta ELEVENLABS_API_KEY en Vercel." : "Falta POCKET_ACCESS_CODE en Vercel."} Añádela en Settings → Environment Variables y vuelve a desplegar.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Reparto de voces · ElevenLabs" right={status ? <span className="badge">hoy {status.usedToday}/{status.dailyChars} car.</span> : undefined}>
      <div className="row">
        <input type="password" placeholder="Código de acceso" value={draftCode} onChange={(e) => setDraftCode(e.target.value)} style={{ flex: 1, minWidth: 160 }} aria-label="Código de acceso" />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            accessCode.set(draftCode);
            onCode(draftCode);
            void load(draftCode);
          }}
        >
          {voices ? "✓ Conectado" : "Conectar"}
        </button>
      </div>
      <Field label="Modelo">
        <select
          value={model}
          onChange={(e) => {
            elevenModel.set(e.target.value as ElevenModel);
            onModel(e.target.value as ElevenModel);
          }}
        >
          {ELEVEN_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="error-text">{error}</p>}
      {voices && !voices.some(isSpainVoice) && (
        <p className="error-text">
          Tu cuenta no tiene voces con acento de España. En elevenlabs.io → Voces → Biblioteca, filtra Español + acento España, añade varias a «Mis voces» y pulsa Conectar otra vez.
        </p>
      )}
      {voices &&
        chars.map((cid) => {
          const c = cast[cid];
          const v = voices.find((x) => x.id === c?.voiceId);
          return (
            <div key={cid} className="cast-row">
              <div className="cast-head">
                <b>{castLabel(cid) ?? findCharacter(catalog, cid)?.name ?? cid}</b>
                <button type="button" className="btn btn-small btn-secondary" disabled={!v?.preview} onClick={() => playVoicePreview(v?.preview ?? "")}>
                  ▶ Muestra (gratis)
                </button>
              </div>
              <Field label="Voz">
                <select value={c?.voiceId ?? ""} onChange={(e) => set(cid, { voiceId: e.target.value, name: voices.find((x) => x.id === e.target.value)?.name })}>
                  {!c && <option value="">Elige…</option>}
                  {voices.map((x) => (
                    <option key={x.id} value={x.id}>
                      {isSpainVoice(x) ? "🇪🇸 " : ""}
                      {x.name} {[x.labels.gender, x.labels.accent, x.labels.age].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
              </Field>
              {v && !isSpainVoice(v) && <p className="fine">⚠ Esta voz no está marcada como de España: puede sonar con acento latino o neutro.</p>}
              {c && (
                <div className="grid2">
                  <Field label="Estabilidad" hint="baja = más expresiva">
                    <Stepper value={c.stability} step={0.05} min={0} max={1} onChange={(x) => set(cid, { stability: x })} />
                  </Field>
                  <Field label="Estilo / exageración">
                    <Stepper value={c.style} step={0.05} min={0} max={1} onChange={(x) => set(cid, { style: x })} />
                  </Field>
                  <Field label="Parecido a la voz">
                    <Stepper value={c.similarity} step={0.05} min={0} max={1} onChange={(x) => set(cid, { similarity: x })} />
                  </Field>
                  <Field label="Velocidad">
                    <Stepper value={c.speed} step={0.05} min={0.7} max={1.2} onChange={(x) => set(cid, { speed: x })} />
                  </Field>
                  <Field label="Modelo de este personaje" hint="v3 entiende acotaciones como [chuckles] o [mischievously]: más exagerado.">
                    <select value={c.model ?? ""} onChange={(e) => set(cid, { model: (e.target.value || undefined) as ElevenCastEntry["model"] })}>
                      <option value="">(el general)</option>
                      <option value="eleven_v3">v3 · expresivo</option>
                      <option value="eleven_multilingual_v2">Multilingual v2 · natural</option>
                    </select>
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      <p className="fine">
        Cada frase se genera una vez y se guarda en este dispositivo: reproducir o editar otras frases no gasta créditos. Las muestras «▶» son gratis. Para más voces en español,
        añádelas a tu cuenta desde la biblioteca de voces de ElevenLabs y pulsa Conectar otra vez.
      </p>
    </Card>
  );
}
