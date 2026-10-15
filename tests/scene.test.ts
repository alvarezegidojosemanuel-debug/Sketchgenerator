import { describe, expect, it } from "vitest";
import { catalog } from "@/lib/catalog";
import { validateProject } from "@/lib/schema/validate";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { layoutFrame } from "@/lib/renderer/layout";
import { actorHeight, deskFor, guessDesk } from "@/lib/timeline/desk";
import { castIds, speakerCharacterId } from "@/lib/voice/catalog";
import demo from "@/data/sketch-pantallazo.json";

const r = validateProject(structuredClone(demo), catalog);
const take = () => r.project!.takes[0];

describe("demo El Pantallazo Cero", () => {
  it("valida sin errores", () => {
    expect(r.errors).toEqual([]);
  });
  it("narrador: subtítulo «Narrador», sin boca, y voz propia en el reparto", () => {
    const f = evaluateTake(take(), catalog, 1);
    expect(f.subtitles[0].speaker).toBe("Narrador");
    expect(f.actors.every((a) => !a.speaking)).toBe(true);
    expect(castIds(r.project!)).toContain("narrador");
    expect(speakerCharacterId(take(), undefined)).toBe("narrador");
  });
  it("actores ocultos no se dibujan hasta que entran con destello", () => {
    const before = layoutFrame(catalog, evaluateTake(take(), catalog, 5));
    expect(before.actors.map((a) => a.uid)).toEqual(["usu"]);
    const during = evaluateTake(take(), catalog, 9.45);
    expect(during.screen.flash?.color).toBe("#ffffff");
    const after = layoutFrame(catalog, evaluateTake(take(), catalog, 11));
    expect(after.actors.map((a) => a.uid).sort()).toEqual(["jefe", "rey", "usu"]);
    expect(after.actors.every((a) => a.opacity === 1)).toBe(true);
    // en edición se ven como fantasmas
    const edit = layoutFrame(catalog, evaluateTake(take(), catalog, 5), { showHidden: true });
    expect(edit.actors.length).toBe(3);
  });
  it("pantallazo azul con texto", () => {
    expect(evaluateTake(take(), catalog, 8).screen.bluescreen?.text).toBe("Tu equipo se ha puñetizado.");
  });
  it("teclear mueve un poco al actor", () => {
    const f = evaluateTake(take(), catalog, 1.13).actors.find((a) => a.uid === "usu")!;
    expect(Math.abs(f.offX) + Math.abs(f.offY)).toBeGreaterThan(0);
    expect(Math.abs(f.offY)).toBeLessThan(10);
  });
});

describe("escritorio", () => {
  it("se escala a ~0,9 de la altura del personaje y tapa de cintura para abajo", () => {
    const desk = guessDesk(catalog)!;
    expect(desk.id).toBe("prop_escritorio");
    const a = take().actors[0];
    const ev = deskFor(catalog, take(), a, desk.id, "d1")!;
    const h = desk.height * ev.scale!;
    expect(h / actorHeight(catalog, a)).toBeCloseTo(0.92, 1);
    expect(ev.layer).toBe("props-front");
    expect(ev.duration).toBe(take().duration);
  });
});

describe("narrador en JSON de ChatGPT", () => {
  it("acepta actorUid «narrador» y lo convierte en voz en off", () => {
    const p = structuredClone(demo) as typeof demo;
    (p.takes[0].events[0] as { actorUid?: string }).actorUid = "narrador";
    const rr = validateProject(p, catalog);
    expect(rr.errors).toEqual([]);
    expect((rr.project!.takes[0].events[0] as { actorUid?: string }).actorUid).toBeUndefined();
  });
});
