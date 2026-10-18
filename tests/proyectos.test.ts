import { describe, expect, it } from "vitest";
import { catalog } from "@/lib/catalog";
import { validateProject } from "@/lib/schema/validate";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { castIds } from "@/lib/voice/catalog";
import { fitProjectToAudio, clipKey } from "@/lib/voice/fit";
import { LIMITS, type PocketProject, type Take } from "@/lib/schema/pocket";
import corto01 from "@/data/corto-01-lunes.json";
import capitulo02 from "@/data/capitulo-02-novia.json";
import sister01 from "@/data/sister-01-espacio-tiempo.json";
import sketch01 from "@/data/sketch-01-en-vigor.json";

/** Guiones «puñetos-guion-1» que vienen con la app. */
const GUIONES = { "corto-01-lunes": corto01, "capitulo-02-novia": capitulo02, "sister-01-espacio-tiempo": sister01, "sketch-01-en-vigor": sketch01 } as Record<string, unknown>;
const build = (raw: unknown) => validateProject(structuredClone(raw), catalog);

describe("proyectos empaquetados (guiones)", () => {
  for (const [name, raw] of Object.entries(GUIONES)) {
    it(`${name}: se monta, valida y se puede evaluar en todo su recorrido`, () => {
      expect((raw as { formato?: string }).formato).toBe("puñetos-guion-1");
      const r = build(raw);
      expect(r.errors).toEqual([]);
      expect(r.warnings.filter((w) => /no existe/.test(w.message))).toEqual([]);
      for (const take of r.project!.takes) {
        for (const a of take.actors) {
          // solo poses dibujadas enteras: Puñetos (pose_p_*) o humanos (pose_h_*)
          expect(a.poseId, `${take.id}/${a.uid}`).toMatch(/\.pose_[hp]_/);
        }
        for (let t = 0; t <= take.duration; t += 0.5) evaluateTake(take, catalog, t);
      }
      expect(r.project!.metadata.approxDuration).toBeGreaterThan(25);
    });
  }

  it("sin «vista», las escenas usan los Puñetos y los secundarios sus poses humanas", () => {
    const r = build(corto01);
    const raw = corto01 as { escenas: { vista?: string; personajes?: string[] }[] };
    raw.escenas.forEach((sc, i) => {
      const tk = r.project!.takes[i];
      for (const a of tk.actors) {
        const hasP = catalog.characters.find((c) => c.id === a.characterId)!.poses.some((p) => p.key === "pose_p_neutro");
        const human = (sc.vista ?? "").startsWith("human") || !hasP;
        expect(a.poseId.includes(human ? ".pose_h_" : ".pose_p_"), `${tk.id}/${a.uid} ${a.poseId}`).toBe(true);
      }
    });
  });

  it("los secundarios en off tienen su propia voz en el reparto", () => {
    const g = { formato: "puñetos-guion-1", escenas: [{ lugar: "bg_recepcion", personajes: ["Usu"], pasos: [
      { off: "Empleado del banco", texto: "Su tarjeta ha sido rechazada." },
      { off: "Cuñado", texto: "Ya te lo dije yo." },
      { dice: "Usu", texto: "Pues vaya lunes." },
    ] }] };
    const r = build(g);
    expect(r.errors).toEqual([]);
    expect(castIds(r.project!)).toEqual(expect.arrayContaining(["usu", "extra_empleado_del_banco", "extra_cunado"]));
    const first = r.project!.takes[0].events.find((e) => e.track === "dialogue")!;
    expect(evaluateTake(r.project!.takes[0], catalog, first.start + 0.2).subtitles[0].speaker).toBe("Empleado del banco");
  });
});

/** Actores visibles (opacidad > 0) en t. */
const visibleAt = (tk: Take, t: number) => new Set(evaluateTake(tk, catalog, t, { life: false }).actors.filter((a) => a.visible > 0).map((a) => a.uid));

describe("con voces reales nadie desaparece", () => {
  for (const [name, raw] of Object.entries(GUIONES)) {
    it(`${name}: tras ajustar a voces más largas y más cortas, cada personaje siempre se ve`, () => {
      const p: PocketProject = build(raw).project!;
      for (const factor of [0.5, 1.7]) {
        const durations = new Map<string, number>();
        for (const tk of p.takes) for (const e of tk.events) if (e.track === "dialogue") durations.set(clipKey(tk.id, e.id), e.duration * factor);
        const fitted = fitProjectToAudio(p, durations).project;
        // (si las voces alargan el total por encima del máximo de 180 s, el proyecto ya no cabe: no se valida)
        if (fitted.takes.reduce((a, t) => a + t.duration, 0) <= LIMITS.maxTotalDuration) expect(validateProject(fitted, catalog).errors, `×${factor}`).toEqual([]);
        for (const tk of fitted.takes) {
          // quien no entra ni sale en la toma está en pantalla de principio a fin
          const steady = tk.actors.filter((a) => !a.hidden && !tk.events.some((e) => e.track === "body" && e.actorUid === a.uid && (e.appear || e.disappear))).map((a) => a.uid);
          for (let t = 0.05; t < tk.duration - 0.05; t += 0.1) {
            const seen = visibleAt(tk, t);
            for (const uid of steady) expect(seen.has(uid), `${tk.id} ${uid} t=${t.toFixed(2)} ×${factor}`).toBe(true);
          }
          // hasta el último fotograma: quien estaba al final de la toma original sigue estando
          const orig = p.takes.find((x) => x.id === tk.id)!;
          expect([...visibleAt(tk, tk.duration - 0.02)].sort(), `${tk.id} final ×${factor}`).toEqual([...visibleAt(orig, orig.duration - 0.02)].sort());
          // los objetos que llegaban al final de la toma siguen llegando al nuevo final
          const lastProps = (take: Take) => evaluateTake(take, catalog, take.duration - 0.02, { life: false }).props.filter((x) => x.opacity > 0.5).map((x) => x.propId).sort();
          expect(lastProps(tk), `${tk.id} objetos ×${factor}`).toEqual(lastProps(orig));
        }
      }
    });
  }
});
