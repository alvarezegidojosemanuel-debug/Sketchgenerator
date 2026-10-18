"use client";

import { useEffect, useRef, useState } from "react";
import type { Pose } from "@/lib/catalog/types";
import { ANIM_MOVES, animDuration, animationsFor, cleanAnimation, type AnimLibrary, type AnimMove, type Animation } from "@/lib/animation/animations";
import { poseShortKey } from "@/lib/catalog/poseCategories";
import { CategoryFilter, filterPoses } from "../PoseCategories";
import type { PocketState } from "../usePocket";
import { Card, Field } from "../ui";

/**
 * ANIMACIONES: cada personaje tiene las suyas (andar, correr, reírse…), hechas juntando sus poses con su tiempo.
 * Luego se eligen en las columnas del editor de guion.
 */
export function AnimScreen({ s }: { s: PocketState }) {
  const chars = s.catalog.characters.filter((c) => c.poses.some((p) => /^pose_[hp]_/.test(p.key)));
  const [cid, setCid] = useState(chars[0]?.id ?? "");
  const [look, setLook] = useState<"p" | "h">("p");
  const [name, setName] = useState<string | null>(null);
  const [filter, setFilter] = useState<string[]>([]);
  const ch = chars.find((c) => c.id === cid) ?? chars[0];
  if (!ch) return null;
  const hasP = ch.poses.some((p) => p.key.startsWith("pose_p_"));
  const lk = hasP ? look : "h";
  const poses = ch.poses.filter((p) => p.key.startsWith(`pose_${lk}_`));
  const poseOf = (k: string) => poses.find((p) => poseShortKey(p.key) === k);
  const list = animationsFor(ch.id, s.animLib);
  const cur = list.find((a) => a.nombre === name) ?? null;
  const mineCount = Object.values(s.animLib).reduce((n, l) => n + l.length, 0);

  const save = (a: Animation, oldName = a.nombre) => {
    const lib: AnimLibrary = { ...s.animLib, [ch.id]: [...(s.animLib[ch.id] ?? []).filter((x) => x.nombre !== oldName && x.nombre !== a.nombre), a] };
    s.setAnimLib(lib);
    setName(a.nombre);
  };
  const edit = (fn: (a: Animation) => void) => {
    if (!cur) return;
    const a = structuredClone(cur);
    const old = a.nombre;
    fn(a);
    save(a, old);
  };
  const create = (base?: Animation) => {
    let n = base?.nombre ?? "andar";
    for (let i = 2; list.some((a) => a.nombre === n); i++) n = `${base?.nombre ?? "andar"}${i}`;
    const walk = ["camina", "camina2"].filter((k) => poseOf(k));
    const frames = base
      ? base.frames.map((f) => ({ ...f, pose: poseOf(f.pose) ? f.pose : poseShortKey(poses[0]?.key ?? "neutro") }))
      : (walk.length ? walk : [poseShortKey(poses[0]?.key ?? "neutro")]).map((pose) => ({ pose, dur: 0.22 }));
    save({ nombre: n, frames, bucle: base?.bucle ?? true, mov: base?.mov ?? "bote" });
  };
  const others = chars.filter((c) => c.id !== ch.id).flatMap((c) => animationsFor(c.id, s.animLib).map((a) => ({ c, a })));

  return (
    <div className="screen anim-screen">
      <div className="chips">
        {chars.map((c) => (
          <button key={c.id} type="button" className={`chip${c.id === ch.id ? " on" : ""}`} onClick={() => { setCid(c.id); setName(null); }}>
            {c.name}
          </button>
        ))}
      </div>

      <Card title={`Animaciones de ${ch.name}`}>
        <div className="chips">
          {list.map((a) => (
            <button key={a.nombre} type="button" className={`chip${a.nombre === cur?.nombre ? " on" : ""}`} onClick={() => setName(a.nombre)}>
              🎞 {a.nombre}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => create()}>＋ Nueva</button>
          {others.length > 0 && (
            <select className="chip chip-select" value="" onChange={(e) => { const o = others[Number(e.target.value)]; if (o) create(o.a); }} aria-label="Copiar de otro personaje">
              <option value="">⧉ Copiar de otro personaje…</option>
              {others.map((o, i) => <option key={i} value={i}>{o.c.name} · {o.a.nombre}</option>)}
            </select>
          )}
        </div>
        {!list.length && <p className="fine">{ch.name} aún no tiene animaciones. Crea una («andar», «reírse»…) juntando sus poses.</p>}
      </Card>

      {cur && (
        <div className="anim-edit">
          <Card title="Vista previa">
            <AnimPreview anim={cur} srcOf={(k) => poseOf(k)?.src} />
            <p className="fine">{cur.frames.length} poses · {animDuration(cur).toFixed(2)} s por vuelta{cur.bucle ? " · en bucle" : " · una vez"}</p>
          </Card>
          <Card
            title="Ajustes"
            right={<button type="button" className="btn btn-small btn-danger" onClick={() => { if (confirm(`¿Borrar la animación «${cur.nombre}»?`)) { s.setAnimLib({ ...s.animLib, [ch.id]: (s.animLib[ch.id] ?? []).filter((x) => x.nombre !== cur.nombre) }); setName(null); } }}>🗑</button>}
          >
            <Field label="Nombre">
              <input value={cur.nombre} maxLength={40} onChange={(e) => { const v = e.target.value.trim(); if (v && !list.some((a) => a.nombre === v && a !== cur)) edit((a) => { a.nombre = v; }); }} />
            </Field>
            <div className="g-grid2">
              <Field label="Se repite">
                <select value={cur.bucle ? "1" : "0"} onChange={(e) => edit((a) => { a.bucle = e.target.value === "1"; })}>
                  <option value="1">En bucle (lo que dure la acción)</option>
                  <option value="0">Una sola vez</option>
                </select>
              </Field>
              <Field label="Movimiento del cuerpo">
                <select value={cur.mov ?? "ninguno"} onChange={(e) => edit((a) => { a.mov = e.target.value as AnimMove; })}>
                  {ANIM_MOVES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Poses, en orden (toca el tiempo para cambiarlo)">
              <ol className="anim-frames">
                {cur.frames.map((f, i) => (
                  <li key={i}>
                    {poseOf(f.pose) ? <img src={poseOf(f.pose)!.src} alt="" /> : <span className="anim-missing">?</span>}
                    <small>{f.pose}</small>
                    <input type="number" step={0.02} min={0.04} max={5} value={f.dur} onChange={(e) => edit((a) => { a.frames[i].dur = Math.max(0.04, Math.min(5, Number(e.target.value) || 0.2)); })} aria-label="Segundos" />
                    <div className="anim-frame-btns">
                      <button type="button" disabled={i === 0} onClick={() => edit((a) => { [a.frames[i - 1], a.frames[i]] = [a.frames[i], a.frames[i - 1]]; })} aria-label="Antes">◀</button>
                      <button type="button" onClick={() => edit((a) => { a.frames.splice(i + 1, 0, { ...a.frames[i] }); })} aria-label="Repetir">⧉</button>
                      <button type="button" disabled={cur.frames.length < 2} onClick={() => edit((a) => { a.frames.splice(i, 1); })} aria-label="Quitar">✕</button>
                      <button type="button" disabled={i === cur.frames.length - 1} onClick={() => edit((a) => { [a.frames[i + 1], a.frames[i]] = [a.frames[i], a.frames[i + 1]]; })} aria-label="Después">▶</button>
                    </div>
                  </li>
                ))}
              </ol>
            </Field>
          </Card>
          <Card
            title="Añadir poses"
            right={
              hasP ? (
                <div className="view-toggle" role="radiogroup">
                  <button type="button" className={lk === "p" ? "on" : ""} onClick={() => setLook("p")}>Puñeto</button>
                  <button type="button" className={lk === "h" ? "on" : ""} onClick={() => setLook("h")}>Humano</button>
                </div>
              ) : undefined
            }
          >
            <p className="fine">Toca una pose para añadirla al final.</p>
            <CategoryFilter poses={poses} cats={s.poseCats} value={filter} onChange={setFilter} />
            <div className="g-poses anim-picker">
              {filterPoses(poses, s.poseCats, filter).map((p: Pose) => (
                <button key={p.id} type="button" className="g-pose" onClick={() => edit((a) => { a.frames.push({ pose: poseShortKey(p.key), dur: a.frames.at(-1)?.dur ?? 0.22 }); })} title={p.key}>
                  <img src={p.src} alt="" loading="lazy" />
                  <small>{poseShortKey(p.key).replace(/_/g, " ")}</small>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {mineCount > 0 && (
        <Card title="Para todos los dispositivos" tone="muted">
          <p className="fine">Las animaciones que creas se guardan en este dispositivo (y dentro de cada guion donde las uses). Para que salgan en la app de todos, cópialas y pégaselas a Claude.</p>
          <button type="button" className="btn btn-secondary btn-small" onClick={async () => { const t = JSON.stringify(s.animLib); try { await navigator.clipboard.writeText(t); alert("Animaciones copiadas. Pégaselas a Claude."); } catch { prompt("Copia esto:", t); } }}>
            📋 Copiar mis animaciones para Claude
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => { const t = prompt("Pega aquí animaciones copiadas de otro dispositivo:"); if (!t) return; try { const v = JSON.parse(t) as Record<string, unknown[]>; const lib: AnimLibrary = { ...s.animLib }; for (const [k, l] of Object.entries(v)) if (Array.isArray(l)) lib[k] = [...(lib[k] ?? []).filter((x) => !l.some((y) => (y as Animation)?.nombre === x.nombre)), ...l.map(cleanAnimation).filter((a): a is Animation => !!a)]; s.setAnimLib(lib); } catch { alert("No es un texto válido."); } }}>
            📥 Pegar animaciones
          </button>
        </Card>
      )}
    </div>
  );
}

/** Reproduce la animación en bucle (con su movimiento de cuerpo). */
export function AnimPreview({ anim, srcOf, height = 300 }: { anim: Animation; srcOf: (pose: string) => string | undefined; height?: number }) {
  const [t, setT] = useState(0);
  const t0 = useRef(0);
  useEffect(() => {
    let raf = 0;
    t0.current = performance.now();
    const loop = () => {
      setT((performance.now() - t0.current) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [anim]);
  const total = animDuration(anim) || 1;
  // una vez: se reproduce y espera 0.8 s antes de repetir (para verla)
  const cycle = anim.bucle ? total : total + 0.8;
  const local = t % cycle;
  let acc = 0;
  let f = anim.frames[anim.frames.length - 1];
  for (const fr of anim.frames) {
    if (local < acc + fr.dur) {
      f = fr;
      break;
    }
    acc += fr.dur;
  }
  const scale = height / 900;
  const dy = anim.mov === "bote" ? -Math.abs(Math.sin(t * 7.5)) * 22 : anim.mov === "salto" ? -Math.max(0, Math.sin((Math.PI * local) / total)) * 140 : 0;
  const dx = anim.mov === "bote" ? Math.sin(t * 7.5) * 3 : anim.mov === "tiembla" ? Math.sin(t * 60) * 9 : 0;
  const src = srcOf(f.pose);
  return (
    <div className="anim-preview" style={{ height }}>
      {src ? <img src={src} alt="" style={{ transform: `translate(${dx * scale}px, ${dy * scale}px)` }} /> : <span className="anim-missing">?</span>}
    </div>
  );
}
