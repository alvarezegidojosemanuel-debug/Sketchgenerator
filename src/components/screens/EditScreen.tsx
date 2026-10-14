"use client";

import { useEffect, useMemo, useState } from "react";
import { findCharacter } from "@/lib/catalog";
import type { Actor, PocketEvent, PocketProject, Take, Track } from "@/lib/schema/pocket";
import { LIMITS } from "@/lib/schema/pocket";
import { estimateSpeechDuration } from "@/lib/schema/validate";
import { evaluateTake, sortedEvents } from "@/lib/timeline/evaluate";
import { listVoices, onVoicesReady, speak, stopSpeaking } from "@/lib/tts";
import { Stage } from "../Stage";
import { HeadPreview } from "../HeadPreview";
import type { Catalog } from "@/lib/catalog/types";
import type { PocketState } from "../usePocket";
import { Card, Field, IssueList, Stepper } from "../ui";

const TRACK_LABEL: Record<Track, string> = { dialogue: "💬 Diálogo", body: "🧍 Cuerpo", face: "🙂 Cara", mouth: "👄 Boca", eyes: "👀 Ojos", props: "📦 Objeto" };
const r1 = (n: number) => Math.round(n * 10) / 10;

function uniqueId(take: Take, prefix: string) {
  const ids = new Set(take.events.map((e) => e.id));
  let i = take.events.length + 1;
  while (ids.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function EditScreen({ s }: { s: PocketState }) {
  const { project, catalog, editProject } = s;
  const [ti, setTi] = useState(0);
  const [t, setT] = useState(0);
  const [selActor, setSelActor] = useState<string | null>(null);
  const [selEvent, setSelEvent] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const takeIndex = Math.min(ti, project.takes.length - 1);
  const take = project.takes[takeIndex];

  useEffect(() => onVoicesReady((v) => setVoices(v)), []);
  useEffect(() => setT((x) => Math.min(x, take.duration)), [take.duration]);

  const frame = useMemo(() => evaluateTake(take, catalog, t), [take, catalog, t]);
  const events = useMemo(() => sortedEvents(take), [take]);
  const actorName = (uid?: string) => {
    const a = take.actors.find((x) => x.uid === uid);
    return a ? findCharacter(catalog, a.characterId)?.name ?? a.characterId : "—";
  };

  const editTake = (fn: (tk: Take, p: PocketProject) => void) => editProject((p) => fn(p.takes[takeIndex], p));
  const editEvent = (id: string, fn: (e: PocketEvent) => void) =>
    editTake((tk) => {
      const e = tk.events.find((x) => x.id === id);
      if (e) fn(e);
    });
  const editActor = (uid: string, fn: (a: Actor) => void) =>
    editTake((tk) => {
      const a = tk.actors.find((x) => x.uid === uid);
      if (a) fn(a);
    });

  const selectedEvent = take.events.find((e) => e.id === selEvent);

  /** Arrastre: si hay un evento body seleccionado edita su destino; si no, la posición base del actor. */
  const onMoveActor = (uid: string, x: number, y: number) => {
    if (selectedEvent?.track === "body" && selectedEvent.actorUid === uid) {
      editEvent(selectedEvent.id, (e) => {
        if (e.track === "body") Object.assign(e, { x, y });
      });
    } else {
      editActor(uid, (a) => Object.assign(a, { x, y }));
    }
  };

  const addEvent = (track: Track) => {
    const uid = selActor ?? take.actors[0]?.uid;
    if (!uid && track !== "props") return;
    const actor = take.actors.find((a) => a.uid === uid);
    const ch = actor ? findCharacter(catalog, actor.characterId) : undefined;
    const start = r1(Math.min(t, Math.max(0, take.duration - 0.5)));
    const id = uniqueId(take, "e");
    const fit = (d: number) => r1(Math.max(0.1, Math.min(d, take.duration - start)));
    let ev: PocketEvent;
    switch (track) {
      case "dialogue":
        ev = { id, track, actorUid: uid!, start, duration: fit(1.5), text: "…" };
        break;
      case "body":
        ev = { id, track, actorUid: uid!, start, duration: fit(0.6), poseId: actor?.poseId };
        break;
      case "face":
        ev = { id, track, actorUid: uid!, start, duration: fit(0.4), expressionId: ch?.fallbackExpressionId };
        break;
      case "eyes":
        ev = { id, track, actorUid: uid!, start, duration: fit(0.4), gazeX: 0.8, gazeY: 0 };
        break;
      case "mouth":
        ev = { id, track, actorUid: uid!, start, duration: fit(take.duration - start), mode: "auto" };
        break;
      case "props":
        ev = { id, track, propId: catalog.props[0].id, layer: "props-front", x: 540, y: 1500, start, duration: fit(2) };
        break;
    }
    editTake((tk) => tk.events.push(ev));
    setSelEvent(id);
  };

  const addTake = () => {
    editProject((p) => {
      const prev = p.takes[takeIndex];
      const ids = new Set(p.takes.map((x) => x.id));
      let n = p.takes.length + 1;
      while (ids.has(`take_${n}`)) n++;
      // Nueva toma: mismos actores en su estado final de la toma actual.
      const end = evaluateTake(prev, catalog, prev.duration);
      p.takes.splice(takeIndex + 1, 0, {
        id: `take_${n}`,
        name: `Toma ${n}`,
        duration: 5,
        backgroundId: prev.backgroundId,
        actors: end.actors.map((a) => ({ uid: a.uid, characterId: a.characterId, poseId: a.poseId, x: Math.round(a.x), y: Math.round(a.y), scale: r1(a.scale), zIndex: a.zIndex, flip: a.flip || undefined, expressionId: a.expressionId })),
        events: [],
      });
    });
    setTi(takeIndex + 1);
    setT(0);
  };

  const addActor = (characterId: string) => {
    const ch = findCharacter(catalog, characterId);
    if (!ch) return;
    let uid = ch.id;
    let n = 2;
    while (take.actors.some((a) => a.uid === uid)) uid = `${ch.id}${n++}`;
    editTake((tk) => tk.actors.push({ uid, characterId: ch.id, poseId: ch.poses[0].id, x: 540, y: 1780, scale: 1, zIndex: tk.actors.length + 1 }));
    setSelActor(uid);
  };

  const selA = take.actors.find((a) => a.uid === selActor);
  const selCh = selA ? findCharacter(catalog, selA.characterId) : undefined;

  return (
    <div className="screen">
      <div className="chips take-tabs">
        {project.takes.map((tk, i) => (
          <button key={tk.id} type="button" className={`chip${i === takeIndex ? " on" : ""}`} onClick={() => { setTi(i); setT(0); setSelEvent(null); }}>
            {i + 1}. {tk.name ?? tk.id}
          </button>
        ))}
        <button type="button" className="chip" onClick={addTake} disabled={project.takes.length >= LIMITS.maxTakes}>＋ Toma</button>
      </div>

      {s.issues.length > 0 && <IssueList errors={s.issues} max={5} />}

      <Stage catalog={catalog} frame={frame} maxHeight="48vh" selectedUid={selActor} onSelectActor={(uid) => setSelActor(uid)} onMoveActor={onMoveActor} />
      <div className="scrub">
        <input type="range" min={0} max={take.duration} step={0.05} value={t} onChange={(e) => setT(Number(e.target.value))} aria-label="Tiempo de edición" />
        <span className="time">{t.toFixed(2)} s / {take.duration} s</span>
      </div>
      <p className="fine">Arrastra un personaje para moverlo. Con un evento «Cuerpo» seleccionado, arrastrar cambia su destino.</p>

      <Card title="Toma">
        <div className="grid2">
          <Field label="Nombre">
            <input value={take.name ?? ""} maxLength={LIMITS.maxTitleLength} onChange={(e) => editTake((tk) => { tk.name = e.target.value; })} />
          </Field>
          <Field label="Duración (s)">
            <Stepper value={take.duration} step={0.5} min={0.5} max={LIMITS.maxTakeDuration} onChange={(v) => editTake((tk) => { tk.duration = v; })} />
          </Field>
        </div>
        <Field label="Fondo">
          <select value={take.backgroundId ?? ""} onChange={(e) => editTake((tk) => { tk.backgroundId = e.target.value || null; })}>
            <option value="">(sin fondo)</option>
            {catalog.backgrounds.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </Field>
        <button
          type="button"
          className="btn btn-danger"
          disabled={project.takes.length <= 1}
          onClick={() => {
            if (!confirm("¿Borrar esta toma?")) return;
            editProject((p) => { p.takes.splice(takeIndex, 1); });
            setTi(Math.max(0, takeIndex - 1));
          }}
        >
          Borrar toma
        </button>
      </Card>

      <Card title="Personajes en escena">
        <div className="chips">
          {take.actors.map((a) => (
            <button key={a.uid} type="button" className={`chip${a.uid === selActor ? " on" : ""}`} onClick={() => setSelActor(a.uid === selActor ? null : a.uid)}>
              {findCharacter(catalog, a.characterId)?.name ?? a.characterId} <small>({a.uid})</small>
            </button>
          ))}
          <select className="chip-select" value="" onChange={(e) => e.target.value && addActor(e.target.value)} disabled={take.actors.length >= LIMITS.maxActorsPerTake}>
            <option value="">＋ Añadir…</option>
            {catalog.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {selA && selCh && (
          <div className="sub-editor">
            <div className="grid2">
              <Field label="Pose inicial">
                <select value={selA.poseId} onChange={(e) => editActor(selA.uid, (a) => { a.poseId = e.target.value; })}>
                  {selCh.poses.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Expresión inicial">
                <select value={selA.expressionId ?? selCh.fallbackExpressionId} onChange={(e) => editActor(selA.uid, (a) => { a.expressionId = e.target.value; })}>
                  {selCh.expressions.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </Field>
              <Field label="X"><Stepper value={selA.x} step={20} min={-LIMITS.margin} max={1080 + LIMITS.margin} onChange={(v) => editActor(selA.uid, (a) => { a.x = v; })} /></Field>
              <Field label="Y (pies)"><Stepper value={selA.y} step={20} min={0} max={1920 + LIMITS.margin} onChange={(v) => editActor(selA.uid, (a) => { a.y = v; })} /></Field>
              <Field label="Escala"><Stepper value={selA.scale} step={0.05} min={LIMITS.minScale} max={LIMITS.maxScale} onChange={(v) => editActor(selA.uid, (a) => { a.scale = v; })} /></Field>
              <Field label="Profundidad"><Stepper value={selA.zIndex} step={1} min={-100} max={100} onChange={(v) => editActor(selA.uid, (a) => { a.zIndex = Math.round(v); })} /></Field>
            </div>
            <div className="row">
              <label className="switch"><input type="checkbox" checked={!!selA.flip} onChange={(e) => editActor(selA.uid, (a) => { a.flip = e.target.checked || undefined; })} /><span>Mirar a la izquierda (espejo)</span></label>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (!confirm("¿Quitar este personaje y sus eventos de la toma?")) return;
                  editTake((tk) => {
                    tk.actors = tk.actors.filter((a) => a.uid !== selA.uid);
                    tk.events = tk.events.filter((e) => e.actorUid !== selA.uid);
                  });
                  setSelActor(null);
                }}
              >
                Quitar
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card title={`Eventos (${take.events.length})`}>
        <div className="add-row">
          {(["dialogue", "body", "face", "eyes", "props", "mouth"] as Track[]).map((tr) => (
            <button key={tr} type="button" className="btn btn-small" onClick={() => addEvent(tr)} disabled={take.events.length >= LIMITS.maxEventsPerTake}>
              ＋ {TRACK_LABEL[tr]}
            </button>
          ))}
        </div>
        <p className="fine">Se añaden en el tiempo actual ({t.toFixed(1)} s) para el personaje seleccionado.</p>
        <ul className="event-list">
          {events.map((e) => {
            const open = e.id === selEvent;
            return (
              <li key={e.id} className={`event track-${e.track}${open ? " open" : ""}`}>
                <button type="button" className="event-row" onClick={() => { setSelEvent(open ? null : e.id); if (!open) { setT(Math.min(take.duration, e.start + Math.min(0.2, e.duration / 2))); if (e.actorUid) setSelActor(e.actorUid); } }}>
                  <span className="ev-time">{e.start.toFixed(1)}s</span>
                  <span className="ev-track">{TRACK_LABEL[e.track]}</span>
                  <span className="ev-actor">{e.track === "props" ? catalog.props.find((p) => p.id === e.propId)?.label : actorName(e.actorUid)}</span>
                  <span className="ev-sum">{summary(e, s)}</span>
                </button>
                {open && <EventEditor s={s} take={take} ev={e} voices={voices} onChange={(fn) => editEvent(e.id, fn)} onDelete={() => { editTake((tk) => { tk.events = tk.events.filter((x) => x.id !== e.id); }); setSelEvent(null); }} />}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function summary(e: PocketEvent, s: PocketState): string {
  switch (e.track) {
    case "dialogue": return `“${e.text}”`;
    case "body": return [e.poseId ? s.catalog.characters.flatMap((c) => c.poses).find((p) => p.id === e.poseId)?.label : undefined, e.x !== undefined ? `→ ${Math.round(e.x)},${Math.round(e.y ?? 0)}` : ""].filter(Boolean).join(" ");
    case "face": return s.catalog.characters.flatMap((c) => c.expressions).find((x) => x.id === e.expressionId)?.label ?? e.expressionId ?? "";
    case "eyes": return `mirada ${e.gazeX.toFixed(1)}, ${e.gazeY.toFixed(1)}`;
    case "mouth": return e.mode;
    case "props": return e.layer === "props-back" ? "detrás" : "delante";
  }
}

function EventEditor({ s, take, ev, voices, onChange, onDelete }: { s: PocketState; take: Take; ev: PocketEvent; voices: SpeechSynthesisVoice[]; onChange: (fn: (e: PocketEvent) => void) => void; onDelete: () => void }) {
  const { catalog } = s;
  const actor = take.actors.find((a) => a.uid === ev.actorUid);
  const ch = actor ? findCharacter(catalog, actor.characterId) : undefined;
  const maxStart = Math.max(0, take.duration - 0.1);

  return (
    <div className="sub-editor">
      <div className="grid2">
        <Field label="Inicio (s)"><Stepper value={ev.start} step={0.1} min={0} max={maxStart} onChange={(v) => onChange((e) => { e.start = v; })} /></Field>
        <Field label="Duración (s)"><Stepper value={ev.duration} step={0.1} min={0.1} max={LIMITS.maxTakeDuration} onChange={(v) => onChange((e) => { e.duration = v; })} /></Field>
      </div>
      {ev.actorUid !== undefined && ev.track !== "props" && (
        <Field label="Personaje">
          <select value={ev.actorUid} onChange={(e) => onChange((x) => { (x as { actorUid: string }).actorUid = e.target.value; })}>
            {take.actors.map((a) => <option key={a.uid} value={a.uid}>{findCharacter(catalog, a.characterId)?.name} ({a.uid})</option>)}
          </select>
        </Field>
      )}

      {ev.track === "dialogue" && (
        <>
          <Field label="Texto" hint={`${ev.text.length}/${LIMITS.maxTextLength} · duración sugerida ${estimateSpeechDuration(ev.text)} s`}>
            <textarea rows={3} maxLength={LIMITS.maxTextLength} value={ev.text} onChange={(e) => onChange((x) => { if (x.track === "dialogue") x.text = e.target.value; })} />
          </Field>
          <div className="grid2">
            <Field label="Velocidad"><Stepper value={ev.voice?.rate ?? ch?.defaultVoice.rate ?? 1} step={0.05} min={0.5} max={2} onChange={(v) => onChange((x) => { if (x.track === "dialogue") x.voice = { ...x.voice, rate: v }; })} /></Field>
            <Field label="Tono"><Stepper value={ev.voice?.pitch ?? ch?.defaultVoice.pitch ?? 1} step={0.05} min={0} max={2} onChange={(v) => onChange((x) => { if (x.track === "dialogue") x.voice = { ...x.voice, pitch: v }; })} /></Field>
          </div>
          <Field label="Voz del dispositivo">
            <select value={ev.voice?.voiceName ?? ""} onChange={(e) => onChange((x) => { if (x.track === "dialogue") x.voice = { ...x.voice, voiceName: e.target.value || undefined }; })}>
              <option value="">Predeterminada</option>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
            </select>
          </Field>
          <div className="row">
            <button type="button" className="btn btn-secondary" onClick={() => { stopSpeaking(); speak(ev.text, { ...ev.voice, lang: s.project.metadata.language, defaults: ch?.defaultVoice }); }}>▶ Probar voz</button>
            <button type="button" className="btn btn-ghost" onClick={() => onChange((x) => { if (x.track === "dialogue") x.duration = estimateSpeechDuration(x.text); })}>Ajustar duración al texto</button>
          </div>
          {voices.length === 0 && <p className="fine">No hay voces disponibles en este navegador (o aún se están cargando).</p>}
        </>
      )}

      {ev.track === "body" && ch && (
        <>
          <Field label="Pose">
            <select value={ev.poseId ?? ""} onChange={(e) => onChange((x) => { if (x.track === "body") x.poseId = e.target.value || undefined; })}>
              <option value="">(mantener)</option>
              {ch.poses.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <label className="switch">
            <input type="checkbox" checked={ev.x !== undefined} onChange={(e) => onChange((x) => { if (x.track !== "body") return; if (e.target.checked) { x.x = actor?.x ?? 540; x.y = actor?.y ?? 1780; } else { delete x.x; delete x.y; } })} />
            <span>Desplazar a un destino</span>
          </label>
          {ev.x !== undefined && (
            <div className="grid2">
              <Field label="Destino X"><Stepper value={ev.x} step={20} min={-LIMITS.margin} max={1080 + LIMITS.margin} onChange={(v) => onChange((x) => { if (x.track === "body") x.x = v; })} /></Field>
              <Field label="Destino Y"><Stepper value={ev.y ?? 1780} step={20} min={0} max={1920 + LIMITS.margin} onChange={(v) => onChange((x) => { if (x.track === "body") x.y = v; })} /></Field>
            </div>
          )}
          <div className="grid2">
            <Field label="Movimiento">
              <select value={ev.ease ?? "inOut"} onChange={(e) => onChange((x) => { if (x.track === "body") x.ease = e.target.value as "linear" | "inOut" | "instant"; })}>
                <option value="inOut">Suave</option><option value="linear">Lineal</option><option value="instant">Instantáneo</option>
              </select>
            </Field>
            <Field label="Orientación">
              <select value={ev.flip === undefined ? "" : ev.flip ? "1" : "0"} onChange={(e) => onChange((x) => { if (x.track === "body") x.flip = e.target.value === "" ? undefined : e.target.value === "1"; })}>
                <option value="">(mantener)</option><option value="0">Derecha</option><option value="1">Izquierda</option>
              </select>
            </Field>
          </div>
        </>
      )}

      {ev.track === "face" && ch && actor && (
        <Field label="Expresión (vista en la pose de ese momento)">
          <div className="expr-grid">
            {ch.expressions.map((x) => (
              <button key={x.id} type="button" className={`expr-tile${x.id === ev.expressionId ? " on" : ""}`} onClick={() => onChange((e) => { if (e.track === "face") e.expressionId = x.id; })}>
                <HeadPreview catalog={catalog} characterId={ch.id} poseId={poseAt(take, actor.uid, ev.start, catalog)} expressionId={x.id} size={96} />
                <span>{x.label}{x.status === "final" ? " ✓" : ""}</span>
              </button>
            ))}
          </div>
        </Field>
      )}

      {ev.track === "eyes" && (
        <div className="gaze-pad" onPointerDown={(e) => setGaze(e, onChange)} onPointerMove={(e) => e.buttons && setGaze(e, onChange)}>
          <span className="gaze-dot" style={{ left: `${(ev.gazeX + 1) * 50}%`, top: `${(ev.gazeY + 1) * 50}%` }} />
          <span className="fine">Toca para dirigir la mirada</span>
        </div>
      )}

      {ev.track === "mouth" && (
        <>
          <Field label="Modo de boca">
            <select value={ev.mode} onChange={(e) => onChange((x) => { if (x.track === "mouth") x.mode = e.target.value as "auto" | "calibrated"; })}>
              <option value="auto">Automática (anclaje del catálogo)</option>
              <option value="calibrated">Calibrada a mano</option>
            </select>
          </Field>
          {ev.mode === "calibrated" && (
            <div className="grid2">
              <Field label="Desplazar X"><Stepper value={ev.dx ?? 0} step={2} min={-400} max={400} onChange={(v) => onChange((x) => { if (x.track === "mouth") x.dx = v; })} /></Field>
              <Field label="Desplazar Y"><Stepper value={ev.dy ?? 0} step={2} min={-400} max={400} onChange={(v) => onChange((x) => { if (x.track === "mouth") x.dy = v; })} /></Field>
            </div>
          )}
        </>
      )}

      {ev.track === "props" && (
        <>
          <div className="grid2">
            <Field label="Objeto">
              <select value={ev.propId} onChange={(e) => onChange((x) => { if (x.track === "props") x.propId = e.target.value; })}>
                {catalog.props.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Capa">
              <select value={ev.layer} onChange={(e) => onChange((x) => { if (x.track === "props") x.layer = e.target.value as "props-back" | "props-front"; })}>
                <option value="props-front">Delante</option><option value="props-back">Detrás</option>
              </select>
            </Field>
            <Field label="X"><Stepper value={ev.x} step={20} min={-LIMITS.margin} max={1080 + LIMITS.margin} onChange={(v) => onChange((x) => { if (x.track === "props") x.x = v; })} /></Field>
            <Field label="Y (base)"><Stepper value={ev.y} step={20} min={0} max={1920 + LIMITS.margin} onChange={(v) => onChange((x) => { if (x.track === "props") x.y = v; })} /></Field>
            <Field label="Escala"><Stepper value={ev.scale ?? 1} step={0.1} min={LIMITS.minScale} max={LIMITS.maxScale} onChange={(v) => onChange((x) => { if (x.track === "props") x.scale = v; })} /></Field>
          </div>
        </>
      )}

      <button type="button" className="btn btn-danger" onClick={onDelete}>Borrar evento</button>
    </div>
  );
}

function setGaze(e: React.PointerEvent<HTMLDivElement>, onChange: (fn: (e: PocketEvent) => void) => void) {
  const r = e.currentTarget.getBoundingClientRect();
  const gx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
  const gy = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
  onChange((x) => { if (x.track === "eyes") { x.gazeX = r1(gx); x.gazeY = r1(gy); } });
}

function poseAt(take: Take, uid: string, t: number, catalog: Catalog): string {
  const st = evaluateTake(take, catalog, t + 0.001).actors.find((a) => a.uid === uid);
  return st?.poseId ?? take.actors.find((a) => a.uid === uid)?.poseId ?? "";
}
