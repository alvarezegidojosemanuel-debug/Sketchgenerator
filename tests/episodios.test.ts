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

import { fitProjectToAudio, clipKey } from "@/lib/voice/fit";

describe("con voces reales nadie desaparece", () => {
  for (const [i, ep] of [ep1, ep2, ep3, ep4, ep5].entries()) {
    it(`Ep. ${i + 1}: tras ajustar a voces más largas y más cortas, cada personaje siempre se ve`, () => {
      const p = validateProject(structuredClone(ep), catalog).project!;
      for (const factor of [0.5, 1.7]) {
        const durations = new Map<string, number>();
        for (const tk of p.takes) for (const e of tk.events) if (e.track === "dialogue") durations.set(clipKey(tk.id, e.id), e.duration * factor);
        const fitted = fitProjectToAudio(p, durations).project;
        for (const tk of fitted.takes) {
          // quién está en pantalla al principio (humanos de espaldas como objetos, o actores)
          const seats = new Set(evaluateTake(tk, catalog, 0.05).props.filter((x) => x.propId.includes("_espaldas_")).map((x) => x.propId.split("_")[1]));
          for (let t = 0.05; t < tk.duration - 0.05; t += 0.05) {
            const f = evaluateTake(tk, catalog, t);
            const seen = new Set(f.props.filter((x) => x.propId.includes("_espaldas_") && x.opacity > 0.5).map((x) => x.propId.split("_")[1]));
            const absent = tk.events.filter((e) => e.track === "props" && e.propId.includes("_espaldas_"));
            for (const who of seats) {
              const hasAny = absent.some((e) => e.track === "props" && e.propId.includes(`prop_${who}_`) && t >= e.start - 1e-6 && t < e.start + e.duration);
              const everLater = absent.some((e) => e.track === "props" && e.propId.includes(`prop_${who}_`) && e.start > t);
              const everBefore = absent.some((e) => e.track === "props" && e.propId.includes(`prop_${who}_`) && e.start + e.duration <= t);
              // si estaba antes y vuelve después, en medio NO puede haber hueco (salvo ausencias del guion, que son > 0.5 s)
              if (!hasAny && everLater && everBefore) {
                const gapEnd = Math.min(...absent.filter((e) => e.track === "props" && e.propId.includes(`prop_${who}_`) && e.start > t).map((e) => e.start));
                expect(gapEnd - t, `${tk.id} ${who} t=${t.toFixed(2)} ×${factor}`).toBeGreaterThan(0.5);
              } else if (hasAny) expect(seen.has(who), `${tk.id} ${who} t=${t.toFixed(2)}`).toBe(true);
            }
            expect(f.actors.every((a) => a.visible > 0 || tk.actors.find((x) => x.uid === a.uid)?.hidden)).toBe(true);
          }
        }
      }
    });
  }
});
