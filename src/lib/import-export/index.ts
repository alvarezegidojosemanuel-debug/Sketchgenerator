import type { Catalog } from "@/lib/catalog/types";
import { LIMITS, type PocketProject } from "@/lib/schema/pocket";
import { validateProject, type ValidationResult } from "@/lib/schema/validate";

export type ParseResult = { ok: true; value: unknown; notes: string[] } | { ok: false; error: string };

/**
 * Extrae un objeto JSON de texto pegado (respuesta de ChatGPT, archivo .json…).
 * Tolera ```json ... ``` y texto alrededor; nunca evalúa código (sin eval).
 */
export function parseJsonText(text: string): ParseResult {
  const notes: string[] = [];
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "No hay contenido. Pega el JSON o elige un archivo .json." };
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > LIMITS.maxInputBytes) {
    return { ok: false, error: `El contenido ocupa ${Math.round(bytes / 1024)} KB; el máximo es ${Math.round(LIMITS.maxInputBytes / 1024)} KB.` };
  }
  let s = text.replace(/^﻿/, "").trim();

  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) {
    s = fence[1].trim();
    notes.push("Se quitó el bloque Markdown ```json``` alrededor del JSON.");
  }
  if (!s.startsWith("{")) {
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first === -1 || last <= first) {
      return { ok: false, error: "No se encontró ningún objeto JSON (debe empezar por '{' y terminar por '}')." };
    }
    s = s.slice(first, last + 1);
    notes.push("Se ignoró el texto antes/después del objeto JSON.");
  } else if (!s.endsWith("}")) {
    const last = s.lastIndexOf("}");
    if (last > 0) {
      s = s.slice(0, last + 1);
      notes.push("Se ignoró el texto después del objeto JSON.");
    }
  }
  // Comillas tipográficas que algunos teclados/modelos insertan como delimitadores.
  if (/[“”]/.test(s) && !/"/.test(s)) {
    s = s.replace(/[“”]/g, '"');
    notes.push("Se sustituyeron comillas tipográficas “ ” por comillas rectas.");
  }
  try {
    return { ok: true, value: JSON.parse(s), notes };
  } catch (err) {
    // Reintento con correcciones seguras: comas finales.
    const relaxed = s.replace(/,\s*([}\]])/g, "$1");
    if (relaxed !== s) {
      try {
        const value = JSON.parse(relaxed);
        notes.push("Se eliminaron comas sobrantes antes de '}' o ']'.");
        return { ok: true, value, notes };
      } catch {
        /* cae al error original */
      }
    }
    return { ok: false, error: describeJsonError(s, err) };
  }
}

function describeJsonError(s: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/position (\d+)/);
  if (!m) return `JSON no válido: ${msg}`;
  const pos = Number(m[1]);
  const before = s.slice(0, pos);
  const line = before.split("\n").length;
  const col = pos - before.lastIndexOf("\n");
  const snippet = s.slice(Math.max(0, pos - 30), pos + 30).replace(/\s+/g, " ");
  return `JSON no válido en línea ${line}, columna ${col}: …${snippet}… (${msg.replace(/ in JSON at position \d+.*/, "")}). Revisa comas, comillas y llaves.`;
}

export interface ImportOutcome extends ValidationResult {
  notes: string[];
}

/** Texto → parse tolerante → validación/normalización con el catálogo. */
export function importProjectText(text: string, catalog: Catalog): ImportOutcome {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return { ok: false, errors: [{ path: "$", message: parsed.error }], warnings: [], notes: [] };
  return { ...validateProject(parsed.value, catalog), notes: parsed.notes };
}

/** Serialización estable para descargar/exportar. */
export function exportProjectText(project: PocketProject): string {
  return JSON.stringify(project, null, 2) + "\n";
}

export function projectFileName(project: PocketProject): string {
  const slug = project.metadata.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${slug || "sketch"}.pocket.json`;
}

/** Descarga en el navegador (sin servidor). */
export function downloadText(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
