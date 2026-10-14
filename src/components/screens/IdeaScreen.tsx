"use client";

import { useEffect, useRef, useState } from "react";
import { DURATIONS, TONES } from "@/lib/generator/prompt";
import { dictationSupported, startDictation } from "@/lib/tts";
import type { PocketState } from "../usePocket";
import { Card, Field } from "../ui";

export function IdeaScreen({ s }: { s: PocketState }) {
  const { intent, setIntent, catalog } = s;
  const [listening, setListening] = useState(false);
  const [dictErr, setDictErr] = useState<string | null>(null);
  const [canDictate, setCanDictate] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => setCanDictate(dictationSupported()), []);

  const toggleChar = (id: string) => {
    const has = intent.characterIds.includes(id);
    const next = has ? intent.characterIds.filter((c) => c !== id) : [...intent.characterIds, id];
    setIntent({ ...intent, characterIds: next });
  };

  const dictate = () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setDictErr(null);
    const stop = startDictation(
      (t) => setIntent({ ...intent, idea: (intent.idea ? intent.idea + " " : "") + t }),
      (err) => {
        setListening(false);
        if (err) setDictErr(err === "not-allowed" ? "Permiso de micrófono denegado." : `Dictado no disponible (${err}).`);
      },
    );
    if (stop) {
      stopRef.current = stop;
      setListening(true);
    }
  };

  return (
    <div className="screen">
      <Card title="1 · Tu idea">
        <Field label="¿De qué va el sketch?">
          <textarea
            rows={4}
            maxLength={800}
            placeholder="Ej.: Usu intenta devolver una planta muerta a la floristería y el Jefe resulta ser el florista."
            value={intent.idea}
            onChange={(e) => setIntent({ ...intent, idea: e.target.value })}
          />
        </Field>
        {canDictate && (
          <button type="button" className={`btn btn-secondary${listening ? " btn-live" : ""}`} onClick={dictate}>
            {listening ? "■ Parar dictado" : "🎙 Dictar idea"}
          </button>
        )}
        {dictErr && <p className="error-text">{dictErr}</p>}
      </Card>

      <Card title="Duración">
        <div className="chips" role="radiogroup">
          {DURATIONS.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={intent.duration === d} className={`chip${intent.duration === d ? " on" : ""}`} onClick={() => setIntent({ ...intent, duration: d })}>
              {d} s
            </button>
          ))}
        </div>
      </Card>

      <Card title="Personajes">
        <div className="chips">
          {catalog.characters.map((c) => {
            const on = intent.characterIds.includes(c.id);
            return (
              <button key={c.id} type="button" aria-pressed={on} className={`chip chip-char${on ? " on" : ""}`} style={{ ["--c" as string]: c.color }} onClick={() => toggleChar(c.id)}>
                <img src={c.poses[0]?.src} alt="" />
                {c.name}
              </button>
            );
          })}
        </div>
        {intent.characterIds.length === 0 && <p className="error-text">Elige al menos un personaje.</p>}
      </Card>

      <Card title="Tono y escenario">
        <div className="chips">
          {TONES.map((t) => (
            <button key={t.id} type="button" className={`chip${intent.tone === t.id ? " on" : ""}`} onClick={() => setIntent({ ...intent, tone: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
        <Field label="Escenario">
          <select value={intent.backgroundId ?? ""} onChange={(e) => setIntent({ ...intent, backgroundId: e.target.value || null })}>
            <option value="">Que elija el guionista</option>
            {catalog.backgrounds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <button type="button" className="btn btn-primary btn-block" disabled={intent.characterIds.length === 0} onClick={() => s.setTab("generar")}>
        Siguiente: generar →
      </button>
    </div>
  );
}
