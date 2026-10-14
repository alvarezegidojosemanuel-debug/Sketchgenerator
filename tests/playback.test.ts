import { describe, expect, it } from "vitest";
import { evaluateTake, locate, mouthFlap } from "@/lib/timeline/evaluate";
import { Player, type Clock } from "@/lib/timeline/player";
import { validateProject } from "@/lib/schema/validate";
import type { DialogueEvent } from "@/lib/schema/pocket";
import { catalog, demo } from "./helpers";

const project = () => validateProject(demo(), catalog).project!;

describe("evaluación de la línea de tiempo", () => {
  it("interpola movimiento body y aplica pose/expresión", () => {
    const take = project().takes[0];
    const jefeAt = (t: number) => evaluateTake(take, catalog, t).actors.find((a) => a.uid === "jefe")!;
    expect(jefeAt(0).x).toBe(1400);
    expect(jefeAt(4.5).x).toBeLessThan(1400);
    expect(jefeAt(4.5).x).toBeGreaterThan(760);
    expect(jefeAt(6).x).toBe(760);
    expect(jefeAt(6).expressionId).toBe("jefe_cara_enfadado");
    const usu = evaluateTake(take, catalog, 9).actors.find((a) => a.uid === "usu")!;
    expect(usu.poseId).toBe("usu_manos_arriba");
  });

  it("subtítulos, boca y props activos solo en su intervalo", () => {
    const take = project().takes[0];
    const f = evaluateTake(take, catalog, 1);
    expect(f.subtitles.map((s) => s.speaker)).toEqual(["Usu"]);
    expect(f.actors.find((a) => a.uid === "usu")!.speaking).toBe(true);
    expect(f.props.map((p) => p.propId)).toEqual(["prop_cafe"]);
    const g = evaluateTake(take, catalog, 5);
    expect(g.subtitles).toEqual([]);
    expect(g.props).toEqual([]);
  });

  it("la boca se cierra al final de la frase", () => {
    const e = project().takes[0].events.find((x) => x.track === "dialogue") as DialogueEvent;
    expect(mouthFlap(e, e.start + e.duration - 0.05)).toBe(false);
    const opens = Array.from({ length: 20 }, (_, i) => mouthFlap(e, e.start + i * 0.1)).filter(Boolean).length;
    expect(opens).toBeGreaterThan(3);
  });

  it("locate reparte el tiempo global entre tomas", () => {
    expect(locate(project(), 12.5)).toEqual({ takeIndex: 1, t: 2.5 });
    expect(locate(project(), 99)).toEqual({ takeIndex: 2, t: 10 });
  });
});

describe("reproductor sin clave ni red (prueba 1)", () => {
  it("reproduce los 30 s, dispara cada diálogo una vez en orden y termina", () => {
    let now = 0;
    const queue: (() => void)[] = [];
    const clock: Clock = { now: () => now, request: (cb) => queue.push(cb), cancel: () => queue.splice(0) };
    const said: string[] = [];
    let interrupts = 0;
    let ended = false;
    const frames = new Set<number>();
    const p = project();
    const player = new Player(p, {
      onFrame: (ti) => frames.add(ti),
      onDialogue: (e) => said.push(e.id),
      onInterrupt: () => interrupts++,
      onEnd: () => (ended = true),
    }, clock);
    player.play();
    for (let i = 0; i < 2000 && queue.length; i++) {
      now += 1000 / 30;
      queue.shift()!();
    }
    const expected = p.takes.flatMap((t) => [...t.events].filter((e) => e.track === "dialogue").sort((a, b) => a.start - b.start).map((e) => e.id));
    expect(said).toEqual(expected);
    expect(ended).toBe(true);
    expect([...frames]).toEqual([0, 1, 2]);
    expect(interrupts).toBeGreaterThanOrEqual(3); // 2 cambios de toma + fin
    expect(player.playing).toBe(false);
  });
});
