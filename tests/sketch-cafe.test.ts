import { it, expect } from "vitest";
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
