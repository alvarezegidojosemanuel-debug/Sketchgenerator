import { describe, expect, it } from "vitest";
import { autoCategories, poseCategoriesOf } from "@/lib/catalog/poseCategories";
import { catalog } from "@/lib/catalog";

describe("categorías de poses", () => {
  it("clasifica por el nombre (varias a la vez)", () => {
    expect(autoCategories("pose_p_sentado_teclea")).toEqual(["trabajo", "sentado"]);
    expect(autoCategories("pose_p_grita")).toEqual(expect.arrayContaining(["habla", "enfado"]));
    expect(autoCategories("pose_p_ko")).toEqual(["suelo"]);
  });
  it("todas las poses tienen al menos una categoría", () => {
    for (const c of catalog.characters) for (const p of c.poses) expect(poseCategoriesOf(p.id, p.key).length).toBeGreaterThan(0);
  });
  it("lo cambiado a mano manda", () => {
    expect(poseCategoriesOf("x", "pose_p_ko", { x: ["alegria"] })).toEqual(["alegria"]);
  });
});
