import { describe, expect, it } from "vitest";
import { isV3Project, pocketToV3, v3ToPocket } from "@/lib/adapters/v3";
import { validateProject } from "@/lib/schema/validate";
import { catalog, demo, readJson } from "./helpers";

describe("adaptador punetos_project v3 (formato de V8)", () => {
  it("importa un proyecto con la forma del TIMELINE_SCHEMA_EXAMPLE.json de V8 y poses del catálogo actual", () => {
    const fx = readJson("tests/fixtures/v3-timeline-poses-actuales.json");
    expect(isV3Project(fx)).toBe(true);
    const { project, report } = v3ToPocket(fx, catalog);
    const r = validateProject(project, catalog);
    expect(r.errors).toEqual([]);
    const t = r.project!.takes[0];
    expect(t.actors[0]).toMatchObject({ uid: "actor1", characterId: "usu", poseId: "char.usu.pose_p_camina", x: 300, y: 1100 });
    expect(t.events.find((e) => e.track === "dialogue")).toMatchObject({ text: "Ejemplo", start: 0, duration: 3.2 });
    expect(t.events.find((e) => e.track === "body")).toMatchObject({ x: 520, y: 1100 });
    expect(t.events.find((e) => e.track === "face")).toMatchObject({ expressionId: "expression.usu.sorpresa" });
    expect(report.assumptions.some((a) => /reconstruido/.test(a))).toBe(true);
  });

  it("el ejemplo REAL de V8 (poses del rig antiguo) no inventa actores: lo omite e informa", () => {
    const fx = readJson("tests/fixtures/v8-timeline-schema-example.json");
    const { project, report } = v3ToPocket(fx, catalog);
    expect(validateProject(project, catalog).errors).toEqual([]);
    expect(project.takes[0].actors).toEqual([]);
    expect(report.losses.some((l) => /actor1.*sin capa ni pose de catálogo/.test(l))).toBe(true);
  });

  it("pocket → v3 produce la forma esperada e informa de pérdidas", () => {
    const p = validateProject(demo(), catalog).project!;
    const { v3, report } = pocketToV3(p, catalog);
    expect(v3).toMatchObject({ version: 3, type: "punetos_project" });
    const t = v3.takes[0];
    expect(t.scene).toMatchObject({ version: 3, canvas: { width: 1080, height: 1920 }, background: "bg_oficina_manana" });
    const body = t.timeline.events.find((e) => e.id === "t1_b2")!;
    expect(body).toMatchObject({ track: "body", asset_id: "char.jefe.pose_p_camina", body_mode: "move", from_x: 1400, target_x: 780 });
    expect(t.timeline.events.find((e) => e.id === "t1_f1")).toMatchObject({ track: "face", asset_id: "expression.jefe.enfado" });
    expect(t.timeline.events.every((e) => e.track !== "eyes" && e.track !== "props")).toBe(true);
    expect(report.losses.some((l) => /ojos/.test(l))).toBe(true);
    expect(report.losses.some((l) => /prop_cafe/.test(l))).toBe(true);
    expect(report.losses.some((l) => /jefe: 'flip'/.test(l))).toBe(true);
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

  it("rechaza lo que no es un proyecto v3", () => {
    expect(() => v3ToPocket({ version: 8 }, catalog)).toThrow(/No parece un proyecto V3/);
  });
});
