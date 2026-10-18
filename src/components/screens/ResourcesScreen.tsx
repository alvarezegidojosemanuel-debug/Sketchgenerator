"use client";

import { useState } from "react";
import type { PocketState } from "../usePocket";
import { LibraryScreen } from "./LibraryScreen";
import { Card } from "../ui";

/** Recursos: personajes con todas sus poses (humanos y Puñetos) + objetos, escenarios y sonidos. */
export function ResourcesScreen({ s }: { s: PocketState }) {
  const [view, setView] = useState<"personajes" | "biblioteca">("personajes");
  return (
    <div className="screen">
      <div className="view-toggle" role="radiogroup" style={{ alignSelf: "flex-start" }}>
        <button type="button" className={view === "personajes" ? "on" : ""} onClick={() => setView("personajes")}>
          Personajes
        </button>
        <button type="button" className={view === "biblioteca" ? "on" : ""} onClick={() => setView("biblioteca")}>
          Escenarios, objetos y sonidos
        </button>
      </div>
      {view === "personajes" ? <Characters s={s} /> : <LibraryScreen s={s} />}
    </div>
  );
}

function Characters({ s }: { s: PocketState }) {
  const chars = s.catalog.characters.filter((c) => c.poses.some((p) => /^pose_[hp]_/.test(p.key)));
  const [cid, setCid] = useState(chars[0]?.id ?? "");
  const [look, setLook] = useState<"p" | "h">("p");
  const ch = chars.find((c) => c.id === cid) ?? chars[0];
  if (!ch) return null;
  const hasP = ch.poses.some((p) => p.key.startsWith("pose_p_"));
  const lk = hasP ? look : "h";
  const poses = ch.poses.filter((p) => p.key.startsWith(`pose_${lk}_`));
  return (
    <>
      <div className="chips">
        {chars.map((c) => (
          <button key={c.id} type="button" className={`chip${c.id === ch.id ? " on" : ""}`} onClick={() => setCid(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <Card title={`${ch.name} · ${poses.length} poses`}>
        {hasP && (
          <div className="view-toggle" role="radiogroup" style={{ alignSelf: "flex-start" }}>
            <button type="button" className={lk === "p" ? "on" : ""} onClick={() => setLook("p")}>
              Puñeto
            </button>
            <button type="button" className={lk === "h" ? "on" : ""} onClick={() => setLook("h")}>
              Humano
            </button>
          </div>
        )}
        <ul className="lib-grid lib-grid-poses">
          {poses.map((p) => (
            <li key={p.id} className="lib-item">
              <img src={p.src} alt="" loading="lazy" />
              <code>{p.key.replace(/^pose_[hp]_/, "")}</code>
              {p.talkSrc && p.talkSrc !== p.src ? <small className="fine">👄 habla</small> : null}
            </li>
          ))}
        </ul>
        <p className="fine">En el guion se usan con «gesto» (por ejemplo «gesto»: «{poses[1]?.key.replace(/^pose_[hp]_/, "") ?? "neutro"}»). 👄 = mueve la boca al hablar.</p>
      </Card>
    </>
  );
}
