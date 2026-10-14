"use client";

import type { ReactNode } from "react";
import type { Issue } from "@/lib/schema/validate";

export function Card({ title, children, tone, right }: { title: ReactNode; children: ReactNode; tone?: "accent" | "muted"; right?: ReactNode }) {
  return (
    <section className={`card${tone ? ` card-${tone}` : ""}`}>
      <header className="card-head">
        <h2>{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

export function IssueList({ errors, warnings, notes, max = 12 }: { errors?: Issue[]; warnings?: Issue[]; notes?: string[]; max?: number }) {
  if (!errors?.length && !warnings?.length && !notes?.length) return null;
  return (
    <div className="issues" role="status">
      {errors && errors.length > 0 && (
        <div className="issues-errors">
          <strong>✖ {errors.length} error{errors.length > 1 ? "es" : ""}</strong>
          <ul>
            {errors.slice(0, max).map((e, i) => (
              <li key={i}>
                <code>{e.path}</code> {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings && warnings.length > 0 && (
        <details className="issues-warnings" open={!errors?.length && warnings.length <= 5}>
          <summary>⚠ {warnings.length} corrección{warnings.length > 1 ? "es" : ""} automática{warnings.length > 1 ? "s" : ""}</summary>
          <ul>
            {warnings.slice(0, 40).map((e, i) => (
              <li key={i}>
                <code>{e.path}</code> {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {notes && notes.length > 0 && (
        <ul className="issues-notes">
          {notes.map((n, i) => (
            <li key={i}>ℹ {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Stepper({ value, onChange, step, min, max, format }: { value: number; onChange: (v: number) => void; step: number; min: number; max: number; format?: (v: number) => string }) {
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(clamp(value - step))} aria-label="menos">−</button>
      <input inputMode="decimal" value={format ? format(value) : String(value)} onChange={(e) => { const n = Number(e.target.value.replace(",", ".")); if (Number.isFinite(n)) onChange(clamp(n)); }} />
      <button type="button" onClick={() => onChange(clamp(value + step))} aria-label="más">+</button>
    </div>
  );
}
