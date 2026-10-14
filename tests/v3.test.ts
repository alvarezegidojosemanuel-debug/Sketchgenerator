import { describe, expect, it } from "vitest";
import { isV3Project, pocketToV3, v3ToPocket } from "@/lib/adapters/v3";
import { validateProject } from "@/lib/schema/validate";
import { catalog, demo, readJson } from "./helpers";

describe("adaptador V3", () => {
  it("importa el fixture con la forma de TIMELINE_SCHEMA_EXAMPLE.json", () => {
    const fx = readJson("tests/fixtures/v3-timeline-example.json");
    expect(isV3Project(fx)).toBe(true);
    const { project, report } = v3ToPocket(fx, catalog);
    const r = validateProject(project, catalog);
    expect(r.errors).toEqual([]);
    const t = r.project!.takes[0];
    expect(t.actors[0]).toMatchObject({ uid: "actor1", characterId: "usu", poseId: "usu_idle", x: 200, y: 1780 });
    expect(t.events.find((e) => e.track === "dialogue")).toMatchObject({ text: "Ejemplo", start: 0, duration: 3.2 });
    expect(t.events.find((e) => e.track === "body")).toMatchObject({ x: 420, y: 1780 });
    expect(report.assumptions.some((a) => /reconstruido/.test(a))).toBe(true);
  });

  it("pocket → V3 produce la forma esperada e informa de pérdidas", () => {
    const p = validateProject(demo(), catalog).project!;
    const { v3, report } = pocketToV3(p, catalog);
    expect(v3).toMatchObject({ version: 3, type: "punetos_project" });
    const t = v3.takes[0];
    expect(t.scene).toMatchObject({ version: 3, canvas: { width: 1080, height: 1920 }, background: "bg_oficina" });
    const body = t.timeline.events.find((e) => e.id === "t1_b2")!;
    expect(body).toMatchObject({ track: "body", asset_id: "jefe_idle", body_mode: "move", from_x: 1400, target_x: 760 });
    expect(t.timeline.events.every((e) => e.track !== "eyes" && e.track !== "props")).toBe(true);
    expect(report.losses.some((l) => /ojos/.test(l))).toBe(true);
    expect(report.losses.some((l) => /prop_cafe/.test(l))).toBe(true);
  });

  it("ida y vuelta conserva diálogos, actores y posiciones (subconjunto soportado)", () => {
    const p = validateProject(demo(), catalog).project!;
    const back = validateProject(v3ToPocket(pocketToV3(p, catalog).v3, catalog).project, catalog);
    expect(back.errors).toEqual([]);
    const dlg = (x: typeof p) => x.takes.flatMap((t) => t.events.filter((e) => e.track === "dialogue").map((e) => (e as { text: string }).text));
    expect(dlg(back.project!)).toEqual(dlg(p));
    const pos = (x: typeof p) => x.takes.flatMap((t) => t.actors.map((a) => [a.uid, a.characterId, a.poseId, a.x, a.y]));
    expect(pos(back.project!)).toEqual(pos(p));
  });

  it("rechaza lo que no es V3", () => {
    expect(() => v3ToPocket({ version: 8 }, catalog)).toThrow(/No parece un proyecto V3/);
  });
});
