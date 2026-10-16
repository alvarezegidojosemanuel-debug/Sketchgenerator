import { describe, expect, it } from "vitest";
import { catalog } from "@/lib/catalog";
import { validateProject } from "@/lib/schema/validate";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { layoutActor } from "@/lib/renderer/layout";

const guion = {
  formato: "puñetos-guion-1",
  titulo: "Prueba humanos",
  escenas: [
    {
      nombre: "Despacho",
      lugar: "bg_oficina_manana",
      vista: "humanos",
      personajes: ["Jefe"],
      pasos: [
        { dice: "Jefe", texto: "Tranquilos, equipo, que esto lo tenemos todo controlado desde primera hora." },
        { dice: "Jefe", texto: "¿Qué reunión?", gesto: "confundido" },
      ],
    },
  ],
};

describe("humanos de frente (poses dibujadas enteras)", () => {
  const r = validateProject(structuredClone(guion), catalog);
  const tk = r.project!.takes[0];

  it("la vista «humanos» usa sus poses humanas, no las de Puñeto", () => {
    expect(r.errors).toEqual([]);
    expect(tk.actors[0].poseId).toBe("char.jefe.pose_h_neutro");
    const poses = tk.events.filter((e) => e.track === "body").map((e) => (e as { poseId?: string }).poseId);
    expect(poses).toContain("char.jefe.pose_h_explica");
    expect(poses).toContain("char.jefe.pose_h_confundido");
  });

  it("sin capas de cara y con la boca abierta solo al hablar", () => {
    const line = tk.events.find((e) => e.track === "dialogue")!;
    const quiet = layoutActor(catalog, evaluateTake(tk, catalog, 0.1).actors[0]);
    expect(quiet.face).toEqual([]);
    expect(quiet.talkOpen).toBe(false);
    const open = new Set<boolean | undefined>();
    for (let t = line.start + 0.02; t < line.start + line.duration; t += 0.03) open.add(layoutActor(catalog, evaluateTake(tk, catalog, t).actors[0]).talkOpen);
    expect(open.has(true)).toBe(true);
    // con voz real manda el volumen
    const lv = (v: number) => layoutActor(catalog, evaluateTake(tk, catalog, line.start + 0.2, { levels: new Map([["jefe", v]]) }).actors[0]).talkOpen;
    expect(lv(0.9)).toBe(true);
    expect(lv(0)).toBe(false);
  });

  it("si falta algún personaje humano, vuelve a la vista de espaldas", () => {
    const g = structuredClone(guion);
    g.escenas[0].personajes = ["Jefe", "Barbas"];
    const r2 = validateProject(g, catalog);
    expect(r2.project!.takes[0].actors.every((a) => !a.poseId.includes("pose_h_"))).toBe(true);
  });
});

describe("estatura de los humanos", () => {
  it("las poses humanas se escalan por la estatura (ref. 1,84 m); las de Puñeto no", async () => {
    const { poseScale, findPose } = await import("@/lib/catalog");
    const flat = { ...findPose(catalog, "jefe", "char.jefe.pose_h_neutro")!, displayScale: 1 };
    expect(poseScale(catalog, "jefe", flat)).toBe(1);
    expect(poseScale(catalog, "sister", flat)).toBeCloseTo(170 / 184);
    expect(poseScale(catalog, "barbas", flat)).toBeCloseTo(187 / 184);
    const puneto = findPose(catalog, "sister", "char.sister.pose_neutral_front")!;
    expect(poseScale(catalog, "sister", puneto)).toBe(puneto.displayScale);
  });
});

describe("proyecto de prueba de humanos", () => {
  it("se monta y valida, con Jefe y Usu de frente en sistemas", async () => {
    const raw = (await import("@/data/prueba-humanos.json")).default;
    const r = validateProject(structuredClone(raw), catalog);
    expect(r.errors).toEqual([]);
    const tk = r.project!.takes[1];
    expect(tk.backgroundId).toBe("bg_sistemas");
    expect(tk.actors.map((a) => a.poseId)).toEqual(["char.jefe.pose_h_neutro", "char.usu.pose_h_neutro"]);
  });
});

describe("boca de dos fotogramas con voz real", () => {
  it("abre y cierra a ritmo de sílaba mientras suena, y se cierra en silencio", async () => {
    const { flatMouthOpen } = await import("@/lib/timeline/evaluate");
    let toggles = 0, open = 0, prev = false;
    for (let i = 0; i < 60; i++) {
      const o = flatMouthOpen(0.9, i / 60);
      if (o !== prev) toggles++;
      if (o) open++;
      prev = o;
    }
    expect(open).toBeGreaterThan(20);
    expect(open).toBeLessThan(40);
    expect(toggles).toBeLessThanOrEqual(17);
    for (let i = 0; i < 60; i++) expect(flatMouthOpen(0.05, i / 60)).toBe(false);
  });
  it("cuando habla Anastas-IA se ve su pantalla", async () => {
    const raw = (await import("@/data/prueba-humanos.json")).default;
    const r = validateProject(structuredClone(raw), catalog);
    expect(r.project!.takes[1].events.some((e) => e.track === "props" && e.propId === "prop_anastasia_pantalla")).toBe(true);
  });
});
