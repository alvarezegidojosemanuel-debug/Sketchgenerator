import { describe, expect, it } from "vitest";
import { catalog } from "@/lib/catalog";
import { validateProject } from "@/lib/schema/validate";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { GUION_EJEMPLO } from "@/lib/script/compile";

describe("montador de guiones", () => {
  const r = validateProject(structuredClone(GUION_EJEMPLO), catalog);
  it("el guion de ejemplo se monta y valida", () => {
    expect(r.errors).toEqual([]);
    expect(r.project!.takes).toHaveLength(2);
  });
  it("escena de espaldas: los cinco en sus sillas, el que habla cambia de postura y el Jefe se va", () => {
    const tk = r.project!.takes[0];
    const seats = (t: number) => evaluateTake(tk, catalog, t).props.filter((p) => p.opacity > 0.5).map((p) => p.propId);
    expect(seats(0.1).length).toBe(5);
    const barbas = tk.events.find((e) => e.track === "dialogue" && e.voiceOf === "barbas")!;
    expect(seats(barbas.start + 0.5)).toContain("prop_barbas_espaldas_habla");
    const coro = tk.events.filter((e) => e.track === "dialogue" && e.text === "No.");
    expect(coro).toHaveLength(3);
    expect(Math.max(...coro.map((e) => e.start)) - Math.min(...coro.map((e) => e.start))).toBeLessThan(0.2); // a la vez
    expect(seats(tk.duration - 0.1).some((p) => p.startsWith("prop_jefe"))).toBe(false); // se fue
    expect(tk.events.some((e) => e.track === "dialogue" && e.speakerName === "Director")).toBe(true);
  });
  it("escena de puñetos: colocados en grupo, gestos, miradas y explosión con sonido", () => {
    const tk = r.project!.takes[1];
    expect(tk.actors.map((a) => a.uid).sort()).toEqual(["barbas", "jefe", "reynaldo", "sister", "usu"]);
    expect(tk.events.some((e) => e.track === "screen" && e.effect === "explosion")).toBe(true);
    expect(tk.events.some((e) => e.track === "sfx" && e.soundId === "sfx_explosion")).toBe(true);
    expect(tk.events.some((e) => e.track === "body" && e.actorUid === "reynaldo" && e.poseId?.endsWith("arms_crossed"))).toBe(true);
    // nadie habla a la vez salvo los coros: los tiempos van encadenados
    const lines = tk.events.filter((e) => e.track === "dialogue").sort((a, b) => a.start - b.start);
    for (let i = 1; i < lines.length; i++) expect(lines[i].start).toBeGreaterThan(lines[i - 1].start);
  });
  it("nombres tolerantes y errores claros", () => {
    const bad = validateProject({ escenas: [{ lugar: "luna", personajes: ["Pepe"], pasos: [{ dice: "Pepe", texto: "Hola" }] }] }, catalog);
    expect(JSON.stringify(bad.errors.concat(bad.warnings))).toMatch(/Pepe|luna/);
  });
});

describe("prompt de guion", () => {
  it("lleva el universo, el método, el catálogo y un ejemplo que se monta sin errores", async () => {
    const { buildScriptPrompt } = await import("@/lib/generator/scriptPrompt");
    const { prompt } = buildScriptPrompt({ idea: "El Jefe pierde las llaves", duration: 30, characterIds: ["jefe", "sister", "barbas"], tone: "absurdo", backgroundId: "bg_oficina_manana" }, catalog);
    expect(prompt).toMatch(/UNA sola idea cómica/);
    expect(prompt).toMatch(/Jefe del pasado/);
    expect(prompt).toContain("bg_sala_servidores");
    expect(prompt).toContain("explosion");
    expect(prompt).not.toMatch(/"x":|coordenadas: /);
    const json = prompt.slice(prompt.lastIndexOf("{\"formato\""));
    expect(validateProject(JSON.parse(json), catalog).errors).toEqual([]);
  });
});
