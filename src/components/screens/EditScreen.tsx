"use client";

import { useEffect, useMemo, useState } from "react";
import { findCharacter } from "@/lib/catalog";
import type { Actor, PocketEvent, PocketProject, Take, Track } from "@/lib/schema/pocket";
import { LIMITS } from "@/lib/schema/pocket";
import { estimateSpeechDuration } from "@/lib/schema/validate";
import { evaluateTake, sortedEvents } from "@/lib/timeline/evaluate";
import { listVoices, onVoicesReady, speak, stopSpeaking } from "@/lib/tts";
import { previewVoice, unlockAudio } from "@/lib/voice/piper";
import { playSound } from "@/lib/sfx/player";
import { Stage } from "../Stage";
import { HeadPreview } from "../HeadPreview";
import { TimelineLanes } from "../TimelineLanes";
import { arrangeTake } from "@/lib/timeline/arrange";
import { deskFor, guessDesk, swapEvents, transformEvents, typingEvents } from "@/lib/timeline/desk";
import type { Catalog } from "@/lib/catalog/types";
import type { PocketState } from "../usePocket";
import { Card, Field, IssueList, Stepper } from "../ui";

const TRACK_LABEL: Record<Track, string> = { dialogue: "💬 Diálogo", body: "🧍 Cuerpo", face: "🙂 Cara", mouth: "👄 Boca", eyes: "👀 Ojos", props: "📦 Objeto", sfx: "🔊 Sonido", screen: "🎬 Pantalla" };
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
  const [view, setView] = useState<"capas" | "lista">("capas");
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

  /** Cambio seco de imagen en el instante del cursor (misma posición y escala). */
  const swapProp = (eventId: string, toPropId: string) => {
    const from = take.events.find((e) => e.id === eventId);
    if (!from || from.track !== "props" || !toPropId) return;
    const r = swapEvents(from, toPropId, t, uniqueId(take, "sw"));
    if (!r) return alert("Pon el cursor dentro de la duración del objeto (no en sus extremos).");
    editTake((tk) => {
      tk.events = tk.events.map((e) => (e.id === eventId ? r.from : e));
      tk.events.push(r.add);
    });
    setSelEvent(r.add.id);
  };

  /** Transformación: el objeto se convierte en otro en el mismo sitio, con pantallazo y destello. */
  const transformProp = (eventId: string, toPropId: string) => {
    const from = take.events.find((e) => e.id === eventId);
    if (!from || from.track !== "props" || !toPropId) return;
    const at = r1(Math.max(from.start, Math.min(t, take.duration - 0.8)));
    const used = new Set(take.events.map((e) => e.id));
    const newId = (p: string) => {
      let i = 1;
      while (used.has(`${p}${i}`)) i++;
      used.add(`${p}${i}`);
      return `${p}${i}`;
    };
    const r = transformEvents(take, from, toPropId, at, newId);
    editTake((tk) => {
      tk.events = tk.events.map((e) => (e.id === eventId ? r.from : e));
      tk.events.push(...r.add);
    });
  };
  const [deskPick, setDeskId] = useState<string | null>(null);
  const deskId = deskPick && catalog.props.some((p) => p.id === deskPick) ? deskPick : guessDesk(catalog)?.id ?? catalog.props[0]?.id ?? "";

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
    if (!uid && track !== "props" && track !== "sfx" && track !== "screen") return;
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
        ev = { id, track, propId: catalog.props[0].id, layer: "props-front", x: 540, y: 1500, start, duration: fit(2), enter: "pop", exit: "fade" };
        break;
      case "sfx": {
        const snd = catalog.sounds?.[0];
        ev = { id, track, soundId: snd?.id ?? "sfx_pop", start, duration: fit(snd?.duration ?? 1) };
        break;
      }
      case "screen":
        ev = { id, track, effect: "flash", color: "#ff2a2a", start, duration: fit(1.5) };
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

      <Card
        title={`Línea de tiempo (${take.events.length})`}
        right={
          <div className="view-toggle" role="radiogroup">
            <button type="button" className={view === "capas" ? "on" : ""} onClick={() => setView("capas")}>Capas</button>
            <button type="button" className={view === "lista" ? "on" : ""} onClick={() => setView("lista")}>Lista</button>
          </div>
        }
      >
        <div className="add-row">
          {(["dialogue", "body", "face", "eyes", "props", "sfx", "screen", "mouth"] as Track[]).map((tr) => (
            <button key={tr} type="button" className="btn btn-small" onClick={() => addEvent(tr)} disabled={take.events.length >= LIMITS.maxEventsPerTake}>
              ＋ {TRACK_LABEL[tr]}
            </button>
          ))}
        </div>
        <p className="fine">Se añaden en el tiempo actual ({t.toFixed(1)} s) para el personaje seleccionado{selActor ? ` (${actorName(selActor)})` : ""}.</p>
        {view === "capas" ? (
          <>
            <TimelineLanes
              take={take}
              catalog={catalog}
              t={t}
              selectedId={selEvent}
              onSeek={(x) => setT(x)}
              onSelect={(id, uid) => { setSelEvent(id); if (uid) setSelActor(uid); }}
              onRetime={(id, start, duration) => editEvent(id, (e) => { e.start = start; e.duration = duration; })}
              summary={(e) => summary(e, s)}
            />
            {selectedEvent && (
              <div className="event open">
                <div className="event-row" style={{ cursor: "default" }}>
                  <span className="ev-time">{selectedEvent.start.toFixed(1)}s</span>
                  <span className="ev-track">{TRACK_LABEL[selectedEvent.track]}</span>
                  <span className="ev-actor">{selectedEvent.track === "props" ? catalog.props.find((p) => p.id === selectedEvent.propId)?.label : actorName(selectedEvent.actorUid)}</span>
                  <span className="ev-sum">{summary(selectedEvent, s)}</span>
                </div>
                <EventEditor s={s} take={take} ev={selectedEvent} voices={voices} t={t} onTransform={(to) => transformProp(selectedEvent.id, to)} onSwap={(to) => swapProp(selectedEvent.id, to)} onChange={(fn) => editEvent(selectedEvent.id, fn)} onDelete={() => { editTake((tk) => { tk.events = tk.events.filter((x) => x.id !== selectedEvent.id); }); setSelEvent(null); }} />
              </div>
            )}
          </>
        ) : (
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
                {open && <EventEditor s={s} take={take} ev={e} voices={voices} t={t} onTransform={(to) => transformProp(e.id, to)} onSwap={(to) => swapProp(e.id, to)} onChange={(fn) => editEvent(e.id, fn)} onDelete={() => { editTake((tk) => { tk.events = tk.events.filter((x) => x.id !== e.id); }); setSelEvent(null); }} />}
              </li>
            );
          })}
        </ul>
        )}
      </Card>

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

      <Card title="Capas de escena">
        <ul className="layer-list">
          {[...take.actors].sort((x, y) => y.zIndex - x.zIndex).map((a, i, arr) => (
            <li key={a.uid} className={a.uid === selActor ? "on" : ""}>
              <button type="button" className="layer-name" onClick={() => setSelActor(a.uid)}>
                <b>{findCharacter(catalog, a.characterId)?.name ?? a.characterId}</b>
                <small>{findCharacter(catalog, a.characterId)?.poses.find((p) => p.id === a.poseId)?.label} · profundidad {a.zIndex}</small>
              </button>
              <button type="button" className="btn btn-small" aria-label="Traer delante" disabled={i === 0} onClick={() => editTake((tk) => {
                const other = tk.actors.find((x) => x.uid === arr[i - 1].uid)!;
                const me = tk.actors.find((x) => x.uid === a.uid)!;
                [me.zIndex, other.zIndex] = [other.zIndex === me.zIndex ? me.zIndex + 1 : other.zIndex, me.zIndex];
              })}>▲</button>
              <button type="button" className="btn btn-small" aria-label="Enviar detrás" disabled={i === arr.length - 1} onClick={() => editTake((tk) => {
                const other = tk.actors.find((x) => x.uid === arr[i + 1].uid)!;
                const me = tk.actors.find((x) => x.uid === a.uid)!;
                [me.zIndex, other.zIndex] = [other.zIndex === me.zIndex ? me.zIndex - 1 : other.zIndex, me.zIndex];
              })}>▼</button>
            </li>
          ))}
        </ul>
        <p className="fine">Arriba = delante. El fondo siempre va detrás; los objetos «delante» siempre encima.</p>
        <button type="button" className="btn btn-secondary" disabled={take.actors.length < 2} onClick={() => editTake((tk) => { Object.assign(tk, arrangeTake(tk)); })}>
          👥 Colocar a todos en escena ({take.actors.length})
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
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => {
                const st = frame.actors.find((a) => a.uid === selA.uid);
                s.setFaceTarget({ characterId: selA.characterId, poseId: st?.poseId ?? selA.poseId, expressionId: st?.expressionId });
                s.setTab("caras");
              }}
            >
              🙂 Ajustar su cara en esta pose ({selCh.poses.find((p) => p.id === (frame.actors.find((a) => a.uid === selA.uid)?.poseId ?? selA.poseId))?.label})
            </button>
            <div className="row">
              <label className="switch"><input type="checkbox" checked={!!selA.flip} onChange={(e) => editActor(selA.uid, (a) => { a.flip = e.target.checked || undefined; })} /><span>Mirar a la izquierda (espejo)</span></label>
              <label className="switch"><input type="checkbox" checked={!!selA.hidden} onChange={(e) => editActor(selA.uid, (a) => { a.hidden = e.target.checked || undefined; })} /><span>Empieza fuera de escena (entra con un evento de cuerpo)</span></label>
            </div>
            <div className="row">
              <select className="chip-select" value={deskId} onChange={(e) => setDeskId(e.target.value)} aria-label="Objeto escritorio">
                {catalog.props.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const ev = deskFor(catalog, take, selA, deskId, uniqueId(take, "desk"));
                  if (!ev) return;
                  editTake((tk) => {
                    tk.events = tk.events.filter((e) => !(e.track === "props" && e.actorUid === selA.uid && e.propId === deskId));
                    tk.events.push(ev);
                  });
                  setSelEvent(ev.id);
                }}
              >
                🪑 Sentar en escritorio
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const start = r1(Math.min(t, Math.max(0, take.duration - 0.5)));
                  const a = uniqueId(take, "type");
                  const evs = typingEvents(selA, start, r1(Math.max(0.5, Math.min(3, take.duration - start))), [a, a + "_sfx"]);
                  editTake((tk) => tk.events.push(...evs));
                  setSelEvent(a);
                }}
              >
                ⌨️ Teclear aquí
              </button>
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

    </div>
  );
}

const LOOP_LABEL: Record<string, string> = { none: "Quieto", shake: "Vibrar", pulse: "Latir", blink: "Parpadear", float: "Flotar", spin: "Girar", type: "Teclear (de espaldas)" };
const ENTER_LABEL: Record<string, string> = { none: "De golpe", pop: "Pop", fade: "Fundido", slide: "Deslizar" };
const SCREEN_LABEL: Record<string, string> = { flash: "Destello", shake: "Temblor", darken: "Oscurecer", bluescreen: "Pantallazo azul" };
const FX_LABEL: Record<string, string> = { jump: "Saltar (susto)", shake: "Temblar", type: "Teclear" };
const PRESENCE_LABEL: Record<string, string> = { fade: "fundido", pop: "pop", flash: "destello", cut: "de golpe" };

function summary(e: PocketEvent, s: PocketState): string {
  switch (e.track) {
    case "dialogue": return `${e.actorUid ? "" : e.voiceOf ? `🔈 ${s.catalog.characters.find((c) => c.id === e.voiceOf)?.name ?? e.voiceOf}: ` : "🎙️ "}“${e.text}”`;
    case "body": return [
      e.appear ? `▶ entra (${PRESENCE_LABEL[e.appear]})` : e.disappear ? `⏏ sale (${PRESENCE_LABEL[e.disappear]})` : "",
      e.poseId ? s.catalog.characters.flatMap((c) => c.poses).find((p) => p.id === e.poseId)?.label : undefined,
      e.x !== undefined ? `→ ${Math.round(e.x)},${Math.round(e.y ?? 0)}` : "",
      e.fx ? FX_LABEL[e.fx] : "",
    ].filter(Boolean).join(" ");
    case "face": return s.catalog.characters.flatMap((c) => c.expressions).find((x) => x.id === e.expressionId)?.label ?? e.expressionId ?? "";
    case "eyes": return `mirada ${e.gazeX.toFixed(1)}, ${e.gazeY.toFixed(1)}`;
    case "mouth": return e.mode;
    case "props": return [s.catalog.props.find((p) => p.id === e.propId)?.label, e.bubbleOf ? "💭" : "", e.loop && e.loop !== "none" ? LOOP_LABEL[e.loop] : ""].filter(Boolean).join(" · ");
    case "sfx": return s.catalog.sounds?.find((x) => x.id === e.soundId)?.label ?? e.soundId;
    case "screen": return SCREEN_LABEL[e.effect];
  }
}

function EventEditor({ s, take, ev, voices, t, onTransform, onSwap, onChange, onDelete }: { s: PocketState; take: Take; ev: PocketEvent; voices: SpeechSynthesisVoice[]; t: number; onTransform: (toPropId: string) => void; onSwap: (toPropId: string) => void; onChange: (fn: (e: PocketEvent) => void) => void; onDelete: () => void }) {
  const [toProp, setToProp] = useState("");
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
      {(ev.actorUid !== undefined || ev.track === "dialogue") && ev.track !== "props" && (
        <Field label={ev.track === "dialogue" ? "Quién habla" : "Personaje"}>
          <select
            value={ev.actorUid ?? (ev.track === "dialogue" && ev.voiceOf ? `voz:${ev.voiceOf}` : "")}
            onChange={(e) =>
              onChange((x) => {
                const o = x as { actorUid?: string; voiceOf?: string };
                delete o.voiceOf;
                if (e.target.value.startsWith("voz:")) {
                  delete o.actorUid;
                  o.voiceOf = e.target.value.slice(4);
                } else if (e.target.value) o.actorUid = e.target.value;
                else delete o.actorUid;
              })
            }
          >
            {take.actors.map((a) => <option key={a.uid} value={a.uid}>{findCharacter(catalog, a.characterId)?.name} ({a.uid})</option>)}
            {ev.track === "dialogue" && <option value="">🎙️ Narrador (voz en off)</option>}
            {ev.track === "dialogue" && catalog.characters.map((c) => <option key={c.id} value={`voz:${c.id}`}>🔈 Voz de {c.name} (sin personaje en escena)</option>)}
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
            <button type="button" className="btn btn-secondary" onClick={() => {
              stopSpeaking();
              if (!actor) return;
              // voz de alta calidad (Piper) con el reparto del proyecto; si falla, la del navegador
              previewVoice(ev.text, actor.characterId, s.project.metadata.voices).catch(() => speak(ev.text, { ...ev.voice, lang: s.project.metadata.language, defaults: ch?.defaultVoice }));
            }}>▶ Probar voz</button>
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
            <Field label="Efecto">
              <select value={ev.fx ?? ""} onChange={(e) => onChange((x) => { if (x.track === "body") x.fx = (e.target.value || undefined) as "shake" | "jump" | "type" | undefined; })}>
                <option value="">Ninguno</option>
                {Object.entries(FX_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Entrar / salir de escena">
              <select
                value={ev.appear ? `in:${ev.appear}` : ev.disappear ? `out:${ev.disappear}` : ""}
                onChange={(e) =>
                  onChange((x) => {
                    if (x.track !== "body") return;
                    const [dir, kind] = e.target.value.split(":") as [string, "fade" | "pop" | "flash" | "cut"];
                    delete x.appear;
                    delete x.disappear;
                    if (dir === "in") x.appear = kind;
                    if (dir === "out") x.disappear = kind;
                  })
                }
              >
                <option value="">(sigue igual)</option>
                {Object.entries(PRESENCE_LABEL).map(([k, v]) => <option key={`in${k}`} value={`in:${k}`}>Entra · {v}</option>)}
                {Object.entries(PRESENCE_LABEL).map(([k, v]) => <option key={`out${k}`} value={`out:${k}`}>Sale · {v}</option>)}
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
                <HeadPreview catalog={catalog} characterId={ch.id} poseId={poseAt(take, actor.uid, ev.start, catalog)} expressionId={x.id} size={96} fluid />
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
          <div className="row">
            <select className="chip-select" value={toProp} onChange={(e) => setToProp(e.target.value)} aria-label="Transformar en">
              <option value="">Cambiar / transformar en…</option>
              {catalog.props.filter((p) => p.id !== ev.propId).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button type="button" className="btn btn-secondary" disabled={!toProp} onClick={() => { onSwap(toProp); setToProp(""); }}>
              🔁 Cambiar en {t.toFixed(1)} s
            </button>
            <button type="button" className="btn btn-secondary" disabled={!toProp} onClick={() => { onTransform(toProp); setToProp(""); }}>
              ✨ Transformar en {t.toFixed(1)} s
            </button>
          </div>
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
            <Field label="Giro (°)"><Stepper value={ev.rot ?? 0} step={15} min={-180} max={180} onChange={(v) => onChange((x) => { if (x.track === "props") x.rot = v || undefined; })} /></Field>
            <Field label="Aparece">
              <select value={ev.enter ?? "none"} onChange={(e) => onChange((x) => { if (x.track === "props") x.enter = e.target.value as "none"; })}>
                {Object.entries(ENTER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Desaparece">
              <select value={ev.exit ?? "none"} onChange={(e) => onChange((x) => { if (x.track === "props") x.exit = e.target.value as "none"; })}>
                {Object.entries(ENTER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Mientras está">
              <select value={ev.loop ?? "none"} onChange={(e) => onChange((x) => { if (x.track === "props") x.loop = e.target.value as "none"; })}>
                {Object.entries(LOOP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="En bocadillo de">
              <select value={ev.bubbleOf ?? ""} onChange={(e) => onChange((x) => { if (x.track === "props") x.bubbleOf = e.target.value || undefined; })}>
                <option value="">(no: en la escena)</option>
                {take.actors.map((a) => <option key={a.uid} value={a.uid}>💭 {findCharacter(catalog, a.characterId)?.name}</option>)}
              </select>
            </Field>
          </div>
          <label className="switch">
            <input type="checkbox" checked={ev.toX !== undefined} onChange={(e) => onChange((x) => { if (x.track !== "props") return; if (e.target.checked) { x.toX = x.x + 300; x.toY = x.y; } else { delete x.toX; delete x.toY; } })} />
            <span>Moverse durante el evento</span>
          </label>
          {ev.toX !== undefined && (
            <div className="grid2">
              <Field label="Hasta X"><Stepper value={ev.toX} step={20} min={-LIMITS.margin} max={1080 + LIMITS.margin} onChange={(v) => onChange((x) => { if (x.track === "props") x.toX = v; })} /></Field>
              <Field label="Hasta Y"><Stepper value={ev.toY ?? ev.y} step={20} min={0} max={1920 + LIMITS.margin} onChange={(v) => onChange((x) => { if (x.track === "props") x.toY = v; })} /></Field>
            </div>
          )}
        </>
      )}

      {ev.track === "sfx" && (
        <div className="grid2">
          <Field label="Sonido">
            <select value={ev.soundId} onChange={(e) => onChange((x) => { if (x.track === "sfx") { x.soundId = e.target.value; const d = catalog.sounds?.find((z) => z.id === e.target.value)?.duration; if (d) x.duration = Math.min(d, take.duration - x.start); } })}>
              {(catalog.sounds ?? []).map((x) => <option key={x.id} value={x.id}>{x.user ? "★ " : ""}{x.label}</option>)}
            </select>
          </Field>
          <Field label="Volumen"><Stepper value={ev.volume ?? 1} step={0.1} min={0} max={1} onChange={(v) => onChange((x) => { if (x.track === "sfx") x.volume = v; })} /></Field>
          <button type="button" className="btn btn-secondary" onClick={async () => { await unlockAudio(); void playSound(catalog, ev.soundId, ev.volume ?? 1); }}>▶ Escuchar</button>
        </div>
      )}

      {ev.track === "screen" && (
        <div className="grid2">
          <Field label="Efecto">
            <select value={ev.effect} onChange={(e) => onChange((x) => { if (x.track === "screen") x.effect = e.target.value as "flash"; })}>
              {Object.entries(SCREEN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {ev.effect === "flash" && (
            <Field label="Color">
              <input type="color" value={ev.color ?? "#ff2a2a"} onChange={(e) => onChange((x) => { if (x.track === "screen") x.color = e.target.value; })} />
            </Field>
          )}
          {ev.effect === "bluescreen" && (
            <Field label="Texto del pantallazo">
              <input type="text" maxLength={120} placeholder="Tu equipo se ha puñetizado." value={ev.text ?? ""} onChange={(e) => onChange((x) => { if (x.track === "screen") x.text = e.target.value || undefined; })} />
            </Field>
          )}
        </div>
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
