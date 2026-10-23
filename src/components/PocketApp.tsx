"use client";

import { useState } from "react";

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

/** En el móvil: menú abajo con lo de cada día; el resto en «Más». */
const MAIN_MOBILE: Tab[] = ["guion", "ver", "editar"];

export function PocketApp() {
  const s = usePocket();
  const [more, setMore] = useState(false);
  const go = (t: Tab) => { s.setTab(t); setMore(false); };
  const inMore = !MAIN_MOBILE.includes(s.tab);
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
            <img className="tab-icon" src={`/assets/ui/tab_${t.id}.webp`} alt="" aria-hidden />
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
      <nav className="bottomnav" aria-label="Secciones">
        {MAIN_MOBILE.map((id) => {
          const t = TABS.find((x) => x.id === id)!;
          return (
            <button key={id} type="button" className={s.tab === id && !more ? "on" : ""} aria-current={s.tab === id ? "page" : undefined} onClick={() => go(id)}>
              <img className="tab-icon" src={`/assets/ui/tab_${id}.webp`} alt="" aria-hidden />
              <span className="tab-label">{t.label}</span>
            </button>
          );
        })}
        <button type="button" className={more || inMore ? "on" : ""} aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {inMore && !more ? <img className="tab-icon" src={`/assets/ui/tab_${s.tab}.webp`} alt="" aria-hidden /> : <span className="more-icon" aria-hidden>☰</span>}
          <span className="tab-label">{inMore && !more ? TABS.find((x) => x.id === s.tab)?.label : "Más"}</span>
        </button>
      </nav>
      {more && (
        <div className="more-sheet" role="dialog" aria-label="Más secciones" onClick={() => setMore(false)}>
          <div className="more-panel" onClick={(e) => e.stopPropagation()}>
            {TABS.filter((t) => !MAIN_MOBILE.includes(t.id)).map((t) => (
              <button key={t.id} type="button" className={s.tab === t.id ? "on" : ""} onClick={() => go(t.id)}>
                <img className="tab-icon" src={`/assets/ui/tab_${t.id}.webp`} alt="" aria-hidden />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
