"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadText, exportProjectText, importProjectText, projectFileName } from "@/lib/import-export";
import { pocketToV3, type ConversionReport } from "@/lib/adapters/v3";
import { projectStore, type StoredProject } from "@/lib/storage/projects";
import { validateProject } from "@/lib/schema/validate";
import { demoProject, type PocketState } from "../usePocket";
import { exportSharedConfig, importSharedConfig } from "@/lib/voice/fixedCast";
import { Card, Field, IssueList } from "../ui";

export function ProjectsScreen({ s }: { s: PocketState }) {
  const { project, catalog } = s;
  const [list, setList] = useState<StoredProject[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [importMsg, setImportMsg] = useState<ReturnType<typeof importProjectText> | null>(null);

  const refresh = useCallback(() => {
    projectStore.list().then(setList).catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(refresh, [refresh, s.saveState]);

  const exportPocket = () => {
    const v = validateProject(project, catalog);
    if (!v.ok) {
      if (!confirm(`El proyecto tiene ${v.errors.length} error(es) de validación. ¿Exportar igualmente?`)) return;
    }
    downloadText(projectFileName(project), exportProjectText(project));
  };

  const exportV3 = () => {
    const { v3, report } = pocketToV3(project, catalog);
    setReport(report);
    downloadText(projectFileName(project).replace(".pocket.json", ".v3.json"), JSON.stringify(v3, null, 2) + "\n");
  };

  const importFile = async (f?: File) => {
    if (!f) return;
    const r = importProjectText(await f.text(), catalog);
    setImportMsg(r);
    if (r.ok && r.project) s.replaceProject(r.project);
  };

  return (
    <div className="screen">
      <Card title="Capítulos y sketches (versión oficial)">
        <p className="fine">Siempre la última versión, igual en todos los dispositivos. Ábrelos desde aquí.</p>
        <div className="row">
          <p className="fine"><b>Sketches</b></p>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("sk-01", s.catalog), "demo"); s.setTab("ver"); }}>
            😂 Sketch · ¿Está en vigor?
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("sk-02", s.catalog), "demo"); s.setTab("guion"); }}>
            ☕ Sketch · El último café
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("sk-03", s.catalog), "demo"); s.setTab("ver"); }}>
            🏠 Sketch · Un par de añitos
          </button>
        </div>
        <div className="row">
          <p className="fine"><b>Serie · Temporada 1</b></p>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("corto-01", s.catalog), "demo"); s.setTab("ver"); }}>
            🎬 Corto 1 · El lunes no perdona
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("cap-02", s.catalog), "demo"); s.setTab("ver"); }}>
            🎬 Capítulo 2 · Martes
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("sis-01", s.catalog), "demo"); s.setTab("ver"); }}>
            🎬 Versión Sister · 1 · Espacio-tiempo
          </button>
        </div>
      </Card>

      <Card title="Proyecto actual" right={<span className="badge">{s.saveState === "saving" ? "guardando…" : s.saveState === "saved" ? "guardado" : s.saveState === "error" ? "error" : "local"}</span>}>
        <Field label="Título">
          <input value={project.metadata.title} maxLength={120} onChange={(e) => s.editProject((p) => { p.metadata.title = e.target.value || "Sin título"; })} />
        </Field>
        <p className="fine">
          {project.takes.length} toma(s) · {project.takes.reduce((n, t) => n + t.duration, 0).toFixed(1)} s · catálogo {project.catalogVersion}
        </p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={exportPocket}>⬇ Exportar JSON</button>
          <button type="button" className="btn btn-secondary" onClick={exportV3}>⬇ Exportar V3</button>
          <button type="button" className="btn btn-secondary" onClick={async () => { const t = exportSharedConfig(); try { await navigator.clipboard.writeText(t); alert("Configuración de voces copiada. Pégasela a Claude para dejarla igual en todos los dispositivos."); } catch { prompt("Copia esta configuración:", t); } }}>📋 Copiar configuración de voces</button>
          <button type="button" className="btn btn-ghost" onClick={() => { const t = prompt("Pega aquí la configuración de voces copiada del otro dispositivo:"); if (t && importSharedConfig(t)) { alert("Configuración aplicada. Se recarga la app."); location.reload(); } else if (t) alert("No es una configuración válida."); }}>📥 Pegar configuración de voces</button>
          <label className="btn btn-secondary file-btn">
            ⬆ Importar
            <input type="file" accept=".json,application/json" onChange={(e) => importFile(e.target.files?.[0])} />
          </label>
        </div>
        {importMsg && <IssueList errors={importMsg.errors} warnings={importMsg.warnings} notes={importMsg.notes} />}
        {report && (
          <details className="issues" open>
            <summary>Informe de exportación V3: {report.losses.length} pérdida(s)</summary>
            <ul>
              {[...report.losses, ...report.assumptions].map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </details>
        )}
      </Card>

      <Card title="Tus copias guardadas (solo en este dispositivo)">
        <p className="fine">
          Cada vez que retocas algo se guarda aquí una copia con fecha. Son versiones tuyas, antiguas o en pruebas: para ver la versión oficial usa los botones de arriba. Borra las que no necesites.
        </p>
        {err && <p className="error-text">Almacenamiento no disponible: {err}</p>}
        {list === null && !err && <p className="fine">Cargando…</p>}
        {list && list.length === 0 && <p className="fine">Aún no hay proyectos guardados. Edita el demo o importa uno.</p>}
        <ul className="project-list">
          {list?.map((p) => (
            <li key={p.id} className={p.id === s.projectId ? "current" : ""}>
              <button type="button" className="project-open" onClick={() => { s.replaceProject(p.project, p.id); s.setTab("ver"); }}>
                <b>{p.title}</b>
                <small>{new Date(p.updatedAt).toLocaleString("es-ES")} · {p.project.takes.length} toma(s)</small>
              </button>
              <button type="button" className="btn btn-small btn-danger" aria-label={`Borrar ${p.title}`} onClick={async () => { if (confirm(`¿Borrar «${p.title}»?`)) { await projectStore.remove(p.id); refresh(); } }}>
                🗑
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
