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
    // Usu tiene «andar»: lo usa al ir andando
    expect(take.events.some((e) => e.track === "body" && e.actorUid === "usu" && "poseId" in e && /pose_p_anda/.test(String(e.poseId)))).toBe(true);
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

describe("animaciones en las columnas", () => {
  it("alterna las poses de la animación (copiada en el guion) mientras dura la acción", () => {
    const g = {
      animaciones: { usu: [{ nombre: "andar", bucle: true, mov: "bote", frames: [{ pose: "camina", dur: 0.2 }, { pose: "camina2", dur: 0.2 }] }] },
      escenas: [{ lugar: "bg_cafeteria", personajes: ["Usu", "Sister"], pasos: [{ dice: "Sister", texto: "Esto es una frase larga para que dure un rato largo." }, { pausa: 1 }], acciones: [{ quien: "Usu", desde: 0, hasta: 1, animacion: "andar", x: 900 }] }],
    };
    const r = compileScript(g, catalog);
    expect(r.issues).toEqual([]);
    const take = r.project!.takes[0];
    const t0 = r.marks[0]!.times[0];
    const at = (t: number) => evaluateTake(take, catalog, t).actors.find((a) => a.uid === "usu")!.poseId;
    expect(at(t0 + 0.05)).toBe("char.usu.pose_p_camina");
    expect(at(t0 + 0.25)).toBe("char.usu.pose_p_camina2");
    expect(at(t0 + 0.45)).toBe("char.usu.pose_p_camina");
  });
  it("avisa si la animación no existe", () => {
    const r = compileScript({ escenas: [{ lugar: "bg_cafeteria", personajes: ["Usu"], pasos: [{ pausa: 1 }], acciones: [{ quien: "Usu", desde: 0, animacion: "volar" }] }] }, catalog);
    expect(r.issues.some((i) => /animación «volar»/.test(i.message))).toBe(true);
  });
});

describe("andar de Usu (común)", () => {
  it("al ir andando sin animación elegida usa su «andar» (anda1…anda4)", () => {
    const r = compileScript({ escenas: [{ lugar: "bg_cafeteria", personajes: ["Usu", "Sister"], colocar: { Usu: { x: 200 } }, pasos: [{ pausa: 2 }], acciones: [{ quien: "Usu", desde: 0, x: 900 }] }] }, catalog);
    const ids = new Set(r.project!.takes[0].events.filter((e) => e.track === "body" && e.actorUid === "usu" && "poseId" in e).map((e) => (e as { poseId: string }).poseId));
    expect([...ids].filter((x) => /pose_p_anda\d/.test(x)).length).toBe(4);
  });
  it("habla andando: sigue con «andar» y mueve la boca (los pasos tienen boca)", () => {
    const r = compileScript({ escenas: [{ lugar: "bg_cafeteria", personajes: ["Usu", "Sister"], colocar: { Usu: { x: 200 } }, pasos: [{ dice: "Usu", texto: "Esto es una frase bastante larga para decirla mientras voy andando hasta allí." }], acciones: [{ quien: "Usu", desde: 0, x: 900 }] }] }, catalog);
    const take = r.project!.takes[0];
    const usu = (t: number) => evaluateTake(take, catalog, t).actors.find((a) => a.uid === "usu")!;
    const ts = Array.from({ length: 30 }, (_, i) => 0.3 + i * 0.1);
    expect(ts.every((t) => /pose_p_anda\d$/.test(usu(t).poseId ?? ""))).toBe(true);
    expect(ts.some((t) => usu(t).mouthOpen)).toBe(true);
    for (const cid of ["usu", "reynaldo", "sister", "barbas", "jefe"])
      for (const p of catalog.characters.find((c) => c.id === cid)!.poses.filter((p) => /^pose_p_anda(_n)?\d$/.test(p.key))) expect(p.talkSrc, p.id).toMatch(/_boca\.webp$/);
  });
});
