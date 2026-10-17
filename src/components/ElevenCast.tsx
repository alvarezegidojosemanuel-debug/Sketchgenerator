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
  pitchOf,
  tempoOf,
  generateElevenLines,
} from "@/lib/voice/elevenlabs";
import { playClip, unlockAudio, type LineRequest } from "@/lib/voice/piper";
import { stripAudioTags } from "@/lib/voice/tags";
import type { PocketState } from "./usePocket";
import { Card, Field, Stepper } from "./ui";

interface Props {
  s: PocketState;
  model: ElevenModel;
  onModel: (m: ElevenModel) => void;
  code: string;
  onCode: (c: string) => void;
  /** Frases del proyecto, para probar cada voz con las suyas. */
  lines?: LineRequest[];
}

/** Reparto de voces ElevenLabs: código de acceso, modelo y voz/ajustes por personaje. */
export function ElevenCast({ s, model, onModel, code, onCode, lines = [] }: Props) {
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
                  {c && !voices.some((x) => x.id === c.voiceId) && <option value={c.voiceId}>🎭 {c.name ?? "Voz a medida"}</option>}
                  {voices.map((x) => (
                    <option key={x.id} value={x.id}>
                      {isSpainVoice(x) ? "🇪🇸 " : ""}
                      {x.name} {[x.labels.gender, x.labels.accent, x.labels.age].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
              </Field>
              {v && !isSpainVoice(v) && <p className="fine">⚠ Esta voz no está marcada como de España: puede sonar con acento latino o neutro.</p>}
              {c && model === "dialogue_v3" && <p className="fine">⚠ En modo conversación ElevenLabs solo usa la voz y la estabilidad: el estilo, el parecido, la velocidad y el modelo de cada personaje se ignoran. Para que se respeten, elige «frase a frase» arriba.</p>}
              {c && (
                <div className="grid2">
                  <Field label="Estabilidad" hint="En v3 solo cuenta 0 (creativa, la más exagerada), 0,5 (natural) o 1 (estable).">
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
                  <Field label="Tono (agudo)" hint="1 = normal; 1,1 = más agudo y nervioso. Se aplica en la app: suena igual en todos los dispositivos.">
                    <Stepper value={pitchOf(cid, c)} step={0.02} min={0.8} max={1.3} onChange={(x) => set(cid, { pitch: Math.round(x * 100) / 100 })} />
                  </Field>
                  <Field label="Ritmo (más rápido)" hint="1 = como sale de ElevenLabs; 1,2 = un 20 % más rápido SIN cambiar el tono. Gratis: se aplica en la app.">
                    <Stepper value={tempoOf(c)} step={0.05} min={0.8} max={1.6} onChange={(x) => set(cid, { tempo: Math.round(x * 100) / 100 })} />
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
              {c && (
                <Field label="Acotación (solo v3)" hint="Cómo dice TODAS sus frases, en inglés: furious, exasperated, sarcastic, whispering, shouting, overly dramatic… Vacío = la automática.">
                  <input value={c.tag ?? ""} maxLength={60} placeholder="automática" onChange={(e) => set(cid, { tag: e.target.value || undefined })} />
                </Field>
              )}
              {c && <TryLine cid={cid} entry={c} model={model} code={code} lines={lines.filter((l) => l.characterId === cid)} />}
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

/** Prueba una frase del personaje con los ajustes actuales (gasta créditos solo si la combinación es nueva). */
function TryLine({ cid, entry, model, code, lines }: { cid: string; entry: ElevenCastEntry; model: ElevenModel; code: string; lines: LineRequest[] }) {
  const [pick, setPick] = useState(0);
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const base = lines[pick];
  const go = async () => {
    setErr(null);
    setBusy(true);
    try {
      await unlockAudio();
      const req: LineRequest = own.trim() ? { key: "prueba:0", text: own.trim(), characterId: cid } : { ...base!, key: "prueba:0" };
      // «conversación» ignora los ajustes por personaje: la prueba va frase a frase para oír lo que se toca
      const clips = await generateElevenLines([req], { [cid]: entry }, code, model === "dialogue_v3" ? "eleven_v3" : model);
      const clip = clips.get("prueba:0");
      if (clip) playClip(clip);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="try-line">
      <Field label="Probar con esta frase">
        {lines.length > 0 && (
          <select value={pick} onChange={(e) => { setPick(Number(e.target.value)); setOwn(""); }}>
            {lines.map((l, i) => (
              <option key={l.key} value={i}>
                {stripAudioTags(l.text).slice(0, 70)}
              </option>
            ))}
          </select>
        )}
        <input value={own} maxLength={300} placeholder={lines.length ? "…o escribe otra frase" : "Escribe una frase para probar"} onChange={(e) => setOwn(e.target.value)} />
      </Field>
      <button type="button" className="btn btn-small btn-primary" disabled={busy || !code || (!own.trim() && !base)} onClick={go}>
        {busy ? "Generando…" : "🔊 Probar con estos ajustes"}
      </button>
      <p className="fine">Gasta créditos la primera vez con cada combinación de ajustes; repetirla o cambiar solo el tono es gratis.</p>
      {err && <p className="error-text">{err}</p>}
    </div>
  );
}
