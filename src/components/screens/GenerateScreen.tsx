"use client";

import { buildScriptPrompt } from "@/lib/generator/scriptPrompt";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildPrompt } from "@/lib/generator/prompt";
import { importProjectText, parseJsonText, type ImportOutcome } from "@/lib/import-export";
import { isV3Project, v3ToPocket, type ConversionReport } from "@/lib/adapters/v3";
import { validateProject } from "@/lib/schema/validate";
import type { PocketState } from "../usePocket";
import { Card, IssueList } from "../ui";

interface ApiStatus {
  enabled: boolean;
  model: string;
  remainingToday: number;
  dailyQuota: number;
  notice: string;
}

export function GenerateScreen({ s }: { s: PocketState }) {
  const { intent, catalog } = s;
  // Por defecto ChatGPT escribe solo el guion y Pocket monta la escena; el formato avanzado (JSON completo) queda como opción.
  const [advanced, setAdvanced] = useState(false);
  const { prompt, warnings } = useMemo(() => (advanced ? buildPrompt(intent, catalog) : buildScriptPrompt(intent, catalog)), [intent, catalog, advanced]);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [v3Report, setV3Report] = useState<ConversionReport | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // OpenRouter: desactivado por defecto; el usuario debe activarlo explícitamente en cada sesión.
  const [orOptIn, setOrOptIn] = useState(false);
  const [orStatus, setOrStatus] = useState<ApiStatus | null>(null);
  const [orBusy, setOrBusy] = useState(false);
  const [orError, setOrError] = useState<string | null>(null);

  useEffect(() => {
    if (!orOptIn || orStatus) return;
    fetch("/api/generate", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: ApiStatus) => setOrStatus(j))
      .catch(() => setOrStatus({ enabled: false, model: "", remainingToday: 0, dailyQuota: 0, notice: "No se pudo consultar el servidor." }));
  }, [orOptIn, orStatus]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied("ok");
    } catch {
      setShowPrompt(true);
      setTimeout(() => promptRef.current?.select(), 50);
      setCopied("fail");
    }
    setTimeout(() => setCopied(null), 3000);
  };

  const runImport = (text: string) => {
    setV3Report(null);
    const parsed = parseJsonText(text);
    if (parsed.ok && isV3Project(parsed.value)) {
      try {
        const { project, report } = v3ToPocket(parsed.value, catalog);
        setV3Report(report);
        setOutcome({ ...validateProject(project, catalog), notes: [...parsed.notes, "Detectado proyecto PUÑETOS Studio V3: convertido al formato Pocket."] });
      } catch (e) {
        setOutcome({ ok: false, errors: [{ path: "$", message: String((e as Error).message) }], warnings: [], notes: [] });
      }
      return;
    }
    setOutcome(importProjectText(text, catalog));
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 300_000) {
      setOutcome({ ok: false, errors: [{ path: "$", message: "Archivo demasiado grande (máx. 300 KB)." }], warnings: [], notes: [] });
      return;
    }
    const text = await f.text();
    setJsonText(text);
    runImport(text);
  };

  const accept = () => {
    if (!outcome?.project) return;
    s.replaceProject(outcome.project);
    setOutcome(null);
    setJsonText("");
    s.setTab("ver");
  };

  const generateWithOpenRouter = async () => {
    setOrBusy(true);
    setOrError(null);
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent }) });
      const j = (await res.json()) as { content?: string; message?: string; remainingToday?: number };
      if (!res.ok || !j.content) {
        setOrError(j.message ?? `Error ${res.status}`);
      } else {
        setJsonText(j.content);
        runImport(j.content);
        if (orStatus && typeof j.remainingToday === "number") setOrStatus({ ...orStatus, remainingToday: j.remainingToday });
      }
    } catch {
      setOrError("No se pudo contactar con el servidor.");
    } finally {
      setOrBusy(false);
    }
  };

  return (
    <div className="screen">
      <Card title="Prompt para ChatGPT" tone="accent" right={<span className="badge badge-free">0 € de API</span>}>
        <ol className="steps">
          <li>Copia el prompt: ChatGPT escribirá <b>solo el guion</b> (quién dice qué, emociones, pausas, efectos).</li>
          <li>Pégalo en ChatGPT u otro modelo que uses.</li>
          <li>Copia su respuesta y pégala abajo en <b>Importar</b>: Pocket monta la escena solo.</li>
        </ol>
        <label className="switch">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          <span>Formato avanzado (ChatGPT escribe también tiempos y posiciones)</span>
        </label>
        {warnings.length > 0 && <IssueList notes={warnings} />}
        <button type="button" className="btn btn-primary btn-block" onClick={copy}>
          {copied === "ok" ? "✓ Copiado" : copied === "fail" ? "Selecciona y copia manualmente ↓" : "📋 Copiar prompt"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setShowPrompt((v) => !v)}>
          {showPrompt ? "Ocultar prompt" : `Ver prompt (${prompt.length} caracteres)`}
        </button>
        {showPrompt && <textarea ref={promptRef} className="mono" readOnly rows={12} value={prompt} />}
        <p className="fine">El uso de ChatGPT depende de los límites de tu cuenta; esto no da acceso gratuito a ninguna API.</p>
      </Card>

      <Card title="Importar JSON">
        <textarea
          className="mono"
          rows={7}
          placeholder='Pega aquí la respuesta { "schemaVersion": "pocket-1", ... } — también se aceptan proyectos V3'
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={!jsonText.trim()} onClick={() => runImport(jsonText)}>
            Validar
          </button>
          <label className="btn btn-secondary file-btn">
            📁 Archivo .json
            <input type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              try {
                const t = await navigator.clipboard.readText();
                setJsonText(t);
                runImport(t);
              } catch {
                /* el usuario puede pegar manualmente */
              }
            }}
          >
            Pegar
          </button>
        </div>
        {outcome && (
          <>
            {outcome.ok ? (
              <div className="ok-box">
                <p>
                  ✓ <b>{outcome.project!.metadata.title}</b> — {outcome.project!.takes.length} toma(s),{" "}
                  {outcome.project!.takes.reduce((n, t) => n + t.events.length, 0)} eventos, {outcome.project!.takes.reduce((n, t) => n + t.duration, 0).toFixed(1)} s
                </p>
                <button type="button" className="btn btn-primary btn-block" onClick={accept}>
                  Abrir en previsualización →
                </button>
              </div>
            ) : null}
            <IssueList errors={outcome.errors} warnings={outcome.warnings} notes={outcome.notes} />
            {v3Report && (v3Report.losses.length > 0 || v3Report.assumptions.length > 0) && (
              <details className="issues">
                <summary>Informe de conversión V3 ({v3Report.losses.length} pérdidas)</summary>
                <ul>
                  {[...v3Report.losses, ...v3Report.assumptions].map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Card>

      <Card title="OpenRouter gratuito (opcional)" tone="muted" right={<span className="badge">{orOptIn ? "activado" : "OFF"}</span>}>
        <label className="switch">
          <input type="checkbox" checked={orOptIn} onChange={(e) => setOrOptIn(e.target.checked)} />
          <span>Quiero usar el modo API gratuito de este despliegue</span>
        </label>
        {orOptIn && (
          <>
            {!orStatus && <p className="fine">Consultando el servidor…</p>}
            {orStatus && !orStatus.enabled && <p className="fine">Este despliegue no tiene OpenRouter configurado. Usa el modo Copiar prompt.</p>}
            {orStatus?.enabled && (
              <>
                <p className="fine">
                  <span className="badge badge-free">solo gratis</span> Modelo: <code>{orStatus.model}</code> · quedan {orStatus.remainingToday}/{orStatus.dailyQuota} hoy
                </p>
                <p className="fine">{orStatus.notice}</p>
                <button type="button" className="btn btn-primary btn-block" disabled={orBusy || intent.characterIds.length === 0} onClick={generateWithOpenRouter}>
                  {orBusy ? "Generando…" : "⚡ Generar con modelo gratuito"}
                </button>
              </>
            )}
            {orError && <p className="error-text">{orError}</p>}
          </>
        )}
      </Card>
    </div>
  );
}
