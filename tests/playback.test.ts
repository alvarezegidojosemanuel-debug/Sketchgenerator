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
    expect(jefeAt(4.5).x).toBeGreaterThan(780);
    expect(jefeAt(6).x).toBe(780);
    expect(jefeAt(6).poseId).toBe("char.jefe.pose_p_neutro");
    expect(jefeAt(6).flip).toBe(true); // a la derecha, mirando a Usu
    expect(jefeAt(6).expressionId).toBe("expression.jefe.enfado");
    const usu = evaluateTake(take, catalog, 9).actors.find((a) => a.uid === "usu")!;
    expect(usu.poseId).toBe("char.usu.pose_p_susto");
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
      onDialogue: (e) => { said.push(e.id); },
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

describe("transiciones suaves", () => {
  it("un cambio de pose cambia a corte a mitad de la transición (sin dos dibujos superpuestos) y termina limpio", async () => {
    const { layoutActor } = await import("@/lib/renderer/layout");
    const { POSE_FADE } = await import("@/lib/timeline/evaluate");
    const take = project().takes[0];
    const ev = take.events.find((e) => e.id === "t1_b1")!; // usu → brazos cruzados (Puñeto)
    const early = evaluateTake(take, catalog, ev.start + POSE_FADE / 4).actors.find((a) => a.uid === "usu")!;
    expect(early.prevPoseId).toBe("char.usu.pose_p_neutro");
    const lay = layoutActor(catalog, early);
    expect(lay.ghost?.pose?.id).toBe("char.usu.pose_p_neutro");
    expect(lay.opacity).toBe(0);
    const late = evaluateTake(take, catalog, ev.start + (POSE_FADE * 3) / 4).actors.find((a) => a.uid === "usu")!;
    const lay2 = layoutActor(catalog, late);
    expect(lay2.ghost).toBeUndefined();
    expect(lay2.opacity).toBeCloseTo(1, 5);
    const end = evaluateTake(take, catalog, ev.start + POSE_FADE + 0.05).actors.find((a) => a.uid === "usu")!;
    expect(end.prevPoseId).toBeUndefined();
    expect(layoutActor(catalog, end).ghost).toBeUndefined();
  });
});

describe("el diálogo manda (sincronía voz ↔ animación)", () => {
  const setup = () => {
    let now = 0;
    const queue: (() => void)[] = [];
    const clock: Clock = { now: () => now, request: (cb) => queue.push(cb), cancel: () => queue.splice(0) };
    const keys: string[] = [];
    const p = project();
    const player = new Player(p, { onFrame: () => {}, onDialogue: (_e, _ti, key) => { keys.push(key); return true; } }, clock);
    const step = (ms: number) => { for (let i = 0; i < ms / 33; i++) { now += 33; queue.shift()?.(); } };
    return { player, keys, step, p, startVoice: (k: string) => player.speechStarted(k), endVoice: (k: string) => player.speechEnded(k) };
  };

  it("si la voz dura más que su bloque, el reloj espera al final del bloque y no adelanta los gestos", () => {
    const { player, keys, step, p, startVoice, endVoice } = setup();
    player.play();
    step(500); // llega el primer diálogo (0.4 s)
    expect(keys.length).toBe(1);
    startVoice(keys[0]);
    const d = p.takes[0].events.find((e) => e.id === "t1_d1")!;
    step(6000); // la voz sigue sonando mucho más que su bloque (2.6 s)
    expect(player.holding).toBe(true);
    expect(player.position).toBeLessThan(d.start + d.duration);
    expect(player.position).toBeGreaterThan(d.start + d.duration - 0.01);
    expect(player.liveSpeakers().has("usu")).toBe(true);
    endVoice(keys[0]);
    step(200);
    expect(player.holding).toBe(false);
    expect(player.position).toBeGreaterThan(d.start + d.duration);
    expect(player.liveSpeakers().size).toBe(0);
  });

  it("si la voz nunca arranca (TTS roto), no bloquea la reproducción", () => {
    const { player, step } = setup();
    player.play();
    step(12000);
    expect(player.position).toBeGreaterThan(5);
  });

  it("con voz real la boca solo se mueve mientras suena", () => {
    const take = project().takes[0];
    const t = 1.0; // dentro del primer diálogo de Usu
    const silent = evaluateTake(take, catalog, t, { live: new Map() }).actors.find((a) => a.uid === "usu")!;
    expect(silent.speaking).toBe(false);
    expect(silent.mouthOpen).toBe(false);
    const talking = evaluateTake(take, catalog, 9.9, { live: new Map([["usu", 0.01]]) }).actors.find((a) => a.uid === "usu")!;
    expect(talking.speaking).toBe(true); // aunque su bloque ya terminó, sigue sonando su voz
    expect(talking.mouthOpen).toBe(true);
  });
});

describe("voz que empieza al instante (audio pregenerado)", () => {
  it("speechStarted dentro de onDialogue cuenta como voz sonando", () => {
    let now = 0;
    const queue: (() => void)[] = [];
    const clock: Clock = { now: () => now, request: (cb) => queue.push(cb), cancel: () => queue.splice(0) };
    const ref: { p?: Player } = {};
    ref.p = new Player(project(), { onFrame: () => {}, onDialogue: (_e, _t, key) => { ref.p!.speechStarted(key); return true; } }, clock);
    ref.p.play();
    for (let i = 0; i < 20; i++) { now += 33; queue.shift()?.(); }
    expect(ref.p.liveClips().get("usu")?.key).toBe("0:t1_d1");
  });

  it("la boca de dos fotogramas se abre según el volumen, sin piezas de cara", async () => {
    const { layoutActor } = await import("@/lib/renderer/layout");
    const { findPose } = await import("@/lib/catalog");
    const take = project().takes[0];
    const at = (level: number, t = 1) => evaluateTake(take, catalog, t, { live: new Map([["usu", 0.1]]), levels: new Map([["usu", level]]) }).actors.find((a) => a.uid === "usu")!;
    const quiet = at(0.05);
    expect(quiet.speaking).toBe(true);
    expect(quiet.mouthOpen).toBe(false);
    const loud = at(1);
    expect(loud.mouthOpen).toBe(true);
    expect(at(1, 1.13).mouthOpen).toBe(false); // a ritmo de sílaba (~8/s), no abierta toda la frase
    // pose «flat» con talkSrc: no hay capas de cara, la boca es la imagen alternativa de la pose
    const pose = findPose(catalog, "usu", loud.poseId)!;
    expect(pose.flat).toBe(true);
    expect(pose.talkSrc).toBeTruthy();
    expect(loud.mouthAssetId).toBeUndefined();
    const lay = layoutActor(catalog, loud);
    expect(lay.face).toEqual([]);
    expect(lay.talkOpen).toBe(true);
    expect(layoutActor(catalog, quiet).talkOpen).toBe(false);
  });

});
