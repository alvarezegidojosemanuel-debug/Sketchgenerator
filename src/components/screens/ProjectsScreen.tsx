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

      <Card title="Mis proyectos (este navegador)">
        <p className="fine">
          Se guardan automáticamente en este dispositivo (IndexedDB). Si borras los datos del navegador se pierden: exporta JSON para tener copia.
        </p>
        {(err || s.storageError) && <p className="error-text">Almacenamiento no disponible: {err ?? s.storageError}</p>}
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
        <div className="row">
          <p className="fine"><b>Serie · Temporada 1</b></p>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("corto-01", s.catalog), "demo"); s.setTab("ver"); }}>
            🎬 Corto 1 · El lunes no perdona
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("cap-02", s.catalog), "demo"); s.setTab("ver"); }}>
            🎬 Capítulo 2 · Martes
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("prueba-punetos", s.catalog), "demo"); s.setTab("ver"); }}>
            🆕 Prueba: Puñetos rediseñados
          </button>
          <p className="fine"><b>Nuevo · Humanos</b></p>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("fallecido", s.catalog), "demo"); s.setTab("ver"); }}>
            🆕 Sketch: El fallecido
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("jefe-del-pasado", s.catalog), "demo"); s.setTab("ver"); }}>
            🆕 Sketch: El Jefe del pasado
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("prueba-anastasia", s.catalog), "demo"); s.setTab("ver"); }}>
            🆕 Prueba: Anastas-IA (pantalla y en persona)
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("prueba-fake", s.catalog), "demo"); s.setTab("ver"); }}>
            🆕 Prueba: Fake y el pienso de Barbas
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("prueba-alf", s.catalog), "demo"); s.setTab("ver"); }}>
            🆕 Prueba: Alf y Barbas
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("prueba-vanesa", s.catalog), "demo"); s.setTab("ver"); }}>
            🆕 Prueba: Vanesa, el Jefe y Reynaldo
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("prueba-director", s.catalog), "demo"); s.setTab("ver"); }}>
            🆕 Prueba: el Director humano
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("prueba-reynaldo", s.catalog), "demo"); s.setTab("ver"); }}>
            🆕 Prueba: Reynaldo y Sister humanos
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("prueba-humanos", s.catalog), "demo"); s.setTab("ver"); }}>
            🆕 Prueba: Jefe y Usu humanos en sistemas
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject("lentejas", s.catalog), "demo"); s.setTab("ver"); }}>
            Prueba técnica: animación y cómic (guion provisional)
          </button>
          <p className="fine"><b>Serie · El origen</b></p>
          {(["ep1", "ep2", "ep3", "ep4", "ep5"] as const).map((k, n) => (
            <button key={k} type="button" className="btn btn-primary" onClick={() => { s.replaceProject(demoProject(k), "demo"); s.setTab("ver"); }}>
              {["Ep. 1 · Antes", "Ep. 2 · El parche", "Ep. 3 · ¿Qué coño nos ha pasado?", "Ep. 4 · Fuera de la oficina", "Ep. 5 · La nueva normalidad"][n]}
            </button>
          ))}
          <p className="fine"><b>Pruebas y demos</b></p>
          <button type="button" className="btn btn-secondary" onClick={() => { s.replaceProject(demoProject("origen", s.catalog), "demo"); s.setTab("ver"); }}>
            El origen de los puñetos
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => { s.replaceProject(demoProject("usu-reynaldo", s.catalog), "demo"); s.setTab("ver"); }}>
            Demo: Usu + Reynaldo
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { s.replaceProject(demoProject("usu-jefe", s.catalog), "demo"); s.setTab("ver"); }}>
            Demo: Usu + Jefe
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { s.replaceProject(demoProject("interacciones", s.catalog), "demo"); s.setTab("ver"); }}>
            Demo: interacciones (móvil, alarma, bocadillo)
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { s.replaceProject(demoProject("pantallazo", s.catalog), "demo"); s.setTab("ver"); }}>
            Demo: El Pantallazo Cero (narrador, escritorio, transformación)
          </button>
        </div>
      </Card>
    </div>
  );
}
