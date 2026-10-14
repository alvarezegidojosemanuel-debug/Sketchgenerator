"use client";


import { usePocket, type Tab } from "./usePocket";
import { IdeaScreen } from "./screens/IdeaScreen";
import { GenerateScreen } from "./screens/GenerateScreen";
import { PreviewScreen } from "./screens/PreviewScreen";
import { EditScreen } from "./screens/EditScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { FaceScreen } from "./screens/FaceScreen";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "idea", label: "Idea", icon: "💡" },
  { id: "generar", label: "Generar", icon: "✨" },
  { id: "ver", label: "Ver", icon: "▶" },
  { id: "editar", label: "Editar", icon: "✎" },
  { id: "caras", label: "Caras", icon: "🙂" },
  { id: "proyectos", label: "Proyectos", icon: "🗂" },
];

export function PocketApp() {
  const s = usePocket();
  const uncalibrated = s.catalog.characters.reduce((n, c) => n + c.poses.filter((p) => p.rig?.status === "estimated").length, 0);
  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">PUÑETOS <b>Pocket</b></span>
        {uncalibrated > 0 && (
          <button type="button" className="badge badge-warn" title={s.catalog.source.note} onClick={() => s.setTab("caras")}>
            {uncalibrated} poses sin calibrar
          </button>
        )}
      </header>
      <main className="content">
        {s.tab === "idea" && <IdeaScreen s={s} />}
        {s.tab === "generar" && <GenerateScreen s={s} />}
        {s.tab === "ver" && <PreviewScreen s={s} />}
        {s.tab === "editar" && <EditScreen s={s} />}
        {s.tab === "caras" && <FaceScreen s={s} />}
        {s.tab === "proyectos" && <ProjectsScreen s={s} />}
      </main>
      <nav className="tabbar" aria-label="Secciones">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={s.tab === t.id ? "on" : ""} aria-current={s.tab === t.id ? "page" : undefined} onClick={() => s.setTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
