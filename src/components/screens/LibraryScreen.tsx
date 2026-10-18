"use client";

import { useState } from "react";
import type { LibraryItem } from "@/lib/storage/projects";
import { PROP_SIZES, slugify } from "@/lib/library/image";
import { audioDuration, processBackground, processPropImage } from "@/lib/library/process";
import { backgroundImagePrompt, propImagePrompt, SFX_IDEAS } from "@/lib/library/prompts";
import { playSound } from "@/lib/sfx/player";
import { accessCode } from "@/lib/voice/elevenlabs";
import { unlockAudio } from "@/lib/voice/piper";
import { downloadText } from "@/lib/import-export";
import type { PocketState } from "../usePocket";
import { Card, Field } from "../ui";

type Kind = "prop" | "background" | "sound";
const KIND_LABEL: Record<Kind, string> = { prop: "Objetos", background: "Escenarios", sound: "Sonidos" };
const PREFIX: Record<Kind, string> = { prop: "prop_", background: "bg_", sound: "sfx_" };

const blobToDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); });

export function LibraryScreen({ s }: { s: PocketState }) {
  const { catalog, library, saveLibraryItem, removeLibraryItem } = s;
  const [kind, setKind] = useState<Kind>("prop");
  const [size, setSize] = useState<number>(PROP_SIZES[2].height);
  const [removeBg, setRemoveBg] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [desc, setDesc] = useState("");
  const [copied, setCopied] = useState(false);
  const [sfxText, setSfxText] = useState("");
  const [sfxDur, setSfxDur] = useState(2);

  const uniqueId = (label: string) => {
    const base = PREFIX[kind] + (slugify(label) || "recurso");
    const taken = new Set([...catalog.props.map((x) => x.id), ...catalog.backgrounds.map((x) => x.id), ...(catalog.sounds ?? []).map((x) => x.id)]);
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}_${n++}`;
    return id;
  };

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setMsg(null);
    let done = 0;
    for (const f of [...files]) {
      setBusy(`Procesando ${f.name}…`);
      const label = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 40);
      try {
        if (kind === "prop") {
          const { blob, aspect, removedBg } = await processPropImage(f, { removeBg });
          await saveLibraryItem({ id: uniqueId(label), kind, label, blob, height: size, width: Math.round(size * aspect), createdAt: Date.now() });
          if (removedBg) setMsg("Fondo eliminado automáticamente. Si se comió parte del dibujo, súbelo de nuevo desmarcando «Quitar fondo».");
        } else if (kind === "background") {
          await saveLibraryItem({ id: uniqueId(label), kind, label, blob: await processBackground(f), width: 1080, height: 1920, createdAt: Date.now() });
        } else {
          await saveLibraryItem({ id: uniqueId(label), kind, label, blob: f, width: 0, height: 0, duration: await audioDuration(f), createdAt: Date.now() });
        }
        done++;
      } catch (e) {
        setMsg(`No se pudo procesar ${f.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    setBusy(null);
    if (done) setMsg((m) => m ?? `${done} recurso(s) añadidos. Ya puedes usarlos en Editar y ChatGPT los verá en el prompt.`);
  };

  const genSfx = async () => {
    const text = sfxText;
    const duration = sfxDur;
    const code = accessCode.get();
    if (!code) return setMsg("Primero conecta ElevenLabs en Ver → Voces (código de acceso).");
    setBusy("Generando sonido con ElevenLabs…");
    try {
      const r = await fetch("/api/voice/sfx", { method: "POST", headers: { "content-type": "application/json", "x-pocket-code": code }, body: JSON.stringify({ text, duration }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `Error ${r.status}`);
      const blob = await r.blob();
      const label = text.slice(0, 40);
      await saveLibraryItem({ id: uniqueId(label), kind: "sound", label, blob, width: 0, height: 0, duration: await audioDuration(blob), createdAt: Date.now(), prompt: text });
      setMsg("Sonido generado y guardado.");
      setSfxText("");
    } catch (e) {
      setMsg(`No se pudo generar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };

  const copyPrompt = async () => {
    const text = kind === "background" ? backgroundImagePrompt(desc) : propImagePrompt(desc);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setMsg(text);
    }
  };

  const exportPack = async () => {
    const items = await Promise.all(library.map(async (x) => ({ ...x, blob: undefined, data: await blobToDataUrl(x.blob) })));
    downloadText("pocket-recursos.json", JSON.stringify({ kind: "pocket-library", version: 1, items }) + "\n");
  };
  const importPack = async (f?: File) => {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.kind !== "pocket-library" || !Array.isArray(j.items)) throw new Error("no es un paquete de recursos de Pocket");
      let n = 0;
      for (const it of j.items) {
        if (!/^(prop|bg|sfx)_[a-z0-9_]{1,40}$/.test(it.id) || !["prop", "background", "sound"].includes(it.kind) || !/^data:(image|audio)\//.test(it.data)) continue;
        const blob = await (await fetch(it.data)).blob();
        await saveLibraryItem({ id: it.id, kind: it.kind, label: String(it.label).slice(0, 60), blob, width: Number(it.width) || 0, height: Number(it.height) || 0, duration: it.duration, createdAt: Number(it.createdAt) || Date.now(), prompt: it.prompt });
        n++;
      }
      setMsg(`${n} recurso(s) importados.`);
    } catch (e) {
      setMsg(`No se pudo importar: ${e instanceof Error ? e.message : e}`);
    }
  };

  const mine = library.filter((x) => x.kind === kind);
  const builtins =
    kind === "prop" ? catalog.props.filter((p) => !p.user) : kind === "background" ? catalog.backgrounds.filter((b) => !b.user) : (catalog.sounds ?? []).filter((x) => !x.user);
  const wishlist = s.project.metadata.wishlist ?? [];

  return (
    <div className="screen">
      <div className="chips" role="tablist">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button key={k} type="button" className={`chip${k === kind ? " on" : ""}`} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {wishlist.length > 0 && (
        <Card title="Este sketch pediría…">
          <p className="fine">ChatGPT indicó que le faltaban estos recursos. Créalos y vuelve a generar el sketch:</p>
          <ul className="wish">
            {wishlist.map((w) => (
              <li key={w}>
                <span>{w}</span>
                <button type="button" className="btn btn-small btn-secondary" onClick={() => { setDesc(w); setKind(/sonido|ruido|suena/i.test(w) ? "sound" : /escenario|fondo|lugar|calle|oficina|casa/i.test(w) ? "background" : "prop"); if (/sonido|ruido|suena/i.test(w)) setSfxText(w); }}>
                  Usar
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {kind !== "sound" ? (
        <Card title={kind === "prop" ? "1 · Crea el objeto con ChatGPT" : "1 · Crea el escenario con ChatGPT"}>
          <Field label={kind === "prop" ? "¿Qué objeto?" : "¿Qué escenario?"}>
            <input value={desc} maxLength={200} placeholder={kind === "prop" ? "un dragón pequeño y gracioso de color verde" : "una cocina de piso compartido desordenada"} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={copyPrompt}>
              {copied ? "✓ Copiado" : "📋 Copiar prompt de imagen"}
            </button>
            <a className="btn btn-ghost" href={catalog.characters[0].poses[0].src} download="referencia-estilo-punetos.png">
              ⬇ Imagen de referencia
            </a>
          </div>
          <p className="fine">Pega el prompt en ChatGPT y adjunta la imagen de referencia para que copie el estilo. Descarga el resultado (PNG) y súbelo aquí abajo.</p>
        </Card>
      ) : (
        <Card title="Generar sonido con ElevenLabs">
          <Field label="Describe el sonido (mejor en inglés o español sencillo)">
            <input value={sfxText} maxLength={300} placeholder={SFX_IDEAS[0]} onChange={(e) => setSfxText(e.target.value)} />
          </Field>
          <div className="chips">
            {SFX_IDEAS.map((x) => (
              <button key={x} type="button" className="chip" onClick={() => setSfxText(x)}>
                {x}
              </button>
            ))}
          </div>
          <Field label={`Duración: ${sfxDur} s`}>
            <input type="range" min={0.5} max={10} step={0.5} value={sfxDur} onChange={(e) => setSfxDur(Number(e.target.value))} />
          </Field>
          <button type="button" className="btn btn-primary" disabled={!sfxText.trim() || busy !== null} onClick={genSfx}>
            ✨ Generar sonido
          </button>
          <p className="fine">Gasta créditos de ElevenLabs (poco). El sonido queda guardado para reutilizarlo.</p>
        </Card>
      )}

      <Card title={`2 · Sube ${KIND_LABEL[kind].toLowerCase()}`}>
        {kind === "prop" && (
          <div className="grid2">
            <Field label="Tamaño en escena">
              <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {PROP_SIZES.map((x) => (
                  <option key={x.id} value={x.height}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="switch">
              <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} />
              <span>Quitar fondo blanco</span>
            </label>
          </div>
        )}
        <label className="btn btn-primary file-btn">
          ⬆ Elegir archivos
          <input type="file" multiple accept={kind === "sound" ? "audio/*" : "image/png,image/jpeg,image/webp"} onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        </label>
        {busy && <p className="fine">⏳ {busy}</p>}
        {msg && <p className="fine">{msg}</p>}
      </Card>

      <Card title={`Tus ${KIND_LABEL[kind].toLowerCase()} (${mine.length})`}>
        {mine.length === 0 && <p className="fine">Aún no has subido ninguno. Se guardan en este dispositivo; exporta el paquete para pasarlos a otro.</p>}
        <ul className="lib-grid">
          {mine.map((it) => (
            <LibItem key={it.id} it={it} s={s} onSave={saveLibraryItem} onRemove={removeLibraryItem} />
          ))}
        </ul>
        <div className="row">
          <button type="button" className="btn btn-secondary" disabled={!library.length} onClick={exportPack}>
            ⬇ Exportar paquete de recursos
          </button>
          <label className="btn btn-secondary file-btn">
            ⬆ Importar paquete
            <input type="file" accept=".json,application/json" onChange={(e) => importPack(e.target.files?.[0])} />
          </label>
        </div>
      </Card>

      <Card title={kind === "sound" ? "Sonidos incluidos" : "Incluidos en la serie"} tone="muted">
        <ul className="lib-grid">
          {builtins.map((b) => (
            <li key={b.id} className="lib-item">
              {"src" in b && kind !== "sound" ? <img src={b.src} alt="" /> : <button type="button" className="btn btn-small" onClick={async () => { await unlockAudio(); if (!(await playSound(catalog, b.id))) setMsg("No se pudo reproducir ese sonido."); }}>▶</button>}
              <small>{b.label}</small>
              <code>{b.id}</code>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function LibItem({ it, s, onSave, onRemove }: { it: LibraryItem; s: PocketState; onSave: (i: LibraryItem) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const src = it.kind === "prop" ? s.catalog.props.find((p) => p.id === it.id)?.src : it.kind === "background" ? s.catalog.backgrounds.find((b) => b.id === it.id)?.src : undefined;
  return (
    <li className="lib-item">
      {it.kind === "sound" ? (
        <button type="button" className="btn btn-small" onClick={async () => { await unlockAudio(); if (!(await playSound(s.catalog, it.id))) alert("No se pudo reproducir: el audio está vacío o dañado. Vuelve a generarlo o súbelo de nuevo."); }}>
          ▶ {it.duration?.toFixed(1)} s
        </button>
      ) : (
        <img src={src} alt="" className={it.kind === "background" ? "bg" : undefined} />
      )}
      <input value={it.label} maxLength={60} aria-label="Nombre" onChange={(e) => void onSave({ ...it, label: e.target.value })} />
      <code>{it.id}</code>
      {it.kind === "prop" && (
        <select
          value={PROP_SIZES.reduce((best, x) => (Math.abs(x.height - it.height) < Math.abs(best.height - it.height) ? x : best)).height}
          onChange={(e) => {
            const h = Number(e.target.value);
            void onSave({ ...it, height: h, width: Math.round((it.width / it.height) * h) });
          }}
          aria-label="Tamaño"
        >
          {PROP_SIZES.map((x) => (
            <option key={x.id} value={x.height}>
              {x.label.split(" (")[0]}
            </option>
          ))}
        </select>
      )}
      {confirm ? (
        <div className="row">
          <button type="button" className="btn btn-small btn-danger" onClick={() => void onRemove(it.id)}>Borrar</button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirm(false)}>No</button>
        </div>
      ) : (
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirm(true)}>🗑</button>
      )}
    </li>
  );
}
