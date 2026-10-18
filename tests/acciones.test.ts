import { describe, expect, it } from "vitest";
import { catalog } from "@/lib/catalog";
import { compileScript } from "@/lib/script/compile";
import { evaluateTake } from "@/lib/timeline/evaluate";

const base = (acciones: unknown[], pasos: unknown[] = [{ dice: "Usu", texto: "Hola, buenos días a todos." }, { dice: "Sister", texto: "Buenos días." }, { dice: "Usu", texto: "Me voy.", columna: true }]) => ({
  escenas: [{ lugar: "bg_cafeteria", personajes: ["Usu", "Sister"], colocar: { Usu: { x: 300 } }, pasos, acciones }],
});

describe("acciones (columnas de personajes)", () => {
  it("anda hasta x y se queda allí", () => {
    const r = compileScript(base([{ quien: "Usu", desde: 1, hasta: 1, x: 800 }]), catalog);
    const take = r.project!.takes[0];
    const t1 = r.marks[0]!.times[2];
    const usu = (t: number) => evaluateTake(take, catalog, t).actors.find((a) => a.uid === "usu")!;
    expect(usu(0.2).x).toBe(300);
    expect(usu(t1 + 0.2).x).toBe(800);
    expect(usu(take.duration - 0.1).x).toBe(800);
    expect(take.events.some((e) => e.track === "body" && e.actorUid === "usu" && e.fx === "walk")).toBe(true);
  });
  it("con «columna» la frase no pone el gesto de hablar dentro de la acción", () => {
    const r = compileScript(base([{ quien: "Usu", desde: 2, gesto: "brazos_cruzados" }], [{ dice: "Sister", texto: "Hola." }, { pausa: 0.5 }, { dice: "Usu", texto: "Esto es una frase bastante larga para que explique con las manos.", columna: true }]), catalog);
    const take = r.project!.takes[0];
    const t = r.marks[0]!.times[2] + 1;
    const usu = evaluateTake(take, catalog, t).actors.find((a) => a.uid === "usu")!;
    expect(usu.poseId).toBe("char.usu.pose_p_brazos_cruzados");
  });
  it("aparece: corte directo a la nueva posición", () => {
    const r = compileScript(base([{ quien: "Sister", desde: 0, x: 900, modo: "aparece" }]), catalog);
    const take = r.project!.takes[0];
    const sis = evaluateTake(take, catalog, r.marks[0]!.times[0] + 0.1).actors.find((a) => a.uid === "sister")!;
    expect(sis.x).toBe(900);
  });
});
