"use client";

import { useState } from "react";
import { makeZip } from "@/lib/export/zip";
import type { PocketState } from "../usePocket";
import { LibraryScreen } from "./LibraryScreen";
import { Card } from "../ui";
import { MouthEditor } from "../MouthEditor";
import { CategoryFilter, CategoryIcons, filterPoses } from "../PoseCategories";
import { POSE_CATEGORIES, autoCategories, poseCategoriesOf } from "@/lib/catalog/poseCategories";

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
  const [filter, setFilter] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [mouthMode, setMouthMode] = useState(false);
  const [mute, setMute] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const ch = chars.find((c) => c.id === cid) ?? chars[0];
  if (!ch) return null;
  const hasP = ch.poses.some((p) => p.key.startsWith("pose_p_"));
  const lk = hasP ? look : "h";
  const all = ch.poses.filter((p) => p.key.startsWith(`pose_${lk}_`));
  const talks = (p: { talkSrc?: string; src: string }) => !!p.talkSrc && p.talkSrc !== p.src;
  const poses = filterPoses(all, s.poseCats, filter).filter((p) => !mute || !talks(p));
  const mouthPose = mouthMode ? all.find((p) => p.id === editId) : undefined;
  const myMouths = s.library.filter((x) => x.kind === "talk");
  const editPose = editing ? all.find((p) => p.id === editId) : undefined;
  const changed = Object.keys(s.poseCats).length;
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
      <Card
        title={`${ch.name} · ${poses.length} poses`}
        right={
          <div className="row">
            {!mouthMode && (
              <button type="button" className={`btn btn-small ${editing ? "btn-primary" : "btn-ghost"}`} onClick={() => { setEditing(!editing); setEditId(null); }}>
                {editing ? "✓ Hecho" : "✎ Cambiar categorías"}
              </button>
            )}
            {!editing && (
              <button type="button" className={`btn btn-small ${mouthMode ? "btn-primary" : "btn-ghost"}`} onClick={() => { setMouthMode(!mouthMode); setEditId(null); }}>
                {mouthMode ? "✓ Hecho" : "👄 Dar boca"}
              </button>
            )}
            {!editing && !mouthMode && <button type="button" className="btn btn-ghost btn-small" onClick={() => pick.setMany(items, !allOn)}>{allOn ? "Quitar todas" : "Seleccionar todas"}</button>}
          </div>
        }
      >
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
        <CategoryFilter poses={all} cats={s.poseCats} value={filter} onChange={setFilter} />
        <label className="g-check"><input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} /> Solo las que aún no hablan ({all.filter((p) => !talks(p)).length})</label>
        {mouthMode && (mouthPose ? (
          <MouthEditor key={mouthPose.id} s={s} pose={mouthPose} charName={ch.name} onClose={() => setEditId(null)} />
        ) : (
          <div className="cat-edit">
            <p className="fine">Toca una pose para darle boca: marcas dónde está la boca y la app dibuja la boca abierta (o subes la misma pose con la boca abierta, hecha con ChatGPT). Las que ya hablan llevan 👄.</p>
            {myMouths.length > 0 && (
              <button type="button" className="btn btn-secondary btn-small" onClick={async () => {
                const files = await Promise.all(myMouths.map(async (it) => ({ name: `${it.id.replace(/^talk:char\./, "").replace(".pose_", "_")}_boca.png`, data: new Uint8Array(await it.blob.arrayBuffer()) })));
                const url = URL.createObjectURL(makeZip(files));
                const a = document.createElement("a");
                a.href = url;
                a.download = `bocas-punetos-${files.length}.zip`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
              }}>
                ⬇ Descargar mis {myMouths.length} boca(s) (.zip) para Claude
              </button>
            )}
          </div>
        ))}
        {editing && (
          <div className="cat-edit">
            {editPose ? (
              <>
                <div className="cat-edit-head">
                  <img src={editPose.src} alt="" />
                  <div>
                    <b>{editPose.key.replace(/^pose_[hp]_/, "")}</b>
                    <p className="fine">Toca las categorías para ponerlas o quitarlas (puede tener varias).</p>
                  </div>
                </div>
                <div className="chips">
                  {POSE_CATEGORIES.map((c) => {
                    const mine = poseCategoriesOf(editPose.id, editPose.key, s.poseCats);
                    const on = mine.includes(c.id);
                    return (
                      <button key={c.id} type="button" className={`chip${on ? " on" : ""}`} onClick={() => s.setPoseCats(editPose.id, on ? mine.filter((x) => x !== c.id) : [...mine, c.id])}>
                        {c.icon} {c.label}
                      </button>
                    );
                  })}
                </div>
                {s.poseCats[editPose.id] && (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => s.setPoseCats(editPose.id, null)}>
                    ↺ Volver a la clasificación automática ({autoCategories(editPose.key).join(", ")})
                  </button>
                )}
              </>
            ) : (
              <p className="fine">Toca una pose para cambiar sus categorías.</p>
            )}
            {changed > 0 && (
              <button type="button" className="btn btn-secondary btn-small" onClick={async () => { const t = JSON.stringify(s.poseCats); try { await navigator.clipboard.writeText(t); alert(`${changed} cambio(s) copiados. Pégaselos a Claude para que se queden igual en todos los dispositivos.`); } catch { prompt("Copia esto:", t); } }}>
                📋 Copiar mis {changed} cambio(s) de categorías para Claude
              </button>
            )}
          </div>
        )}
        <ul className="lib-grid lib-grid-poses">
          {poses.map((p, i) => (
            <li key={p.id} className={`lib-item pickable${editing || mouthMode ? (p.id === editId ? " picked" : "") : pick.has(p.id) ? " picked" : ""}`} onClick={() => (editing || mouthMode ? setEditId(p.id) : pick.toggle(p.id, items[i].name, p.src))}>
              <img src={p.src} alt="" loading="lazy" />
              <code>{p.key.replace(/^pose_[hp]_/, "")}</code>
              <CategoryIcons pose={p} cats={s.poseCats} />
              {talks(p) ? <small className="fine">👄 habla{s.library.some((x) => x.id === `talk:${p.id}`) ? " (tuya)" : ""}</small> : null}
            </li>
          ))}
        </ul>
        <p className="fine">En el guion se usan con «gesto» (por ejemplo «gesto»: «{poses[1]?.key.replace(/^pose_[hp]_/, "") ?? "neutro"}»). 👄 = mueve la boca al hablar.</p>
      </Card>
    </>
  );
}
