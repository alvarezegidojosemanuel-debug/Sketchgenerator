"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Catalog, ExpressionPrefab, FaceAsset, FaceRig, FaceSlot, PartRef, SlotAdjust } from "@/lib/catalog/types";
import { applyOverrides, emotionLabel, emptyOverrides, FACE_SLOTS, findCharacter, variantStatus } from "@/lib/catalog";
import { salvageOverrides, slotLabel, validateOverrides, withExpression, withoutEntry, withRig } from "@/lib/face/overrides";
import { downloadText } from "@/lib/import-export";
import { HeadPreview } from "../HeadPreview";
import type { PocketState } from "../usePocket";
import { Card, Field, IssueList } from "../ui";

type Mode = "pose" | "expr";
const r2 = (n: number) => Math.round(n * 100) / 100;

function assetsFor(slot: FaceSlot, face: { eyes: FaceAsset[]; brows: FaceAsset[]; mouths: FaceAsset[] }) {
  return slot === "mouth" ? face.mouths : slot.startsWith("eye") ? face.eyes : face.brows;
}

export function FaceScreen({ s }: { s: PocketState }) {
  const { catalog, localFace, saveFace } = s;
  const target = s.faceTarget;
  const [charId, setCharId] = useState(target?.characterId ?? catalog.characters[0].id);
  const ch = findCharacter(catalog, charId) ?? catalog.characters[0];
  const [poseId, setPoseId] = useState(target?.poseId ?? ch.poses[0].id);
  const [exprId, setExprId] = useState(target?.expressionId ?? ch.expressions[0].id);
  const [slot, setSlot] = useState<FaceSlot>("mouth");
  const [mode, setMode] = useState<Mode>("expr");
  const [step, setStep] = useState(2);
  const [talk, setTalk] = useState(false);
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<{ path: string; message: string }[]>([]);
  const [newName, setNewName] = useState("");
  const [cameFromEditor] = useState(Boolean(target));
  useEffect(() => {
    if (target) s.setFaceTarget(null);
  }, [target, s]);

  // Borradores de trabajo (no se guardan hasta pulsar Guardar)
  const pose = ch.poses.find((p) => p.id === poseId) ?? ch.poses[0];
  const savedPrefab = ch.expressions.find((e) => e.id === exprId) ?? ch.expressions[0];
  // Borradores ligados a SU pose / expresión: al cambiar de pose nunca se arrastran ajustes de otra.
  const [rigDraft, setRigDraft] = useState<{ id: string; rig: FaceRig | undefined } | null>(null);
  const [prefabDraft, setPrefabDraft] = useState<ExpressionPrefab | null>(null);
  const rig = rigDraft && rigDraft.id === pose.id ? rigDraft.rig : pose.rig;
  const prefab = prefabDraft && prefabDraft.id === savedPrefab.id ? prefabDraft : savedPrefab;
  const setRig = (fn: (r: FaceRig | undefined) => FaceRig | undefined) => setRigDraft({ id: pose.id, rig: fn(structuredClone(rig)) });
  const setPrefab = (fn: (p: ExpressionPrefab) => ExpressionPrefab) => setPrefabDraft(fn(structuredClone(prefab)));
  useEffect(() => {
    if (!ch.poses.some((p) => p.id === poseId)) setPoseId(ch.poses[0].id);
    if (!ch.expressions.some((e) => e.id === exprId)) setExprId(ch.expressions[0].id);
  }, [ch, poseId, exprId]);
  useEffect(() => {
    if (!talk) return;
    const h = setInterval(() => setTick((t) => t + 1), 220);
    return () => clearInterval(h);
  }, [talk]);

  // Comparación sin metadatos (al guardar, el estado pasa a "calibrated": no es un cambio del usuario).
  const rigKey = (r: FaceRig | undefined) => JSON.stringify(r ? { ...r, status: undefined, source: undefined, review: undefined } : null);
  const dirtyRig = rigKey(rig) !== rigKey(pose.rig);
  const dirtyPrefab = JSON.stringify(prefab) !== JSON.stringify(savedPrefab);
  const [autoState, setAutoState] = useState<"saved" | "pending" | "error">("saved");

  // Guardado automático: cada ajuste se escribe en este dispositivo (IndexedDB) al momento.
  // ovRef guarda la última versión escrita para que dos cambios seguidos no se pisen.
  const ovRef = useRef(localFace);
  useEffect(() => {
    ovRef.current = localFace;
  }, [localFace]);
  const persist = useCallback(
    async (snap: { rig?: FaceRig; poseId: string; prefab?: ExpressionPrefab; charId: string }) => {
      try {
        let ov = ovRef.current;
        if (snap.rig) ov = withRig(ov, catalog, snap.poseId, snap.rig);
        if (snap.prefab) ov = withExpression(ov, catalog, snap.charId, snap.prefab);
        if (!ov) return;
        ovRef.current = ov;
        await saveFace(ov);
        setAutoState("saved");
      } catch {
        setAutoState("error");
      }
    },
    [catalog, saveFace],
  );
  useEffect(() => {
    if (!dirtyRig && !dirtyPrefab) return;
    setAutoState("pending");
    // Inmediato (sin espera): así nada se pierde al cambiar de pose, de pestaña o cerrar la app.
    void persist({ rig: dirtyRig ? rig : undefined, poseId: pose.id, prefab: dirtyPrefab ? prefab : undefined, charId: ch.id });
  }, [rig, prefab, dirtyRig, dirtyPrefab, pose.id, ch.id, persist]);

  // Catálogo de previsualización con los borradores aplicados
  const preview: Catalog = useMemo(() => {
    const ov = emptyOverrides(catalog);
    if (rig) ov.rigs[pose.id] = rig;
    ov.expressions[prefab.id] = { ...prefab, characterId: ch.id };
    return applyOverrides(catalog, ov);
  }, [catalog, rig, prefab, pose.id, ch.id]);

  const mouthNow = talk && prefab.talk.length ? (tick % 2 ? prefab.talk[(tick >> 1) % prefab.talk.length] : undefined) : undefined;
  const st = variantStatus(pose, savedPrefab);
  const slotAvailable = (sl: FaceSlot) => Boolean(rig?.[sl]);
  const part: PartRef | null | undefined = slot === "mouth" ? prefab.mouth : prefab[slot];

  // --- edición de posición ---
  const adjust = (dx: number, dy: number, dscale = 1, drot = 0) => {
    if (mode === "pose") {
      setRig((r) => {
        if (!r?.[slot]) return r;
        const t = r[slot]!;
        return { ...r, [slot]: { x: r2(t.x + dx), y: r2(t.y + dy), scale: r2(t.scale * dscale * 1000) / 1000, rot: r2((t.rot ?? 0) + drot) } };
      });
    } else {
      setPrefab((p) => {
        const po = { ...(p.poseOverrides ?? {}) };
        const cur: SlotAdjust = { ...(po[pose.id]?.[slot] ?? {}) };
        cur.dx = r2((cur.dx ?? 0) + dx);
        cur.dy = r2((cur.dy ?? 0) + dy);
        cur.dscale = r2((cur.dscale ?? 1) * dscale * 1000) / 1000;
        cur.rot = r2((cur.rot ?? 0) + drot);
        po[pose.id] = { ...(po[pose.id] ?? {}), [slot]: cur };
        return { ...p, poseOverrides: po };
      });
    }
  };

  const setPart = (next: PartRef | null) => {
    setPrefab((p) => (slot === "mouth" ? (next ? { ...p, mouth: next } : p) : { ...p, [slot]: next }));
  };

  // --- guardar ---
  const savePrefab = (asFinal: boolean) => {
    // pasa por el guardado automático
    setPrefab((p) => ({ ...p, status: asFinal ? "final" : p.status }));
    setMsg(`Expresión «${prefab.label}» marcada como revisada.`);
  };
  const resetRig = async () => {
    // Al quitar el override, el catálogo efectivo vuelve al rig estimado y el efecto recarga el borrador.
    setRigDraft(null);
    if (ovRef.current?.rigs[pose.id]) {
      ovRef.current = withoutEntry(ovRef.current, "rig", pose.id);
      await saveFace(ovRef.current);
    }
    setMsg("Calibración local eliminada.");
  };
  const resetPrefab = async () => {
    setPrefabDraft(null);
    if (ovRef.current?.expressions[prefab.id]) {
      ovRef.current = withoutEntry(ovRef.current, "expression", prefab.id);
      await saveFace(ovRef.current);
    }
    setMsg("Cambios locales de la expresión eliminados.");
  };
  const createExpression = async () => {
    const slug = newName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);
    if (!slug) return;
    const id = `expression.${ch.id}.${slug}`;
    if (ch.expressions.some((e) => e.id === id)) {
      setMsg("Ya existe una expresión con ese nombre.");
      return;
    }
    const e: ExpressionPrefab = { ...structuredClone(prefab), id, label: newName.trim().slice(0, 60), status: "draft", custom: true, poseOverrides: {} };
    ovRef.current = withExpression(ovRef.current, catalog, ch.id, e);
    await saveFace(ovRef.current);
    setExprId(id);
    setNewName("");
    setMsg(`Expresión «${e.label}» creada a partir de «${prefab.label}».`);
  };

  const exportAll = () => {
    downloadText("pocket-face-overrides.json", JSON.stringify(localFace ?? emptyOverrides(catalog), null, 2) + "\n");
  };
  const importFile = async (f?: File) => {
    if (!f) return;
    setImportErrors([]);
    try {
      const raw = JSON.parse(await f.text());
      const full = validateOverrides(raw, catalog);
      const { value, dropped } = salvageOverrides(raw, catalog);
      if (!value) {
        setImportErrors(full.errors);
        return;
      }
      if (dropped.length) setImportErrors(full.errors);
      const v = { value };
      const merged = localFace ? structuredClone(localFace) : emptyOverrides(catalog);
      Object.assign(merged.rigs, v.value.rigs);
      Object.assign(merged.expressions, v.value.expressions);
      merged.updatedAt = new Date().toISOString();
      await saveFace(merged);
      setMsg(`Importadas ${Object.keys(v.value.rigs).length} calibraciones y ${Object.keys(v.value.expressions).length} expresiones.`);
    } catch {
      setImportErrors([{ path: "$", message: "El archivo no es JSON válido." }]);
    }
  };

  const assets = assetsFor(slot, ch.face);
  const curAdj = prefab.poseOverrides?.[pose.id]?.[slot];
  const curT = rig?.[slot];

  return (
    <div className="screen">
      {cameFromEditor && (
        <button type="button" className="btn btn-secondary btn-block" onClick={() => s.setTab("editar")}>
          ← Volver al editor
        </button>
      )}
      <Card title="Personaje y pose">
        <div className="chips">
          {catalog.characters.map((c) => (
            <button key={c.id} type="button" className={`chip${c.id === charId ? " on" : ""}`} onClick={() => { setCharId(c.id); setPoseId(c.poses[0].id); setExprId(c.expressions[0].id); }}>
              {c.name}
            </button>
          ))}
        </div>
        <Field label="Pose">
          <select value={pose.id} onChange={(e) => setPoseId(e.target.value)}>
            {ch.poses.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} {p.rig?.status === "calibrated" ? "✓" : "· estimada"}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card title="Expresiones" right={<span className="muted">{ch.name} · {pose.label}</span>}>
        <div className="expr-grid">
          {ch.expressions.map((e) => (
            <button key={e.id} type="button" className={`expr-tile${e.id === exprId ? " on" : ""}`} onClick={() => setExprId(e.id)}>
              <HeadPreview catalog={catalog} characterId={ch.id} poseId={pose.id} expressionId={e.id} size={110} fluid />
              <span>{e.label}{e.status === "final" ? " ✓" : ""}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title={`Editar: ${prefab.label}`}>
        <div className="status-row">
          <span className={`badge ${st.rig === "calibrated" ? "badge-ok" : "badge-warn"}`}>Posición pose: {st.rig === "calibrated" ? "calibrada" : "estimada (sin calibrar)"}</span>
          <span className={`badge ${st.prefab === "final" ? "badge-ok" : "badge-warn"}`}>Expresión: {st.prefab === "final" ? "revisada" : "borrador"}</span>
          {st.poseSpecific && <span className="badge">ajuste propio en esta pose</span>}
          <span className="badge">{emotionLabel(catalog, prefab.emotion)}</span>
        </div>
        {pose.rig?.review && <p className="error-text">⚠ {pose.rig.review}</p>}
        <div className="row" style={{ justifyContent: "center" }}>
          <HeadPreview catalog={preview} characterId={ch.id} poseId={pose.id} expressionId={prefab.id} mouthAssetId={mouthNow} size={300} view={0.75} highlight={slot} onDrag={(dx, dy) => adjust(dx, dy)} />
        </div>
        <label className="switch">
          <input type="checkbox" checked={talk} onChange={(e) => setTalk(e.target.checked)} />
          <span>Probar boca hablando</span>
        </label>

        <div className="slot-tabs" role="tablist">
          {FACE_SLOTS.map((sl) => (
            <button key={sl} type="button" className={slot === sl ? "on" : ""} disabled={!slotAvailable(sl)} onClick={() => setSlot(sl)}>
              {slotLabel(sl)}
            </button>
          ))}
        </div>
        {!ch.hasEyes && <p className="fine">{ch.name} no tiene piezas de ojos: las gafas de sol forman parte del cuerpo.</p>}

        <div className="chips" role="radiogroup" aria-label="Qué ajustar">
          <button type="button" className={`chip${mode === "expr" ? " on" : ""}`} onClick={() => setMode("expr")}>Solo esta expresión en esta pose</button>
          <button type="button" className={`chip${mode === "pose" ? " on" : ""}`} onClick={() => setMode("pose")}>Calibrar la pose (todas las expresiones)</button>
        </div>
        <div className="row">
          <div className="pad" aria-label="Mover pieza">
            <span className="c" />
            <button type="button" onClick={() => adjust(0, -step)} aria-label="Arriba">↑</button>
            <span className="c" />
            <button type="button" onClick={() => adjust(-step, 0)} aria-label="Izquierda">←</button>
            <span className="c">{step}px</span>
            <button type="button" onClick={() => adjust(step, 0)} aria-label="Derecha">→</button>
            <span className="c" />
            <button type="button" onClick={() => adjust(0, step)} aria-label="Abajo">↓</button>
            <span className="c" />
          </div>
          <div className="col-btns">
            <button type="button" className="btn btn-small" onClick={() => adjust(0, 0, 1.04)}>＋ Grande</button>
            <button type="button" className="btn btn-small" onClick={() => adjust(0, 0, 1 / 1.04)}>－ Pequeño</button>
            <button type="button" className="btn btn-small" onClick={() => adjust(0, 0, 1, -3)}>↺ Girar</button>
            <button type="button" className="btn btn-small" onClick={() => adjust(0, 0, 1, 3)}>↻ Girar</button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setStep(step === 2 ? 8 : 2)}>Paso: {step === 2 ? "fino" : "grueso"}</button>
          </div>
        </div>
        <p className="fine">
          {mode === "pose"
            ? curT && `Slot ${slotLabel(slot)}: x ${curT.x.toFixed(0)}, y ${curT.y.toFixed(0)}, escala ${curT.scale.toFixed(2)}`
            : `Ajuste de «${prefab.label}» en ${pose.label}: dx ${(curAdj?.dx ?? 0).toFixed(0)}, dy ${(curAdj?.dy ?? 0).toFixed(0)}, escala ×${(curAdj?.dscale ?? 1).toFixed(2)}`}
          . También puedes arrastrar sobre la cara.
        </p>

        <Field label={`Pieza para ${slotLabel(slot)}`}>
          <div className="asset-grid">
            {slot !== "mouth" && (
              <button type="button" className={`asset-btn none${!part ? " on" : ""}`} onClick={() => setPart(null)}>
                ninguna
              </button>
            )}
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                title={a.note ?? a.name}
                className={`asset-btn${part?.assetId === a.id ? " on" : ""}`}
                onClick={() =>
                  setPart({
                    ...(part ?? {}),
                    assetId: a.id,
                    crop: a.kind === "pair" ? (slot.endsWith("R") ? "right" : "left") : undefined,
                    flip: a.kind === "pair" ? false : slot === "browR" ? true : part?.flip,
                  })
                }
              >
                <img src={a.src} alt={a.name} />
              </button>
            ))}
          </div>
        </Field>
        {part && (
          <div className="row">
            {assets.find((a) => a.id === part.assetId)?.kind === "pair" && (
              <div className="chips">
                {(["left", "right", undefined] as const).map((c) => (
                  <button key={String(c)} type="button" className={`chip${part.crop === c ? " on" : ""}`} onClick={() => setPart({ ...part, crop: c })}>
                    {c === "left" ? "Mitad izq." : c === "right" ? "Mitad der." : "Completa"}
                  </button>
                ))}
              </div>
            )}
            <label className="switch">
              <input type="checkbox" checked={Boolean(part.flip)} onChange={(e) => setPart({ ...part, flip: e.target.checked || undefined })} />
              <span>Espejo</span>
            </label>
          </div>
        )}
        {assets.find((a) => a.id === part?.assetId)?.note && <p className="fine">⚠ {assets.find((a) => a.id === part?.assetId)?.note}</p>}
        {slot === "mouth" && (
          <Field label="Bocas para hablar (lip-sync)">
            <div className="asset-grid">
              {ch.face.mouths.map((a) => {
                const on = prefab.talk.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`asset-btn${on ? " on" : ""}`}
                    onClick={() => setPrefab((p) => ({ ...p, talk: on ? p.talk.filter((t) => t !== a.id) : [...p.talk, a.id].slice(0, 8) }))}
                  >
                    <img src={a.src} alt={a.name} />
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <p className={autoState === "error" ? "error-text" : "fine"} role="status">
          {autoState === "pending" ? "Guardando…" : autoState === "error" ? "⚠ No se pudo guardar en este navegador (¿modo privado?). Exporta las caras para no perderlas." : "✓ Guardado automáticamente en este dispositivo"}
        </p>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => savePrefab(true)}>✓ Marcar expresión como revisada</button>
          {localFace?.rigs[pose.id] && <button type="button" className="btn btn-danger" onClick={resetRig}>Quitar calibración local</button>}
          {localFace?.expressions[prefab.id] && <button type="button" className="btn btn-danger" onClick={resetPrefab}>Quitar cambios de la expresión</button>}
        </div>
        {msg && <p className="fine">✓ {msg}</p>}
      </Card>

      <Card title="Nueva expresión">
        <p className="fine">Se crea a partir de la expresión seleccionada; después cambia sus piezas y guárdala.</p>
        <div className="row">
          <input placeholder="Nombre (p. ej. Pícaro)" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} />
          <button type="button" className="btn btn-secondary" disabled={!newName.trim()} onClick={createExpression}>Crear</button>
        </div>
      </Card>

      <Card title="Copia de seguridad de las caras">
        <p className="fine">
          Calibraciones y expresiones se guardan en este navegador. Exporta el archivo para pasarlo a otro dispositivo o para incorporarlo al repositorio
          (<code>src/data/face-overrides.json</code>) y que lo use todo el mundo.
        </p>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={exportAll}>⬇ Exportar caras</button>
          <label className="btn btn-secondary file-btn">
            ⬆ Importar caras
            <input type="file" accept=".json,application/json" onChange={(e) => importFile(e.target.files?.[0])} />
          </label>
        </div>
        <p className="fine">
          Guardado: {Object.keys(localFace?.rigs ?? {}).length} poses calibradas · {Object.keys(localFace?.expressions ?? {}).length} expresiones.
        </p>
        <IssueList errors={importErrors} />
      </Card>
    </div>
  );
}
