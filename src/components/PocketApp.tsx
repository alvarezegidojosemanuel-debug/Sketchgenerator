"use client";


import { usePocket, type Tab } from "./usePocket";
import { IdeaScreen } from "./screens/IdeaScreen";
import { GenerateScreen } from "./screens/GenerateScreen";
import { PreviewScreen } from "./screens/PreviewScreen";
import { EditScreen } from "./screens/EditScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { ResourcesScreen } from "./screens/ResourcesScreen";
import { GuionScreen } from "./screens/GuionScreen";
import { AnimScreen } from "./screens/AnimScreen";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "idea", label: "Idea", icon: "💡" },
  { id: "generar", label: "Generar", icon: "✨" },
  { id: "guion", label: "Guion", icon: "✎" },
  { id: "animacion", label: "Animación", icon: "🎞" },
  { id: "ver", label: "Ver", icon: "▶" },
  { id: "editar", label: "Avanzado", icon: "🎛" },
  { id: "caras", label: "Recursos", icon: "🧰" },
  { id: "proyectos", label: "Proyectos", icon: "🗂" },
];

export function PocketApp() {
  const s = usePocket();
  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">
          <img src="/assets/punetos/props/logo_punetos.webp" alt="PUÑETOS" />
          <b>Pocket</b>
        </span>
        <span className="topbar-tag">estudio de sketches</span>
      </header>
      <main className={`content${s.tab === "guion" ? " content-wide" : ""}`}>
        {s.tab === "idea" && <IdeaScreen s={s} />}
        {s.tab === "generar" && <GenerateScreen s={s} />}
        {s.tab === "guion" && <GuionScreen s={s} />}
        {s.tab === "animacion" && <AnimScreen s={s} />}
        {s.tab === "ver" && <PreviewScreen s={s} />}
        {s.tab === "editar" && <EditScreen s={s} />}
        {s.tab === "caras" && <ResourcesScreen s={s} />}
        {s.tab === "proyectos" && <ProjectsScreen s={s} />}
      </main>
      <nav className="tabbar sidebar" aria-label="Secciones">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={s.tab === t.id ? "on" : ""} aria-current={s.tab === t.id ? "page" : undefined} onClick={() => s.setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
