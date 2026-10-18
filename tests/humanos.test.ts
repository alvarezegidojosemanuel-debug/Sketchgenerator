import { describe, expect, it } from "vitest";
import { catalog } from "@/lib/catalog";
import { validateProject } from "@/lib/schema/validate";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { layoutActor } from "@/lib/renderer/layout";

const guion = {
  formato: "puñetos-guion-1",
  titulo: "Prueba humanos",
  escenas: [
    {
      nombre: "Despacho",
      lugar: "bg_oficina_manana",
      vista: "humanos",
      personajes: ["Jefe"],
      pasos: [
        { dice: "Jefe", texto: "Tranquilos, equipo, que esto lo tenemos todo controlado desde primera hora." },
        { dice: "Jefe", texto: "¿Qué reunión?", gesto: "confundido" },
      ],
    },
  ],
};

describe("humanos de frente (poses dibujadas enteras)", () => {
  const r = validateProject(structuredClone(guion), catalog);
  const tk = r.project!.takes[0];

  it("la vista «humanos» usa sus poses humanas, no las de Puñeto", () => {
    expect(r.errors).toEqual([]);
    expect(tk.actors[0].poseId).toBe("char.jefe.pose_h_neutro");
    const poses = tk.events.filter((e) => e.track === "body").map((e) => (e as { poseId?: string }).poseId);
    expect(poses).toContain("char.jefe.pose_h_explica");
    expect(poses).toContain("char.jefe.pose_h_confundido");
  });

  it("sin capas de cara y con la boca abierta solo al hablar", () => {
    const line = tk.events.find((e) => e.track === "dialogue")!;
    const quiet = layoutActor(catalog, evaluateTake(tk, catalog, 0.1).actors[0]);
    expect(quiet.face).toEqual([]);
    expect(quiet.talkOpen).toBe(false);
    const open = new Set<boolean | undefined>();
    for (let t = line.start + 0.02; t < line.start + line.duration; t += 0.03) open.add(layoutActor(catalog, evaluateTake(tk, catalog, t).actors[0]).talkOpen);
    expect(open.has(true)).toBe(true);
    // con voz real manda el volumen
    const lv = (v: number) => layoutActor(catalog, evaluateTake(tk, catalog, line.start + 0.2, { levels: new Map([["jefe", v]]) }).actors[0]).talkOpen;
    expect(lv(0.9)).toBe(true);
    expect(lv(0)).toBe(false);
  });

  it("sin «vista», Puñetos; un secundario sin versión Puñeto sale con sus poses humanas", () => {
    const g = structuredClone(guion) as { escenas: Record<string, unknown>[] };
    delete g.escenas[0].vista;
    g.escenas[0].personajes = ["Jefe", "Vanesa"];
    g.escenas[0].pasos = [
      { dice: "Jefe", texto: "Vanesa, ¿tú sabes dónde está la reunión?", gesto: "señala" },
      { dice: "Vanesa", texto: "En tu agenda, Jefe.", gesto: "explica" },
    ];
    const r2 = validateProject(g, catalog);
    expect(r2.errors).toEqual([]);
    const t2 = r2.project!.takes[0];
    expect(t2.actors.map((a) => a.poseId)).toEqual(["char.jefe.pose_p_neutro", "char.vanesa.pose_h_neutro"]);
    const poses = t2.events.filter((e) => e.track === "body" && e.poseId).map((e) => (e as { poseId: string }).poseId);
    expect(poses).toContain("char.jefe.pose_p_senala");
    expect(poses).toContain("char.vanesa.pose_h_explica");
    // «vista: espaldas» ya no existe (no quedan sillas de espaldas): se monta igual que sin vista
    const back = validateProject({ ...g, escenas: [{ ...g.escenas[0], lugar: "bg_oficina_manana", vista: "espaldas" }] }, catalog);
    expect(back.errors).toEqual([]);
    expect(back.project!.takes[0].actors.map((a) => a.poseId)).toEqual(["char.jefe.pose_p_neutro", "char.vanesa.pose_h_neutro"]);
    expect(back.project!.takes[0].events.some((e) => e.track === "props" && e.propId.includes("_espaldas_"))).toBe(false);
  });

});

describe("estatura de los humanos", () => {
  it("las poses dibujadas enteras (humanos y Puñetos) se escalan por la estatura (ref. 1,84 m); las de rig no", async () => {
    const { poseScale, findPose } = await import("@/lib/catalog");
    const flat = { ...findPose(catalog, "jefe", "char.jefe.pose_h_neutro")!, displayScale: 1 };
    expect(poseScale(catalog, "jefe", flat)).toBe(1);
    expect(poseScale(catalog, "sister", flat)).toBeCloseTo(170 / 184);
    expect(poseScale(catalog, "barbas", flat)).toBeCloseTo(187 / 184);
    const puneto = findPose(catalog, "sister", "char.sister.pose_p_neutro")!;
    expect(puneto.flat).toBe(true);
    expect(poseScale(catalog, "sister", puneto)).toBeCloseTo((puneto.displayScale * 170) / 184);
    const rig = { ...flat, flat: false, displayScale: 1.5 };
    expect(poseScale(catalog, "sister", rig)).toBe(1.5);
  });
});

describe("proyecto de prueba de humanos", () => {
  it("se monta y valida, con Jefe y Usu de frente en sistemas", async () => {
    const raw = (await import("./fixtures/guiones/prueba-humanos.json")).default;
    const r = validateProject(structuredClone(raw), catalog);
    expect(r.errors).toEqual([]);
    const tk = r.project!.takes[1];
    expect(tk.backgroundId).toBe("bg_sistemas");
    expect(tk.actors.map((a) => a.poseId)).toEqual(["char.jefe.pose_h_neutro", "char.usu.pose_h_neutro"]);
  });
});

describe("boca de dos fotogramas con voz real", () => {
  it("abre y cierra a ritmo de sílaba mientras suena, y se cierra en silencio", async () => {
    const { flatMouthOpen } = await import("@/lib/timeline/evaluate");
    let toggles = 0, open = 0, prev = false;
    for (let i = 0; i < 60; i++) {
      const o = flatMouthOpen(0.9, i / 60);
      if (o !== prev) toggles++;
      if (o) open++;
      prev = o;
    }
    expect(open).toBeGreaterThan(20);
    expect(open).toBeLessThan(40);
    expect(toggles).toBeLessThanOrEqual(17);
    for (let i = 0; i < 60; i++) expect(flatMouthOpen(0.05, i / 60)).toBe(false);
  });
  it("cuando habla Anastas-IA se ve su pantalla", async () => {
    const raw = (await import("./fixtures/guiones/prueba-humanos.json")).default;
    const r = validateProject(structuredClone(raw), catalog);
    expect(r.project!.takes[1].events.some((e) => e.track === "props" && e.propId === "prop_anastasia_tv" && e.start === 0)).toBe(true);
  });
});

describe("humanos: al hablar siempre con boca", () => {
  it("si el gesto pedido no tiene boca abierta, usa otra pose que sí (para que mueva la boca)", () => {
    const g = { formato: "puñetos-guion-1", escenas: [{ lugar: "bg_sistemas", vista: "humanos", personajes: ["Jefe", "Usu"], pasos: [
      { dice: "Usu", texto: "No sé, yo solo lo he reenviado.", gesto: "encoge" },
      { dice: "Usu", texto: "¡Ay!", gesto: "susto" },
    ] }] };
    const tk = validateProject(g, catalog).project!.takes[0];
    for (const e of tk.events) {
      if (e.track !== "body" || !e.poseId) continue;
      const pose = catalog.characters.find((c) => c.id === "usu")!.poses.find((p) => p.id === e.poseId)!;
      expect(pose.talkSrc, e.poseId).toBeTruthy();
    }
  });
});

describe("sketch «Las lentejas»", () => {
  it("se monta sin errores, con los tres humanos y el Jefe saliendo y volviendo", async () => {
    const raw = (await import("./fixtures/guiones/sketch-lentejas.json")).default;
    const r = validateProject(structuredClone(raw), catalog);
    expect(r.errors).toEqual([]);
    const tk = r.project!.takes[0];
    expect(tk.actors.map((a) => a.poseId)).toEqual(["char.jefe.pose_h_neutro", "char.barbas.pose_h_neutro", "char.usu.pose_h_neutro"]);
    expect(tk.events.some((e) => e.track === "body" && e.actorUid === "jefe" && "disappear" in e && e.disappear)).toBe(true);
    expect(tk.events.some((e) => e.track === "body" && e.poseId === "char.barbas.pose_h_risa")).toBe(true);
  });
});

describe("recursos de cómic", () => {
  it("se ponen solos según el gesto (sudor, sorpresa, líneas, risa) y a mano con «efecto»", async () => {
    const raw = (await import("./fixtures/guiones/sketch-lentejas.json")).default;
    const tk = validateProject(structuredClone(raw), catalog).project!.takes[0];
    const kinds = tk.events.filter((e) => e.track === "screen" && e.effect === "comic").map((e) => (e as { kind?: string }).kind);
    expect(kinds).toEqual(expect.arrayContaining(["sorpresa", "lineas", "risa", "onomatopeya"]));
    const ev = tk.events.find((e) => e.track === "screen" && (e as { kind?: string }).kind === "onomatopeya")!;
    const f = evaluateTake(tk, catalog, ev.start + 0.4);
    const c = f.screen.comics!.find((x) => x.kind === "onomatopeya")!;
    const barbas = f.actors.find((a) => a.uid === "barbas")!;
    expect(Math.abs(c.x - barbas.x)).toBeLessThan(40);
    expect(c.y).toBeLessThan(barbas.y - 500);
  });
});

describe("sketch «El Jefe del pasado»", () => {
  it("Sister sale en escena y habla moviendo la boca; el «Jefe del pasado» usa la voz del Jefe con su pantalla", async () => {
    const raw = (await import("./fixtures/guiones/sketch-jefe-del-pasado.json")).default;
    const r = validateProject(structuredClone(raw), catalog);
    expect(r.errors).toEqual([]);
    const tk = r.project!.takes[0];
    const lines = tk.events.filter((e) => e.track === "dialogue") as { voiceOf?: string; speakerName?: string; actorUid?: string }[];
    expect(lines.filter((l) => l.actorUid === "sister").length).toBe(3);
    const sisterPoses = tk.events.filter((e) => e.track === "body" && e.actorUid === "sister").map((e) => (e as { poseId: string }).poseId);
    for (const id of sisterPoses) expect(catalog.characters.find((c) => c.id === "sister")!.poses.find((p) => p.id === id)?.talkSrc).toBeTruthy();
    const pasado = lines.find((l) => l.speakerName === "Jefe del pasado")!;
    expect(pasado.voiceOf).toBe("jefe");
    expect(tk.events.filter((e) => e.track === "props" && e.propId === "prop_anastasia_pantalla").length).toBe(2);
  });
});

describe("cabeza articulada (piloto Barbas)", () => {
  it("la cabeza gira dentro de un límite mientras habla y al escuchar se ladea hacia quien habla", async () => {
    const { layoutActor } = await import("@/lib/renderer/layout");
    const raw = (await import("./fixtures/guiones/sketch-jefe-del-pasado.json")).default;
    const tk = validateProject(structuredClone(raw), catalog).project!.takes[0];
    const barbasLine = tk.events.filter((e) => e.track === "dialogue" && e.actorUid === "barbas").at(-1)!;
    const rots = new Set<number>();
    for (let t = barbasLine.start + 0.3; t < barbasLine.start + barbasLine.duration - 0.3; t += 0.1) {
      const a = layoutActor(catalog, evaluateTake(tk, catalog, t).actors.find((x) => x.uid === "barbas")!);
      expect(a.pose?.head).toBeTruthy();
      expect(Math.abs(a.headRot)).toBeLessThanOrEqual(7);
      rots.add(Math.round(a.headRot));
    }
    expect(rots.size).toBeGreaterThan(1) // se mueve, pero sutil;
    // el Jefe no tiene cabeza articulada todavía: se dibuja como antes
    const jefe = layoutActor(catalog, evaluateTake(tk, catalog, 1).actors.find((x) => x.uid === "jefe")!);
    expect(jefe.pose?.head).toBeUndefined();
  });
});

describe("se giran hacia quien hablan", () => {
  it("quien habla mira a quien le escucha y quien escucha mira a quien habla", async () => {
    const raw = (await import("./fixtures/guiones/sketch-jefe-del-pasado.json")).default;
    const tk = validateProject(structuredClone(raw), catalog).project!.takes[0];
    const last = tk.events.filter((e) => e.track === "dialogue" && e.actorUid === "barbas").at(-1)!;
    const f = evaluateTake(tk, catalog, last.start + 0.6);
    const b = f.actors.find((a) => a.uid === "barbas")!;
    const j = f.actors.find((a) => a.uid === "jefe")!;
    // Barbas habla al Jefe (a su izquierda): girado; el Jefe le mira (Barbas a su derecha): sin girar
    expect(b.flip).toBe(j.x < b.x);
    expect(j.flip).toBe(b.x < j.x);
  });
});

describe("transición entre tomas", () => {
  it("las escenas de un guion entran y salen con un fundido rápido a negro (salvo «corte»)", () => {
    const esc = (extra: Record<string, unknown> = {}) => ({ lugar: "bg_sistemas", personajes: ["Usu"], pasos: [{ dice: "Usu", texto: "Esto no estaba así ayer, os lo juro." }], ...extra });
    const r = validateProject({ formato: "puñetos-guion-1", escenas: [esc(), esc(), esc({ transicion: "corte" }), esc({ transicion: "blanco" })] }, catalog);
    expect(r.errors).toEqual([]);
    const [, tk, cut, white] = r.project!.takes;
    expect(tk.transition).toBe("fade");
    expect(evaluateTake(tk, catalog, 0.02).screen.darken).toBeGreaterThan(0.9);
    expect(evaluateTake(tk, catalog, tk.duration / 2).screen.darken ?? 0).toBe(0);
    expect(evaluateTake(tk, catalog, tk.duration - 0.02).screen.darken).toBeGreaterThan(0.9);
    expect(cut.transition).toBe("cut");
    expect(evaluateTake(cut, catalog, 0.02).screen.darken ?? 0).toBe(0);
    expect(white.transition).toBe("white");
    expect(evaluateTake(white, catalog, 0.02).screen.flash?.alpha).toBeGreaterThan(0.9);
  });
});

describe("interpretación automática de las voces", () => {
  it("añade acotaciones según el personaje y la frase, sin pisar las que ya trae", async () => {
    const { actingTag } = await import("@/lib/script/compile");
    expect(actingTag("barbas", "Mira qué detalle.")).toBe("[mischievously] Mira qué detalle.");
    expect(actingTag("usu", "A mí.")).toBe("[nervously] A mí.");
    expect(actingTag("jefe", "¡USU, QUITA ESO AHORA MISMO!")).toBe("[shouting] ¡USU, QUITA ESO AHORA MISMO!");
    expect(actingTag("jefe", "¿Qué?")).toBe("[confused] ¿Qué?");
    expect(actingTag("barbas", "[whispers] Oye…")).toBe("[whispers] Oye…");
    expect(actingTag(undefined, "Narrador")).toBe("Narrador");
  });
});

describe("prueba de Reynaldo humano", () => {
  it("se monta de frente y, cuando habla, siempre en una pose con boca", async () => {
    const raw = (await import("./fixtures/guiones/prueba-reynaldo.json")).default;
    const r = validateProject(structuredClone(raw), catalog);
    expect(r.errors).toEqual([]);
    const tk = r.project!.takes[0];
    const rey = catalog.characters.find((c) => c.id === "reynaldo")!;
    expect(tk.actors.find((a) => a.uid === "reynaldo")!.poseId).toBe("char.reynaldo.pose_h_neutro");
    const lines = tk.events.filter((e) => e.track === "dialogue" && e.actorUid === "reynaldo");
    expect(lines.length).toBe(3);
    for (const l of lines) {
      const body = tk.events.filter((e) => e.track === "body" && e.actorUid === "reynaldo" && e.start <= l.start + 0.01).at(-1) as { poseId: string } | undefined;
      const id = body?.poseId ?? "char.reynaldo.pose_h_neutro";
      expect(rey.poses.find((p) => p.id === id)?.talkSrc).toBeTruthy();
    }
  });
});

describe("Anastas-IA", () => {
  it("en off: su tele colgada mueve la boca con su voz; en escena habla como un personaje más", async () => {
    const raw = (await import("./fixtures/guiones/prueba-anastasia.json")).default;
    const r = validateProject(structuredClone(raw), catalog);
    expect(r.errors).toEqual([]);
    const [t1, t2] = r.project!.takes;
    const off = t1.events.find((e) => e.track === "dialogue" && e.voiceOf === "anastasia");
    expect(off).toBeTruthy();
    const scr = t1.events.find((e) => e.track === "props" && e.propId === "prop_anastasia_tv") as { talkOf?: string; altPropId?: string; start: number };
    expect(scr.talkOf).toBe("anastasia");
    expect(scr.altPropId).toBe("prop_anastasia_tv_boca");
    expect(scr.start).toBe(0); // colgada desde el principio, no aparece de la nada
    expect(t2.events.filter((e) => e.track === "dialogue" && e.actorUid === "anastasia").length).toBe(2);
  });
});

describe("Puñetos rediseñados (vista «puñetos»)", () => {
  it("usa las poses pose_p_* y, tumbada, la pose de KO en vez de girar la de pie", () => {
    const g = { formato: "puñetos-guion-1", escenas: [{ lugar: "bg_sistemas", vista: "puñetos", personajes: ["Sister"], tumbados: ["Sister"], pasos: [{ pausa: 1 }] },
      { lugar: "bg_sistemas", vista: "puñetos", personajes: ["Sister"], pasos: [{ dice: "Sister", texto: "¡Hola!", gesto: "saluda" }] }] };
    const r = validateProject(g, catalog);
    expect(r.errors).toEqual([]);
    expect(r.project!.takes[0].actors[0].poseId).toBe("char.sister.pose_p_ko");
    expect(r.project!.takes[0].actors[0].rot).toBeUndefined();
    expect(r.project!.takes[1].actors[0].poseId).toBe("char.sister.pose_p_neutro");
  });
});

describe("tumbados (KO)", () => {
  it("cada uno usa su pose de suelo (ko / tumbado); si no tiene, se gira la de pie sobre los pies", () => {
    const g = { formato: "puñetos-guion-1", escenas: [
      { lugar: "bg_sala_equipo", personajes: ["Usu", "Jefe", "Vanesa"], tumbados: ["Usu", "Jefe", "Vanesa"], pasos: [{ pausa: 1 }] },
      { lugar: "bg_sala_equipo", vista: "humanos", personajes: ["Jefe"], tumbados: ["Jefe"], pasos: [{ pausa: 1 }] },
    ] };
    const r = validateProject(g, catalog);
    expect(r.errors).toEqual([]);
    const [a, b] = r.project!.takes;
    const by = Object.fromEntries(a.actors.map((x) => [x.uid, x]));
    expect(by.usu.poseId).toBe("char.usu.pose_p_tumbado");
    expect(by.jefe.poseId).toBe("char.jefe.pose_p_ko");
    expect(by.usu.rot ?? 0).toBe(0);
    expect(by.jefe.rot ?? 0).toBe(0);
    // Vanesa no tiene pose de suelo: tumbada girando la de pie, hacia fuera y un poco hacia el centro
    expect(by.vanesa.poseId).toBe("char.vanesa.pose_h_neutro");
    expect(Math.abs(by.vanesa.rot!)).toBe(88);
    // el Jefe humano tampoco tiene pose de suelo
    expect(b.actors[0].poseId).toBe("char.jefe.pose_h_neutro");
    expect(Math.abs(b.actors[0].rot!)).toBe(88);
    expect(evaluateTake(b, catalog, 0.5).actors[0].rot).toBe(b.actors[0].rot);
  });
});
