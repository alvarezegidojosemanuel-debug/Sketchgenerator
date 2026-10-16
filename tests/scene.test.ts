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

describe("transformar objeto", () => {
  it("pantallazo, cambio en el mismo sitio con destello y validación correcta", async () => {
    const { transformEvents } = await import("@/lib/timeline/desk");
    const p = structuredClone(r.project!);
    const tk = p.takes[0];
    const from = { id: "h1", track: "props" as const, propId: "prop_maletin", layer: "props-front" as const, x: 300, y: 1700, scale: 1.2, start: 0, duration: tk.duration };
    let n = 0;
    const res = transformEvents(tk, from, "prop_cafe", 4, (x) => `${x}_${++n}`);
    tk.events.push(res.from, ...res.add);
    const rr = validateProject(p, catalog);
    expect(rr.errors).toEqual([]);
    const at = (t: number) => evaluateTake(tk, catalog, t).props.filter((x) => x.propId === "prop_maletin" || x.propId === "prop_cafe").map((x) => x.propId);
    expect(at(3)).toEqual(["prop_maletin"]);
    expect(evaluateTake(tk, catalog, 5).screen.bluescreen).toBeTruthy();
    expect(at(10)).toEqual(["prop_cafe"]);
    const after = res.add.find((e) => e.track === "props")!;
    expect(after).toMatchObject({ x: 300, y: 1700, scale: 1.2 });
  });
});

describe("cambiar objeto", () => {
  it("parte el evento en el cursor sin huecos ni transiciones", async () => {
    const { swapEvents } = await import("@/lib/timeline/desk");
    const from = { id: "h1", track: "props" as const, propId: "prop_maletin", layer: "props-front" as const, x: 300, y: 1700, start: 1, duration: 5, enter: "fade" as const, exit: "fade" as const };
    const r2 = swapEvents(from, "prop_cafe", 3, "sw1")!;
    expect(r2.from).toMatchObject({ start: 1, duration: 2, enter: "fade", exit: undefined });
    expect(r2.add).toMatchObject({ propId: "prop_cafe", start: 3, duration: 3, x: 300, enter: undefined, exit: "fade" });
    expect(swapEvents(from, "prop_cafe", 1, "x")).toBeNull();
  });
});

describe("demo El origen", () => {
  it("valida, usa voces de personajes sin actor y los puñetos entran en la toma 2", async () => {
    const raw = (await import("@/data/sketch-origen.json")).default;
    const ro = validateProject(structuredClone(raw), catalog);
    expect(ro.errors).toEqual([]);
    const t1 = ro.project!.takes[2];
    const f = evaluateTake(t1, catalog, 4);
    expect(f.subtitles[0].speaker).toBe("Sister");
    expect(castIds(ro.project!)).toEqual(expect.arrayContaining(["sister", "reynaldo", "usu", "barbas", "narrador"]));
    const t2 = ro.project!.takes[3];
    expect(layoutFrame(catalog, evaluateTake(t2, catalog, 1)).actors.length).toBe(5);
  });
});

const GUION_GOMA = { formato: "puñetos-guion-1", escenas: [{ lugar: "bg_sistemas", vista: "humanos", personajes: ["Jefe", "Usu"], pasos: [
  { dice: "Usu", texto: "Jefe, lo tengo clarísimo: esto lo arreglamos antes de comer, te lo prometo." },
  { dice: "Jefe", texto: "¿Antes de comer?", gesto: "confundido" },
] }] };

describe("vida automática y cámara", () => {
  it("los que escuchan miran a quien habla y la cámara corta a primer plano en el remate", async () => {
    const ep3 = (await import("@/data/ep3.json")).default;
    const ro = validateProject(structuredClone(ep3), catalog);
    expect(ro.errors).toEqual([]);
    const take = ro.project!.takes[0];
    const line = take.events.find((e) => e.track === "dialogue" && e.actorUid === "rey")!;
    const f = evaluateTake(take, catalog, line.start + 0.6);
    const sis = f.actors.find((a) => a.uid === "sis")!; // Sister (x 770) mira a Reynaldo (x 310): a la izquierda
    const rey = f.actors.find((a) => a.uid === "rey")!;
    expect(Math.sign(sis.gazeX)).toBe(Math.sign(rey.x - sis.x) * (sis.flip ? -1 : 1));
    // cámara automática (si la toma la pide): primer plano en el remate
    const auto = { ...take, camera: "auto" as const };
    const last = take.events.filter((e) => e.track === "dialogue").at(-1)!;
    expect(evaluateTake(auto, catalog, last.start + 0.3).camera.zoom).toBeGreaterThan(1.5);
    expect(evaluateTake(auto, catalog, 0.1).camera.zoom).toBe(1);
    // sin planos: cámara viva (acercamiento suave, nunca más de un 20 %); «fixed», quieta
    expect(f.camera.zoom).toBeGreaterThanOrEqual(1);
    expect(f.camera.zoom).toBeLessThan(1.2);
    expect(evaluateTake(take, catalog, last.start + 0.5).camera.zoom).toBeGreaterThan(1.1);
    expect(evaluateTake({ ...take, camera: "fixed" as const }, catalog, line.start + 0.6).camera.zoom).toBe(1);
  });
  it("animación de goma: quien habla se inclina y gesticula; al cambiar de pose estira y encoge", () => {
    const tk = validateProject(structuredClone(GUION_GOMA), catalog).project!.takes[0];
    const line = tk.events.find((e) => e.track === "dialogue")!;
    const skews = new Set<number>();
    for (let t = line.start + 0.3; t < line.start + line.duration - 0.3; t += 0.1) skews.add(Math.round(evaluateTake(tk, catalog, t).actors.find((a) => a.uid === line.actorUid)!.skew * 10));
    expect(skews.size).toBeGreaterThan(3);
    const body = tk.events.find((e) => e.track === "body" && e.poseId)!;
    const a = evaluateTake(tk, catalog, body.start + 0.1).actors.find((x) => x.uid === body.actorUid)!;
    expect(Math.abs(a.sy - 1)).toBeGreaterThan(0.01);
  });
});
