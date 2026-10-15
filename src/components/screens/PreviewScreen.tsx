"use client";

import { useEffect, useMemo, useState } from "react";
import { evaluateTake, projectSchedule } from "@/lib/timeline/evaluate";
import { ttsSupported } from "@/lib/tts";
import { attributionsFor, castIds, speakerCharacterId } from "@/lib/voice/catalog";
import { clipKey, fitProjectToAudio } from "@/lib/voice/fit";
import { generateLines, unlockAudio, type Clip, type Progress } from "@/lib/voice/piper";
import { accessCode, elevenModel, generateElevenDialogue, generateElevenLines, type ElevenModel } from "@/lib/voice/elevenlabs";
import { ElevenCast } from "../ElevenCast";
import { exportMp4, lastExportAudio, lastExportCodec, type ExportProgress } from "@/lib/export/mp4";

const EXPORT_LABEL: Record<ExportProgress["stage"], string> = { imagenes: "Cargando imágenes…", audio: "Mezclando audio…", video: "Creando vídeo…", listo: "Listo" };
import { Stage } from "../Stage";
import { usePlayer, type VoiceEngine } from "../usePlayer";
import type { PocketState } from "../usePocket";
import { VoiceCast } from "../VoiceCast";
import { IssueList } from "../ui";

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const ENGINE_KEY = "pocket:voiceEngine";

export function PreviewScreen({ s }: { s: PocketState }) {
  const { project, catalog } = s;
  const [engine, setEngineState] = useState<VoiceEngine>("elevenlabs");
  const [model, setModel] = useState<ElevenModel>("eleven_multilingual_v2");
  const [code, setCode] = useState("");
  const [subs, setSubs] = useState(true);
  const [hasTts, setHasTts] = useState(true);
  const [clips, setClips] = useState<Map<string, Clip> | null>(null);
  const [clipsSig, setClipsSig] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [fitMsg, setFitMsg] = useState<string | null>(null);

  useEffect(() => {
    setHasTts(ttsSupported());
    setModel(elevenModel.get());
    setCode(accessCode.get());
    try {
      const v = localStorage.getItem(ENGINE_KEY) as VoiceEngine | null;
      if (v === "piper" || v === "elevenlabs" || v === "browser" || v === "off") setEngineState(v);
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  const setEngine = (v: VoiceEngine) => {
    setEngineState(v);
    try {
      localStorage.setItem(ENGINE_KEY, v);
    } catch {
      /* sin almacenamiento */
    }
  };

  // Frases del proyecto y firma (si cambian textos o reparto, hay que regenerar)
  const lines = useMemo(
    () =>
      project.takes.flatMap((t) =>
        t.events
          .filter((e) => e.track === "dialogue")
          .map((e) => {
            const d = e as { id: string; text: string; actorUid?: string; voiceOf?: string; speakerName?: string; voice?: { rate?: number } };
            return { key: clipKey(t.id, d.id), text: d.text, characterId: speakerCharacterId(t, d.actorUid, d.voiceOf, d.speakerName), rate: d.voice?.rate };
          }),
      ),
    [project],
  );
  const usesClips = engine === "piper" || engine === "elevenlabs";
  const sig = useMemo(
    () => JSON.stringify([engine, lines, engine === "elevenlabs" ? [project.metadata.elevenVoices ?? null, model] : project.metadata.voices ?? null]),
    [engine, lines, project.metadata.voices, project.metadata.elevenVoices, model],
  );
  const ready = !usesClips || (clips !== null && clipsSig === sig);

  // Con voces generadas, la reproducción usa la duración REAL de cada frase (sin huecos ni esperas):
  // se conserva la pausa que pide el guion entre frases, pero no la estimación de duración.
  const liveClips = clipsSig === sig ? clips : null;
  const playProject = useMemo(() => {
    if (!usesClips || !liveClips) return project;
    const durations = new Map([...liveClips].map(([k, c]) => [k, c.duration]));
    return fitProjectToAudio(project, durations).project;
  }, [project, liveClips, usesClips]);
  const pl = usePlayer(playProject, catalog, { engine, clips: liveClips });
  const { slots } = projectSchedule(playProject);
  const take = playProject.takes[pl.pos.takeIndex];
  // Los últimos 2 s de una toma: la siguiente se prepara invisible (evita el «fogonazo» en el corte en el móvil).
  const nextTake = playProject.takes[pl.pos.takeIndex + 1];
  const nearCut = !!take && !!nextTake && take.duration - pl.pos.t < 2;
  const nextFrame = useMemo(() => (nearCut && nextTake ? evaluateTake(nextTake, catalog, 0.6) : undefined), [nearCut, nextTake, catalog]);

  const prepare = async (): Promise<boolean> => {
    setVoiceError(null);
    try {
      const m =
        engine === "elevenlabs"
          ? model === "dialogue_v3"
            ? await generateElevenDialogue(lines, project.metadata.elevenVoices, code, setProgress)
            : await generateElevenLines(lines, project.metadata.elevenVoices, code, model, setProgress)
          : await generateLines(lines, project.metadata.voices, setProgress);
      setClips(m);
      setClipsSig(sig);
      return true;
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setProgress(null);
    }
  };

  const onPlay = async () => {
    if (pl.playing) return pl.pause();
    await unlockAudio(); // dentro del toque: los navegadores exigen un gesto para sonar
    if (usesClips && !ready && !(await prepare())) return;
    pl.play();
  };

  const [exporting, setExporting] = useState<ExportProgress | null>(null);
  const [video, setVideo] = useState<{ url: string; name: string; blob: Blob; codec: string | null; audio: string | null } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const doExport = async () => {
    if (pl.playing) pl.pause();
    setExportError(null);
    if (usesClips && !ready && !(await prepare())) return;
    try {
      setExporting({ stage: "imagenes", ratio: 0 });
      const blob = await exportMp4(playProject, catalog, usesClips ? liveClips : null, setExporting);
      if (video) URL.revokeObjectURL(video.url);
      const name = `${project.metadata.title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "_") || "sketch"}.mp4`;
      setVideo({ url: URL.createObjectURL(blob), name, blob, codec: lastExportCodec, audio: lastExportAudio });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  };
  const shareVideo = async () => {
    if (!video) return;
    const file = new File([video.blob], video.name, { type: "video/mp4" });
    try {
      await navigator.share({ files: [file], title: project.metadata.title });
    } catch {
      /* cancelado */
    }
  };

  const fit = () => {
    if (!clips) return;
    const durations = new Map([...clips].map(([k, c]) => [k, c.duration]));
    const { project: p, changed } = fitProjectToAudio(project, durations);
    s.editProject((d) => {
      d.takes = p.takes;
      d.metadata.approxDuration = p.metadata.approxDuration;
    });
    setFitMsg(changed ? `${changed} diálogo(s) ajustados a su voz; lo que venía detrás se ha desplazado.` : "Los diálogos ya coinciden con sus voces.");
  };

  const credits = attributionsFor(project.metadata.voices ?? {}, castIds(project));

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
      <Stage catalog={catalog} frame={pl.frame} showSubtitles={subs} preload={nextFrame} />
      <div className="transport">
        <button type="button" className="btn btn-round btn-primary" onClick={onPlay} disabled={progress !== null} aria-label={pl.playing ? "Pausar" : "Reproducir"}>
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
      {progress && (
        <div className="progress">
          <div style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
          <span>{progress.label}</span>
        </div>
      )}
      {pl.holding && <p className="fine">⏸ Esperando a que termine la voz (el diálogo manda)…</p>}
      {voiceError && <p className="error-text">No se pudieron generar las voces: {voiceError}</p>}
      <div className="row">
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          <span className="field-label">Voces</span>
          <select value={engine} onChange={(e) => setEngine(e.target.value as VoiceEngine)}>
            <option value="elevenlabs">ElevenLabs (máxima calidad)</option>
            <option value="piper">Piper (gratis, sin conexión)</option>
            {hasTts && <option value="browser">Voces del navegador</option>}
            <option value="off">Sin voz (solo subtítulos)</option>
          </select>
        </label>
        <label className="switch">
          <input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} />
          <span>Subtítulos</span>
        </label>
      </div>
      {usesClips && (
        <div className="row">
          <button type="button" className="btn btn-secondary" disabled={progress !== null || (ready && clips !== null)} onClick={prepare}>
            {ready && clips ? "✓ Voces preparadas" : "Preparar voces"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={!ready || !clips} onClick={fit}>
            ⏱ Ajustar diálogos a las voces
          </button>
        </div>
      )}
      {fitMsg && <p className="fine">✓ {fitMsg}</p>}
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={exporting !== null || progress !== null} onClick={doExport}>
          {exporting ? `🎬 ${EXPORT_LABEL[exporting.stage]} ${Math.round(exporting.ratio * 100)} %` : "🎬 Exportar MP4 (1080×1920)"}
        </button>
      </div>
      {exportError && <p className="error-text">No se pudo exportar el vídeo: {exportError}</p>}
      {video && (
        <div className="card">
          <video src={video.url} controls playsInline style={{ width: "100%", maxHeight: "60vh", borderRadius: 12, background: "#000" }} />
          <div className="row">
            <a className="btn btn-secondary" href={video.url} download={video.name}>⬇ Descargar {video.name}</a>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button type="button" className="btn btn-secondary" onClick={shareVideo}>📤 Compartir</button>
            )}
          </div>
          {(video.codec === "vp9" || video.audio !== "aac") && (
            <p className="fine">
              ⚠️ {video.audio === null ? "Este navegador no pudo codificar el audio: el vídeo va sin sonido. " : ""}
              {video.codec === "vp9" || video.audio === "opus" ? "Este navegador no tiene H.264/AAC y usa VP9/Opus; algunas redes no lo aceptan. " : ""}
              Para subirlo a redes, expórtalo desde Chrome en ordenador.
            </p>
          )}
          <p className="fine">{usesClips ? "Con las voces y sonidos del sketch." : "Sin voces (elige Piper o ElevenLabs para exportar con voz); con efectos de sonido."}</p>
        </div>
      )}
      <p className="fine">
        {usesClips
          ? "La boca sigue el volumen real de cada voz y la escena espera a que termine cada frase. «Ajustar diálogos» deja los bloques con la duración exacta de su voz."
          : engine === "browser"
            ? "Las voces del navegador dependen del dispositivo; la boca se mueve mientras suenan."
            : "Sin voz: la boca se anima según la duración de cada bloque."}
      </p>
      {engine === "piper" && credits.length > 0 && (
        <p className="fine">Créditos obligatorios de voz para tus publicaciones: {credits.join(" · ")}</p>
      )}
      {engine === "piper" && <VoiceCast s={s} />}
      {engine === "elevenlabs" && <ElevenCast s={s} model={model} onModel={setModel} code={code} onCode={setCode} />}
      <button type="button" className="btn btn-secondary btn-block" onClick={() => s.setTab("editar")}>
        ✎ Editar este sketch
      </button>
    </div>
  );
}
