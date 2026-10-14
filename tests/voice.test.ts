import { describe, expect, it } from "vitest";
import { encodeWav, envelope, levelAt, resample, trimSilence } from "@/lib/voice/dsp";
import { clipKey, fitProjectToAudio } from "@/lib/voice/fit";
import { attributionsFor, DEFAULT_CAST, PIPER_VOICES, castFor } from "@/lib/voice/catalog";
import { validateProject } from "@/lib/schema/validate";
import { catalog, demo } from "./helpers";

const sine = (hz: number, secs: number, sr = 22050, amp = 0.5) => Float32Array.from({ length: Math.round(secs * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));

describe("DSP de voz", () => {
  it("el cambio de tono remuestrea (más agudo = más corto; la síntesis lo compensa con la velocidad)", () => {
    const x = sine(200, 1);
    expect(resample(x, 1.25).length).toBe(Math.floor(x.length / 1.25));
    expect(resample(x, 1)).toBe(x);
  });

  it("la envolvente sigue el volumen: silencio → 0, voz → alto", () => {
    const sr = 22050;
    const x = new Float32Array(sr); // 0,5 s silencio + 0,5 s tono
    x.set(sine(220, 0.5, sr), sr / 2);
    const env = envelope(x, sr);
    expect(levelAt(env, 0.2)).toBeLessThan(0.05);
    expect(levelAt(env, 0.8)).toBeGreaterThan(0.8);
  });

  it("recorta silencios y codifica WAV válido", () => {
    const sr = 22050;
    const x = new Float32Array(sr * 2);
    x.set(sine(220, 0.5, sr), sr / 2);
    const t = trimSilence(x, sr);
    expect(t.length).toBeLessThan(sr * 0.7);
    const wav = new DataView(encodeWav(t, sr));
    expect(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3))).toBe("RIFF");
    expect(wav.getUint32(24, true)).toBe(sr);
  });
});

describe("reparto y licencias", () => {
  it("el reparto por defecto usa voces del catálogo y cubre a los cinco personajes", () => {
    for (const c of ["usu", "reynaldo", "sister", "barbas", "jefe"]) {
      const v = PIPER_VOICES.find((x) => x.id === castFor(c).voiceId);
      expect(v, c).toBeDefined();
      if (castFor(c).speaker !== undefined) expect(Object.values(v!.speakers ?? {})).toContain(castFor(c).speaker);
    }
  });

  it("lista los créditos obligatorios de las voces con atribución", () => {
    expect(attributionsFor(DEFAULT_CAST, ["sister"])[0]).toMatch(/sharvard.*CC BY 3.0/);
    expect(attributionsFor(DEFAULT_CAST, ["usu"])).toEqual([]); // davefx es CC0
  });
});

describe("ajustar diálogos a la voz real", () => {
  it("alarga el bloque a la voz y desplaza lo que viene detrás sin solapar", () => {
    const p = validateProject(demo(), catalog).project!;
    const take = p.takes[0];
    const d1 = take.events.find((e) => e.id === "t1_d1")!;
    const after = take.events.filter((e) => e.start >= d1.start + d1.duration).map((e) => [e.id, e.start] as const);
    const durations = new Map([[clipKey(take.id, "t1_d1"), d1.duration + 1.5]]);
    const { project, changed } = fitProjectToAudio(p, durations);
    expect(changed).toBe(1);
    const t2 = project.takes[0];
    const nd1 = t2.events.find((e) => e.id === "t1_d1")!;
    expect(nd1.duration).toBeCloseTo(d1.duration + 1.5 + 0.12, 2);
    for (const [id, start] of after) {
      expect(t2.events.find((e) => e.id === id)!.start).toBeCloseTo(start + 1.62, 2);
    }
    expect(t2.duration).toBeGreaterThan(take.duration);
    expect(validateProject(project, catalog).errors).toEqual([]);
  });
});
