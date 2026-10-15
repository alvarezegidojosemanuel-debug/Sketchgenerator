import { describe, expect, it } from "vitest";
import { catalog } from "@/lib/catalog";
import { validateProject } from "@/lib/schema/validate";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { castIds } from "@/lib/voice/catalog";
import ep1 from "@/data/ep1.json";
import ep2 from "@/data/ep2.json";
import ep3 from "@/data/ep3.json";
import ep4 from "@/data/ep4.json";
import ep5 from "@/data/ep5.json";

describe("los 5 episodios iniciales", () => {
  for (const [i, ep] of [ep1, ep2, ep3, ep4, ep5].entries()) {
    it(`Ep. ${i + 1} valida y se puede evaluar en todo su recorrido`, () => {
      const r = validateProject(structuredClone(ep), catalog);
      expect(r.errors).toEqual([]);
      for (const take of r.project!.takes) {
        for (let t = 0; t <= take.duration; t += 0.5) evaluateTake(take, catalog, t);
      }
      expect(r.project!.metadata.approxDuration).toBeGreaterThan(25);
    });
  }
  it("los secundarios en off tienen su propia voz en el reparto", () => {
    const r = validateProject(structuredClone(ep4), catalog);
    const ids = castIds(r.project!);
    expect(ids).toEqual(expect.arrayContaining(["extra_empleado_del_banco", "extra_cunado", "extra_vecino"]));
    const f = evaluateTake(r.project!.takes[0], catalog, 1);
    expect(f.subtitles[0].speaker).toBe("Empleado del banco");
  });
});
