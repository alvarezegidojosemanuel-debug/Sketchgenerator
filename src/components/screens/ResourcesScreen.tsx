"use client";

import { useState } from "react";
import { makeZip } from "@/lib/export/zip";
import type { PocketState } from "../usePocket";
import { LibraryScreen } from "./LibraryScreen";
import { Card } from "../ui";

/** Recursos: personajes con todas sus poses (humanos y Puñetos) + objetos, escenarios y sonidos. */
/** Selección de recursos para descargar (p. ej. para pasárselos a ChatGPT como referencia). */
export interface Picker {
  has: (id: string) => boolean;
  toggle: (id: string, name: string, src: string) => void;
  setMany: (items: { id: string; name: string; src: string }[], on: boolean) => void;
}

const ext = (src: string, type?: string) => /\.(png|jpe?g|webp|svg|gif|mp3|wav|ogg)(\?|$)/i.exec(src)?.[1]?.toLowerCase() ?? (type?.split("/")[1]?.replace("jpeg", "jpg").replace("mpeg", "mp3") || "png");

export function ResourcesScreen({ s }: { s: PocketState }) {
  const [view, setView] = useState<"personajes" | "biblioteca">("personajes");
  const [picked, setPicked] = useState(new Map<string, { name: string; src: string }>());
  const [busy, setBusy] = useState(false);
  const pick: Picker = {
    has: (id) => picked.has(id),
    toggle: (id, name, src) => setPicked((m) => { const n = new Map(m); if (n.has(id)) n.delete(id); else n.set(id, { name, src }); return n; }),
    setMany: (items, on) => setPicked((m) => { const n = new Map(m); for (const it of items) { if (on) n.set(it.id, { name: it.name, src: it.src }); else n.delete(it.id); } return n; }),
  };
  const download = async () => {
    setBusy(true);
    try {
      const used = new Set<string>();
      const files = await Promise.all(
        [...picked.values()].map(async ({ name, src }) => {
          const r = await fetch(src);
          const blob = await r.blob();
          let base = name.replace(/[\\/:*?"<>|]+/g, "_");
          let fn = `${base}.${ext(src, blob.type)}`;
          for (let i = 2; used.has(fn); i++) fn = `${base}_${i}.${ext(src, blob.type)}`;
          used.add(fn);
          return { name: fn, blob, data: new Uint8Array(await blob.arrayBuffer()) };
        }),
      );
      const out = files.length === 1 ? { blob: files[0].blob, name: files[0].name } : { blob: makeZip(files), name: `recursos-punetos-${files.length}.zip` };
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = out.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      alert(`No se pudo descargar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };
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
      <p className="fine">Toca los recursos que quieras para marcarlos ✓ y descárgalos juntos (por ejemplo, para dárselos a ChatGPT como referencia).</p>
      {view === "personajes" ? <Characters s={s} pick={pick} /> : <LibraryScreen s={s} pick={pick} />}
      {picked.size > 0 && (
        <div className="pick-bar" role="status">
          <span><b>{picked.size}</b> seleccionado{picked.size === 1 ? "" : "s"}</span>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setPicked(new Map())}>Quitar selección</button>
          <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={download}>{busy ? "Preparando…" : picked.size === 1 ? "⬇ Descargar" : "⬇ Descargar (.zip)"}</button>
        </div>
      )}
    </div>
  );
}

function Characters({ s, pick }: { s: PocketState; pick: Picker }) {
  const chars = s.catalog.characters.filter((c) => c.poses.some((p) => /^pose_[hp]_/.test(p.key)));
  const [cid, setCid] = useState(chars[0]?.id ?? "");
  const [look, setLook] = useState<"p" | "h">("p");
  const ch = chars.find((c) => c.id === cid) ?? chars[0];
  if (!ch) return null;
  const hasP = ch.poses.some((p) => p.key.startsWith("pose_p_"));
  const lk = hasP ? look : "h";
  const poses = ch.poses.filter((p) => p.key.startsWith(`pose_${lk}_`));
  const items = poses.map((p) => ({ id: p.id, name: `${ch.name}_${lk === "p" ? "puneto" : "humano"}_${p.key.replace(/^pose_[hp]_/, "")}`, src: p.src }));
  const allOn = items.length > 0 && items.every((it) => pick.has(it.id));
  return (
    <>
      <div className="chips">
        {chars.map((c) => (
          <button key={c.id} type="button" className={`chip${c.id === ch.id ? " on" : ""}`} onClick={() => setCid(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <Card title={`${ch.name} · ${poses.length} poses`} right={<button type="button" className="btn btn-ghost btn-small" onClick={() => pick.setMany(items, !allOn)}>{allOn ? "Quitar todas" : "Seleccionar todas"}</button>}>
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
          {poses.map((p, i) => (
            <li key={p.id} className={`lib-item pickable${pick.has(p.id) ? " picked" : ""}`} onClick={() => pick.toggle(p.id, items[i].name, p.src)}>
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
