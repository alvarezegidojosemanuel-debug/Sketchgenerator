import { describe, expect, it } from "vitest";
import { catalog } from "@/lib/catalog";
import { compileScript } from "@/lib/script/compile";
import { evaluateTake } from "@/lib/timeline/evaluate";

describe("extras con ciclo", () => {
  it("el camarero cambia de fotograma con el tiempo", () => {
    const r = compileScript({ escenas: [{ lugar: "bg_cafeteria", personajes: ["Usu"], pasos: [{ objeto: "prop_extra_camarero", x: 300, y: 1300, capa: "detras" }, { pausa: 5 }] }] }, catalog);
    const take = r.project!.takes[0];
    const ids = new Set([0.5, 2, 4, 6, 8].map((t) => evaluateTake(take, catalog, t).props.find((p) => p.propId.startsWith("prop_extra_camarero"))?.propId));
    expect(ids.size).toBeGreaterThan(1);
  });
});
