"use client";

import { useState } from "react";
import type { PocketState } from "../usePocket";
import { FaceScreen } from "./FaceScreen";
import { LibraryScreen } from "./LibraryScreen";

/** Recursos: caras de los personajes + biblioteca de objetos, escenarios y sonidos. */
export function ResourcesScreen({ s }: { s: PocketState }) {
  const [view, setView] = useState<"caras" | "biblioteca">(s.faceTarget ? "caras" : "biblioteca");
  return (
    <div className="screen">
      <div className="view-toggle" role="radiogroup" style={{ alignSelf: "flex-start" }}>
        <button type="button" className={view === "biblioteca" ? "on" : ""} onClick={() => setView("biblioteca")}>
          Objetos, escenarios y sonidos
        </button>
        <button type="button" className={view === "caras" ? "on" : ""} onClick={() => setView("caras")}>
          Caras
        </button>
      </div>
      {view === "caras" ? <FaceScreen s={s} /> : <LibraryScreen s={s} />}
    </div>
  );
}
