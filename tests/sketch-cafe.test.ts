import { it, expect } from "vitest";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { catalog } from "@/lib/catalog";
import { compileScript } from "@/lib/script/compile";
import raw from "@/data/sketch-02-ultimo-cafe.json";
it("el último café monta sin avisos", () => {
  const r = compileScript(raw as never, catalog);
  console.log(JSON.stringify(r.issues), r.project?.takes[0].duration);
  expect(r.issues).toEqual([]);
});

import alq from "@/data/sketch-03-alquiler.json";
it("«Un par de añitos» monta sin avisos", () => {
  expect(compileScript(alq as never, catalog).issues).toEqual([]);
});

it("en «Un par de añitos» todas las frases se dicen con una pose que mueve la boca", () => {
  const take = compileScript(alq as never, catalog).project!.takes[0];
  const chars = new Map(take.actors.map((a) => [a.uid, a.characterId]));
  for (const d of take.events.filter((e) => e.track === "dialogue" && e.actorUid)) {
    const body = take.events.filter((e) => e.track === "body" && e.actorUid === d.actorUid && "poseId" in e && e.start <= d.start + 0.01).sort((a, b) => b.start - a.start)[0] as { poseId?: string } | undefined;
    const pose = catalog.characters.find((c) => c.id === chars.get(d.actorUid!))!.poses.find((p) => p.id === body?.poseId);
    expect(pose?.talkSrc, `${d.actorUid}: ${(d as { text: string }).text}`).toBeTruthy();
  }
});

import proto from "@/data/sketch-04-protocolo.json";
it("«El cumplimiento del protocolo» monta sin avisos y todas las frases mueven la boca", () => {
  const r = compileScript(proto as never, catalog);
  expect(r.issues).toEqual([]);
  for (const take of r.project!.takes) {
    const chars = new Map(take.actors.map((a) => [a.uid, a.characterId]));
    for (const d of take.events.filter((e) => e.track === "dialogue" && e.actorUid && chars.has(e.actorUid))) {
      const body = take.events.filter((e) => e.track === "body" && e.actorUid === d.actorUid && "poseId" in e && e.start <= d.start + 0.01).sort((a, b) => b.start - a.start)[0] as { poseId?: string } | undefined;
      const pose = catalog.characters.find((c) => c.id === chars.get(d.actorUid!))!.poses.find((p) => p.id === body?.poseId);
      expect(pose?.talkSrc, `${d.actorUid}: ${(d as { text: string }).text}`).toBeTruthy();
    }
  }
});

import comp from "@/data/sketch-05-comprometido.json";
import { validateProject } from "@/lib/schema/validate";
it("«El más comprometido» monta sin avisos y todas las frases mueven la boca", () => {
  const r = compileScript(comp as never, catalog);
  expect(r.issues).toEqual([]);
  expect(validateProject(r.project, catalog).errors).toEqual([]);
  for (const take of r.project!.takes) {
    const chars = new Map(take.actors.map((a) => [a.uid, a.characterId]));
    for (const d of take.events.filter((e) => e.track === "dialogue" && e.actorUid && chars.has(e.actorUid))) {
      const body = take.events.filter((e) => e.track === "body" && e.actorUid === d.actorUid && "poseId" in e && e.start <= d.start + 0.01).sort((a, b) => b.start - a.start)[0] as { poseId?: string } | undefined;
      const pose = catalog.characters.find((c) => c.id === chars.get(d.actorUid!))!.poses.find((p) => p.id === body?.poseId);
      expect(pose?.talkSrc, `${d.actorUid}: ${(d as { text: string }).text}`).toBeTruthy();
    }
  }
});

it("el ambiente de fondo respeta «ambiente_volumen» y los sonidos sueltos su «volumen»", () => {
  const raw = { formato: "puñetos-guion-1", escenas: [{ lugar: "bg_cementerio_martinez", ambiente_volumen: 0.1, pasos: [{ sonido: "ding", volumen: 0.3 }, { pausa: 2 }] }] };
  const r = compileScript(raw as never, catalog);
  expect(r.issues).toEqual([]);
  const sfx = r.project!.takes[0].events.filter((e) => e.track === "sfx") as { soundId: string; volume?: number }[];
  expect(sfx.find((e) => e.soundId === "sfx_ambiente_pajaros")?.volume).toBe(0.1);
  expect(sfx.find((e) => e.soundId === "sfx_ding")?.volume).toBe(0.3);
});

import { placementToScript } from "@/lib/script/placement";
it("las posiciones arrastradas en el editor pasan al «colocar» del guion", () => {
  const take = structuredClone(compileScript(comp as never, catalog).project!.takes[4]);
  const b = take.actors.find((a) => a.uid === "barbas")!;
  b.x = 150; b.y = 1900; b.scale = b.scale * 1.5;
  const next = placementToScript(comp as never, 4, take, catalog)!;
  const o = ((next.escenas as Record<string, unknown>[])[4].colocar as Record<string, Record<string, unknown>>).Barbas;
  expect(o).toMatchObject({ x: 150, y: 1900, escala: 3.9, gesto: "maq_camara" });
  const again = compileScript(next, catalog).project!.takes[4].actors.find((a) => a.uid === "barbas")!;
  expect([again.x, again.y, Math.round(again.scale * 100)]).toEqual([150, 1900, Math.round(b.scale * 100)]);
});

it("mover en el editor a quien entra andando desplaza todo su recorrido (no aparece antes de tiempo)", () => {
  const take = structuredClone(compileScript(comp as never, catalog).project!.takes[4]);
  const d = take.actors.find((a) => a.uid === "director")!;
  d.x += 100; d.y -= 200;
  for (const e of take.events) if (e.track === "body" && e.actorUid === "director") { if (e.x !== undefined) e.x += 100; if (e.y !== undefined) e.y -= 200; }
  const next = placementToScript(comp as never, 4, take, catalog)!;
  const sc = (next.escenas as Record<string, unknown>[])[4];
  expect((sc.colocar as Record<string, Record<string, unknown>>).Director).toMatchObject({ x: -450, y: 1039 });
  const walks = (sc.acciones as Record<string, unknown>[]).filter((a) => a.quien === "Director").map((a) => a.x);
  expect(walks).toEqual([540, 1450]);
  // sigue oculto hasta que entra
  const tk = compileScript(next, catalog).project!.takes[4];
  expect(evaluateTake(tk, catalog, 5).actors.find((a) => a.uid === "director")!.visible).toBe(0);
});

it("la pose elegida para una frase se mantiene hasta que se elige otra («gestos»: «volver» = como antes)", () => {
  const sc = (gestos?: string) => ({
    formato: "puñetos-guion-1", ...(gestos ? { gestos } : {}),
    escenas: [{ lugar: "bg_pasillo_maquina", personajes: ["Barbas", "Jefe"], colocar: { Barbas: { gesto: "maq_camara" } }, pasos: [
      { dice: "Barbas", texto: "Hola, ¿qué tal?", gesto: "maq_explica" },
      { dice: "Jefe", texto: "Bien, ¿y tú?" },
      { pausa: 1 },
    ] }],
  });
  const poseAtEnd = (raw: Record<string, unknown>) => {
    const tk = compileScript(raw, catalog).project!.takes[0];
    return evaluateTake(tk, catalog, tk.duration - 0.1).actors.find((a) => a.uid === "barbas")!.poseId;
  };
  expect(poseAtEnd(sc())).toBe("char.barbas.pose_p_maq_explica");
  expect(poseAtEnd(sc("volver"))).toBe("char.barbas.pose_p_maq_camara");
});

it("orientación a mano: espejo, boca abajo y giro (y «mira» manda sobre el giro al andar)", () => {
  const raw = {
    formato: "puñetos-guion-1",
    escenas: [{ lugar: "bg_pasillo_maquina", personajes: ["Barbas", "Jefe"], colocar: { Barbas: { x: 300, voltear_v: true, giro: 30 } }, pasos: [
      { pausa: 1 }, { pausa: 1 }, { pausa: 1 },
    ], acciones: [
      { quien: "Jefe", desde: 1, hasta: 1, x: 200, mira: "derecha" },
      { quien: "Barbas", desde: 2, hasta: 2, mira: "izquierda", giro: 0 },
    ] }],
  };
  const tk = compileScript(raw, catalog).project!.takes[0];
  const at = (t: number, uid: string) => evaluateTake(tk, catalog, t).actors.find((a) => a.uid === uid)!;
  expect(at(0.5, "barbas")).toMatchObject({ flipV: true, rot: 30 });
  // el Jefe anda hacia la izquierda pero sigue mirando a la derecha
  expect(at(2, "jefe").flip).toBe(false);
  expect(at(tk.duration - 0.05, "barbas")).toMatchObject({ flip: true, rot: 0, flipV: true });
});
