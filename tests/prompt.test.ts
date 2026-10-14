import { describe, expect, it } from "vitest";
import { buildExample, buildPrompt, type SketchIntent } from "@/lib/generator/prompt";
import { validateProject } from "@/lib/schema/validate";
import { catalog } from "./helpers";

const intent: SketchIntent = { idea: "El jefe descubre que Usu duerme en la sala de reuniones", duration: 30, characterIds: ["usu", "jefe"], tone: "absurdo", backgroundId: "bg_oficina" };

describe("generador de prompts", () => {
  it("es determinista", () => {
    expect(buildPrompt(intent, catalog).prompt).toBe(buildPrompt({ ...intent }, catalog).prompt);
  });

  it("incluye solo IDs reales de los personajes elegidos y el contrato", () => {
    const { prompt, warnings } = buildPrompt(intent, catalog);
    expect(warnings).toEqual([]);
    for (const ch of catalog.characters.filter((c) => intent.characterIds.includes(c.id))) {
      for (const p of ch.poses) expect(prompt).toContain(p.id);
      for (const e of ch.expressions) expect(prompt).toContain(e.id);
    }
    expect(prompt).not.toContain("char.sister.");
    expect(prompt).toContain("gafas de sol");
    expect(prompt).toContain('"schemaVersion": "pocket-1"');
    expect(prompt).toMatch(/UN ÚNICO OBJETO JSON/);
    expect(prompt).toContain("30 segundos");
  });

  it("avisa de personajes o escenarios inexistentes sin incluirlos", () => {
    const { prompt, warnings } = buildPrompt({ ...intent, characterIds: ["usu", "batman"], backgroundId: "bg_luna" }, catalog);
    expect(warnings).toHaveLength(2);
    expect(prompt).not.toContain("batman");
  });

  it("el ejemplo incluido es un proyecto válido", () => {
    const ex = buildExample(catalog, catalog.characters.slice(0, 2), "bg_bar");
    const r = validateProject(ex, catalog);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
