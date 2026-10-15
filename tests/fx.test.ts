import { describe, expect, it } from "vitest";
import { catalog } from "@/lib/catalog";
import { synthSamples, BUILTIN_SOUNDS } from "@/lib/sfx/synth";
import { propAnim, bodyFx, screenFx } from "@/lib/timeline/fx";
import { validateProject } from "@/lib/schema/validate";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { removeBackground } from "@/lib/library/image";
import demo from "@/data/sketch-interacciones.json";

describe("sonidos sintetizados", () => {
  it("cada sonido integrado genera muestras finitas y acotadas", () => {
    expect(BUILTIN_SOUNDS.length).toBeGreaterThanOrEqual(8);
    for (const s of BUILTIN_SOUNDS) {
      const x = synthSamples(s.src.replace("synth:", ""))!;
      expect(x.length).toBeGreaterThan(1000);
      let peak = 0;
      for (const v of x) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0.05);
      expect(peak).toBeLessThanOrEqual(1);
    }
  });
});

describe("animaciones", () => {
  const base = { id: "p", track: "props" as const, propId: "prop_cafe", layer: "props-front" as const, x: 100, y: 100, start: 0, duration: 2 };
  it("pop entra desde escala 0 y termina en 1", () => {
    const e = { ...base, enter: "pop" as const, exit: "none" as const };
    expect(propAnim(e, 0).scale).toBeLessThan(0.1);
    expect(propAnim(e, 1).scale).toBeCloseTo(1, 3);
  });
  it("fade de salida baja la opacidad al final", () => {
    const e = { ...base, enter: "none" as const, exit: "fade" as const };
    expect(propAnim(e, 1).opacity).toBe(1);
    expect(propAnim(e, 1.99).opacity).toBeLessThan(0.2);
  });
  it("movimiento a toX/toY llega al destino", () => {
    const e = { ...base, enter: "none" as const, exit: "none" as const, toX: 500, toY: 300 };
    const a = propAnim(e, 2);
    expect(a.dx).toBeCloseTo(400, 0);
    expect(a.dy).toBeCloseTo(200, 0);
  });
  it("salto sube y vuelve al suelo", () => {
    const e = { id: "b", track: "body" as const, actorUid: "u", start: 0, duration: 1, fx: "jump" as const };
    expect(bodyFx(e, 0.5).dy).toBeLessThan(-50);
    expect(Math.abs(bodyFx(e, 1).dy)).toBeLessThan(1);
  });
  it("flash rojo por defecto", () => {
    const e = { id: "s", track: "screen" as const, effect: "flash" as const, start: 0, duration: 2 };
    const acc = { darken: 0 } as unknown as Parameters<typeof screenFx>[2];
    screenFx(e, 0.3, acc);
    expect(acc.flash?.color).toBe("#ff2a2a");
  });
});

describe("demo de interacciones", () => {
  const r = validateProject(structuredClone(demo), catalog);
  it("valida", () => {
    expect(r.errors).toEqual([]);
    expect(r.project).toBeTruthy();
  });
  it("el bocadillo aparece sobre la cabeza de Usu y suena el teléfono", () => {
    const take = r.project!.takes[0];
    const f = evaluateTake(take, catalog, 7.5);
    const bubbled = f.props.find((p: { bubble?: unknown }) => p.bubble);
    expect(bubbled).toBeTruthy();
    const usu = take.actors.find((a) => a.uid === "usu")!;
    expect(bubbled!.bubble!.cy).toBeLessThan(usu.y - 500);
    expect(evaluateTake(take, catalog, 11).screen.flash).toBeTruthy();
  });
  it("rechaza sonidos inexistentes y bocadillos de actores ausentes", () => {
    const bad = structuredClone(demo) as typeof demo;
    (bad.takes[0].events.find((e) => e.id === "a_tel") as { soundId: string }).soundId = "sfx_inventado";
    (bad.takes[0].events.find((e) => e.id === "a_drag") as { bubbleOf: string }).bubbleOf = "nadie";
    const rr = validateProject(bad, catalog);
    expect(rr.project).toBeFalsy();
    expect(JSON.stringify(rr.errors)).toMatch(/sfx_inventado|sonido/i);
  });
});

describe("quitar fondo blanco", () => {
  it("vuelve transparente el blanco del borde y respeta el centro", () => {
    const w = 20, h = 20;
    const d = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) {
      const i = (y * w + x) * 4;
      d[i] = 200; d[i + 1] = 30; d[i + 2] = 30;
    }
    removeBackground(d, w, h, 30);
    expect(d[3]).toBe(0);
    expect(d[(10 * w + 10) * 4 + 3]).toBe(255);
  });
});
