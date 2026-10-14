import { describe, expect, it } from "vitest";
import { validateProject } from "@/lib/schema/validate";
import { importProjectText } from "@/lib/import-export";
import { catalog, demo } from "./helpers";

describe("sketch demo (prueba 1: 30 s con Usu y Jefe)", () => {
  it("valida sin errores ni correcciones contra el catálogo", () => {
    const r = validateProject(demo(), catalog);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("dura 30 s y usa a Usu y Jefe", () => {
    const p = validateProject(demo(), catalog).project!;
    expect(p.takes.reduce((s, t) => s + t.duration, 0)).toBe(30);
    const chars = new Set(p.takes.flatMap((t) => t.actors.map((a) => a.characterId)));
    expect([...chars].sort()).toEqual(["jefe", "usu"]);
  });
});

describe("rechazos (pruebas 3 y 4)", () => {
  it("JSON inválido da un error útil con línea y columna", () => {
    const r = importProjectText('{ "takes": [ { "id": "t1" "duration": 3 } ] }', catalog);
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/línea 1, columna \d+/);
  });

  it("texto sin JSON da un error explicativo", () => {
    const r = importProjectText("Claro, aquí tienes tu sketch.", catalog);
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/No se encontró ningún objeto JSON/);
  });

  it("rechaza un characterId inexistente", () => {
    const p = demo();
    p.takes[0].actors[0].characterId = "batman";
    const r = validateProject(p, catalog);
    expect(r.ok).toBe(false);
    expect(r.errors).toContainEqual({ path: "takes[0].actors[0].characterId", message: expect.stringContaining('"batman" no existe') });
  });

  it("rechaza una pose de otro personaje", () => {
    const p = demo();
    p.takes[0].actors[0].poseId = "char.jefe.pose_neutral_front";
    const r = validateProject(p, catalog);
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/pose "char.jefe.pose_neutral_front" no existe para Usu/);
  });

  it("rechaza fondo y objeto inexistentes", () => {
    const p = demo();
    p.takes[0].backgroundId = "bg_marte";
    (p.takes[0].events[0] as { propId: string }).propId = "prop_laser";
    const r = validateProject(p, catalog);
    expect(r.errors.map((e) => e.path)).toEqual(expect.arrayContaining(["takes[0].backgroundId", "takes[0].events[0].propId"]));
  });

  it("rechaza actorUid que no existe en la toma", () => {
    const p = demo();
    p.takes[0].events[1] = { ...p.takes[0].events[1], actorUid: "fantasma" } as never;
    const r = validateProject(p, catalog);
    expect(r.errors[0]).toMatchObject({ path: "takes[0].events[1].actorUid" });
  });

  it("rechaza start negativo y duración cero", () => {
    const p = demo();
    p.takes[0].events[1].start = -1;
    p.takes[0].events[2].duration = 0;
    const r = validateProject(p, catalog);
    expect(r.ok).toBe(false);
    const paths = r.errors.map((e) => e.path);
    expect(paths).toContain("takes[0].events[1].start");
    expect(paths).toContain("takes[0].events[2].duration");
  });

  it("rechaza HTML/scripts incrustados", () => {
    const p = demo();
    (p.takes[0].events[1] as { text: string }).text = "<script>alert(1)</script>";
    const r = validateProject(p, catalog);
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/código o HTML/);
  });

  it("rechaza IDs duplicados", () => {
    const p = demo();
    p.takes[0].events[2].id = p.takes[0].events[1].id;
    expect(validateProject(p, catalog).errors[0].message).toMatch(/duplicado/);
  });

  it("rechaza demasiadas tomas", () => {
    const p = demo();
    p.takes = Array.from({ length: 31 }, (_, i) => ({ ...p.takes[0], id: `t${i}` }));
    expect(validateProject(p, catalog).ok).toBe(false);
  });
});

describe("normalización de errores comunes (sin fabricar assets)", () => {
  const llmOutput = `Aquí tienes:
\`\`\`json
{
  "metadata": { "title": "Prueba", "approxDuration": "8" },
  "takes": [{
    "duration": 5,
    "backgroundId": "Oficina",
    "actors": [{ "uid": "a1", "characterId": "Usu", "poseId": "pointing", "x": "300", "y": 1780 }],
    "events": [
      { "track": "dialogo", "actor_uid": "a1", "start": 0, "text": "Hola, buenos días a todos" },
      { "track": "face", "actorUid": "a1", "start": 1, "duration": 0.5, "expressionId": "furioso_extremo" },
      { "track": "face", "actorUid": "a1", "start": 2, "duration": 0.5, "emotion": "triste" },
      { "track": "dialogue", "actorUid": "a1", "start": 4, "duration": 3, "text": "Me paso de la toma" },
    ]
  }]
}
\`\`\`
¡Espero que te guste!`;

  it("repara formato, alias, mayúsculas y faltantes con avisos", () => {
    const r = importProjectText(llmOutput, catalog);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    const t = r.project!.takes[0];
    expect(t.backgroundId).toBe("bg_oficina");
    expect(t.actors[0]).toMatchObject({ characterId: "usu", poseId: "char.usu.pose_pointing", x: 300 });
    expect(t.events[0]).toMatchObject({ track: "dialogue", actorUid: "a1" });
    expect(t.events[0].duration).toBeGreaterThan(0);
    expect(t.duration).toBe(7);
    expect(r.notes.join(" ")).toMatch(/Markdown/);
  });

  it("expresión no registrada → fallback declarado con aviso", () => {
    const r = importProjectText(llmOutput, catalog);
    const face = r.project!.takes[0].events[1] as { expressionId: string };
    expect(face.expressionId).toBe("expression.usu.neutral");
    expect(r.warnings.some((w) => /fallback declarado/.test(w.message))).toBe(true);
    const face2 = r.project!.takes[0].events[2] as { expressionId: string };
    expect(face2.expressionId).toBe("expression.usu.tristeza");
  });

  it("expresión de otro personaje → la equivalente del actor, con aviso (nunca piezas incompatibles)", () => {
    const r = importProjectText(llmOutput.replace('"expressionId": "furioso_extremo"', '"expressionId": "expression.jefe.enfado"'), catalog);
    expect((r.project!.takes[0].events[1] as { expressionId: string }).expressionId).toBe("expression.usu.enfado");
    expect(r.warnings.some((w) => w.path === "takes[0].events[1].expressionId")).toBe(true);
  });

  it("no inventa personajes: un nombre desconocido sigue siendo error", () => {
    const r = importProjectText(llmOutput.replace('"Usu"', '"Pepito"'), catalog);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Pepito/.test(e.message))).toBe(true);
  });
});
