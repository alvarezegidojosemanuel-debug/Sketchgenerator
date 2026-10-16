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

describe("grupos de personajes en una toma", () => {
  it("el prompt pide poner a todos en la misma toma y da posiciones para 5", () => {
    const { prompt } = buildPrompt({ ...intent, characterIds: ["usu", "reynaldo", "sister", "barbas", "jefe"] }, catalog);
    expect(prompt).toContain("MISMA toma");
    expect(prompt).toMatch(/5: detrás/);
    expect(prompt).not.toMatch(/≥ 360 px/);
  });

  it("colocar a 5 personajes los deja dentro del encuadre, en dos filas y válidos", async () => {
    const { arrangeTake, groupLayout } = await import("@/lib/timeline/arrange");
    const slots = groupLayout(5);
    expect(new Set(slots.map((s) => s.y)).size).toBe(2);
    for (const s of slots) {
      const half = (500 * s.scale) / 2;
      expect(s.x - half).toBeGreaterThan(-80);
      expect(s.x + half).toBeLessThan(1160);
    }
    const ex = buildExample(catalog, catalog.characters, "bg_salon");
    const take = ex.takes[0];
    take.actors = catalog.characters.filter((c) => !["director", "neli", "gala", "damian"].includes(c.id)).map((c, i) => ({ uid: `a${i}`, characterId: c.id, poseId: c.poses[0].id, x: 540, y: 1780, scale: 1, zIndex: 0 }));
    take.events = take.events.filter((e) => e.track === "dialogue").map((e) => ({ ...e, actorUid: "a0" }));
    const arranged = { ...ex, takes: [arrangeTake(take)] };
    const r = validateProject(arranged, catalog);
    expect(r.errors.map((e) => e.message)).toEqual([]);
    expect(new Set(arranged.takes[0].actors.map((a) => a.x)).size).toBe(5);
  });
});

describe("universo en el prompt", () => {
  it("incluye el lore y la personalidad de los personajes elegidos", async () => {
    const { loreBlock } = await import("@/lib/generator/lore");
    const b = loreBlock(["jefe", "usu"]);
    expect(b).toMatch(/Jefe del pasado/);
    expect(b).toMatch(/Draco/);
    expect(b).not.toMatch(/sindicato/);
  });
});
