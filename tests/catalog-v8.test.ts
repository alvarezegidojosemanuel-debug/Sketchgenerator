import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyOverrides, emptyOverrides, FACE_SLOTS, findCharacter, findExpression, findFaceAsset, findPose } from "@/lib/catalog";
import { layoutFace } from "@/lib/renderer/face";
import { layoutActor } from "@/lib/renderer/layout";
import { validateOverrides, withExpression, withRig } from "@/lib/face/overrides";
import { evaluateTake, mouthFlap } from "@/lib/timeline/evaluate";
import { Player, type Clock } from "@/lib/timeline/player";
import { validateProject } from "@/lib/schema/validate";
import type { DialogueEvent, PocketProject } from "@/lib/schema/pocket";
import type { ExpressionPrefab } from "@/lib/catalog/types";
import { catalog, readJson, root } from "./helpers";

const fileOf = (src: string) => path.join(root, "public", src);

describe("catálogo V8: carga de recursos reales", () => {
  it("carga los cinco personajes con sus 10 poses reales", () => {
    expect(catalog.source.kind).toBe("v8-library-index");
    expect(catalog.characters.map((c) => c.id)).toEqual(["usu", "reynaldo", "sister", "barbas", "jefe", "director", "neli", "gala", "damian", "cientifica", "vanesa", "ruan", "alf", "fake"]);
    for (const c of catalog.characters.filter((c) => !["director", "neli", "gala", "damian", "cientifica", "vanesa", "ruan", "alf", "fake"].includes(c.id))) {
      expect(c.poses.filter((p) => !p.flat)).toHaveLength(10);
      for (const p of c.poses.filter((p) => !p.flat)) {
        expect(p.id).toBe(`char.${c.id}.${p.key}`);
        expect(fs.existsSync(fileOf(p.src)), p.src).toBe(true);
        expect(p.displayScale).toBeGreaterThan(1);
      }
    }
  });

  it("todas las piezas faciales existen y pertenecen a su personaje", () => {
    let n = 0;
    for (const c of catalog.characters) {
      for (const a of [...c.face.eyes, ...c.face.brows, ...c.face.mouths]) {
        expect(a.id.startsWith(`face.${c.id}.`)).toBe(true);
        expect(fs.existsSync(fileOf(a.src)), a.src).toBe(true);
        n++;
      }
    }
    expect(n).toBe(130); // 23 ojos + 57 cejas + 50 bocas
    expect(findCharacter(catalog, "usu")!.hasEyes).toBe(false);
    expect(findCharacter(catalog, "jefe")!.hasEyes).toBe(false);
  });

  it("no presenta calibraciones como terminadas: rigs estimados y prefabs en borrador", () => {
    for (const c of catalog.characters) {
      for (const p of c.poses.filter((p) => !p.flat)) expect(p.rig?.status).toBe("estimated");
      for (const e of c.expressions) expect(e.status).toBe("draft");
    }
  });

  it("cada prefab usa piezas reales del mismo personaje", () => {
    // el Director solo existe en versión humana (poses dibujadas enteras, sin piezas de cara)
    for (const c of catalog.characters.filter((c) => !["director", "neli", "gala", "damian", "cientifica", "vanesa", "ruan", "alf", "fake"].includes(c.id))) {
      expect(c.expressions.map((e) => e.emotion)).toEqual(catalog.emotions);
      for (const e of c.expressions) {
        for (const s of FACE_SLOTS) {
          const part = s === "mouth" ? e.mouth : e[s];
          if (part) expect(findFaceAsset(c, part.assetId), `${e.id}.${s}`).toBeDefined();
        }
        for (const t of e.talk) expect(findFaceAsset(c, t)).toBeDefined();
      }
    }
  });
});

describe("caras: piezas individuales y posición por pose", () => {
  const sister = findCharacter(catalog, "sister")!;
  const front = findPose(catalog, "sister", "char.sister.pose_neutral_front")!;
  const right = findPose(catalog, "sister", "char.sister.pose_neutral_3q_right")!;
  const neutral = findExpression(catalog, "sister", "expression.sister.neutral")!;

  it("Sister mira al frente: el mismo ojo suelto en ambos lados, el derecho en espejo", () => {
    expect(neutral.eyeL).toEqual({ assetId: "face.sister.eyes.sister_eyes_05" });
    expect(neutral.eyeR).toEqual({ assetId: "face.sister.eyes.sister_eyes_05", flip: true });
  });

  it("ojos y cejas son capas independientes (izq/der) con recorte por lado y espejo", () => {
    const pairNeutral: ExpressionPrefab = {
      ...neutral,
      eyeL: { assetId: "face.sister.eyes.sister_eyes_02_der", crop: "left" },
      eyeR: { assetId: "face.sister.eyes.sister_eyes_02_der", crop: "right" },
    };
    const layers = layoutFace({ character: sister, pose: front, expression: pairNeutral });
    const by = Object.fromEntries(layers.map((l) => [l.slot, l]));
    expect(Object.keys(by).sort()).toEqual(["browL", "browR", "eyeL", "eyeR", "mouth"]);
    // los ojos del par se recortan por mitades: misma imagen, regiones distintas
    expect(by.eyeL.assetId).toBe(by.eyeR.assetId);
    expect(by.eyeL.imgLeft).toBe(0);
    expect(by.eyeR.imgLeft).toBe(-80);
    expect(by.eyeL.width).toBe(80);
    expect(by.browR.flip).toBe(true);
    expect(by.browL.flip).toBe(false);
    // cambiar solo un ojo no afecta al otro (guiño)
    const wink: ExpressionPrefab = { ...pairNeutral, eyeR: { assetId: "face.sister.eyes.sister_eyes_03", crop: "right" } };
    const w = Object.fromEntries(layoutFace({ character: sister, pose: front, expression: wink }).map((l) => [l.slot, l]));
    expect(w.eyeL.assetId).toBe(by.eyeL.assetId);
    expect(w.eyeR.assetId).toBe("face.sister.eyes.sister_eyes_03");
  });

  it("la cara se coloca distinto en cada pose y los ajustes por pose solo afectan a esa pose", () => {
    const a = layoutFace({ character: sister, pose: front, expression: neutral });
    const b = layoutFace({ character: sister, pose: right, expression: neutral });
    expect(a.find((l) => l.slot === "mouth")!.left).not.toBe(b.find((l) => l.slot === "mouth")!.left);
    const tuned: ExpressionPrefab = { ...neutral, poseOverrides: { [front.id]: { mouth: { dy: 12, dscale: 1.2 } } } };
    const a2 = layoutFace({ character: sister, pose: front, expression: tuned }).find((l) => l.slot === "mouth")!;
    const b2 = layoutFace({ character: sister, pose: right, expression: tuned }).find((l) => l.slot === "mouth")!;
    const a1 = a.find((l) => l.slot === "mouth")!;
    expect(a2.top).toBeCloseTo(a1.top + 12);
    expect(a2.scale).toBeCloseTo(a1.scale * 1.2);
    expect(b2).toEqual(b.find((l) => l.slot === "mouth"));
  });

  it("Usu y Jefe no tienen capas de ojos (gafas de sol del cuerpo)", () => {
    const usu = findCharacter(catalog, "usu")!;
    const p = usu.poses[0];
    const l = layoutFace({ character: usu, pose: p, expression: usu.expressions[0] });
    expect(l.map((x) => x.slot).sort()).toEqual(["browL", "browR", "mouth"]);
  });

  it("Barbas y las gafas con cejas dibujadas no duplican cejas", () => {
    const barbas = findCharacter(catalog, "barbas")!;
    for (const e of barbas.expressions) expect(e.browL ?? null).toBeNull();
    const rey = findExpression(catalog, "reynaldo", "expression.reynaldo.enfado")!;
    expect(rey.browL ?? null).toBeNull();
    expect(findExpression(catalog, "reynaldo", "expression.reynaldo.neutral")!.browL).toBeDefined();
  });
});

describe("guardar y recuperar calibraciones y expresiones", () => {
  it("una calibración guardada sustituye al rig estimado y se puede exportar/importar", () => {
    const pose = findPose(catalog, "usu", "char.usu.pose_neutral_front")!;
    const rig = { ...pose.rig!, mouth: { ...pose.rig!.mouth!, y: pose.rig!.mouth!.y + 10 } };
    let ov = withRig(null, catalog, pose.id, rig);
    const prefab: ExpressionPrefab = {
      id: "expression.usu.picaro",
      emotion: "alegria",
      label: "Pícaro",
      status: "final",
      browL: { assetId: "face.usu.brows.usu_brow_05" },
      browR: { assetId: "face.usu.brows.usu_brow_08", flip: true, dy: -6 },
      mouth: { assetId: "face.usu.mouths.usu_mouth_06" },
      talk: ["face.usu.mouths.usu_mouth_05"],
      custom: true,
    };
    ov = withExpression(ov, catalog, "usu", prefab);
    const exported = JSON.parse(JSON.stringify(ov));
    const v = validateOverrides(exported, catalog);
    expect(v.errors).toEqual([]);
    const eff = applyOverrides(catalog, v.value);
    const p2 = findPose(eff, "usu", pose.id)!;
    expect(p2.rig!.status).toBe("calibrated");
    expect(p2.rig!.mouth!.y).toBeCloseTo(pose.rig!.mouth!.y + 10);
    expect(findExpression(eff, "usu", "expression.usu.picaro")).toMatchObject({ label: "Pícaro", status: "final" });
    // el catálogo base no cambia
    expect(findPose(catalog, "usu", pose.id)!.rig!.status).toBe("estimated");
  });

  it("rechaza calibraciones con piezas de otro personaje o poses inexistentes", () => {
    const bad = emptyOverrides(catalog);
    bad.rigs["char.usu.pose_volar"] = { status: "calibrated" };
    bad.expressions["expression.usu.x"] = {
      id: "expression.usu.x", characterId: "usu", emotion: "neutral", label: "X", status: "draft",
      mouth: { assetId: "face.jefe.mouths.jefe_mouth_01" }, talk: [],
    };
    const v = validateOverrides(bad, catalog);
    expect(v.ok).toBe(false);
    expect(v.errors.map((e) => e.path)).toEqual(expect.arrayContaining(["rigs.char.usu.pose_volar", "expressions.expression.usu.x.mouth"]));
  });
});

describe("demo Usu + Reynaldo", () => {
  const raw = readJson<PocketProject>("examples/sketch-usu-reynaldo.json");

  it("valida sin errores ni correcciones", () => {
    const r = validateProject(raw, catalog);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    const tracks = new Set(r.project!.takes.flatMap((t) => t.events.map((e) => e.track)));
    expect([...tracks].sort()).toEqual(["body", "dialogue", "eyes", "face", "mouth", "props"]);
  });

  it("el lip-sync usa las bocas 'talk' de la expresión vigente y la mirada mueve los ojos", () => {
    const p = validateProject(raw, catalog).project!;
    const take = p.takes[0];
    const d = take.events.find((e) => e.id === "t1_d1") as DialogueEvent;
    const t = [...Array(20)].map((_, i) => d.start + i * 0.05).find((x) => mouthFlap(d, x))!;
    const rey = evaluateTake(take, catalog, t).actors.find((a) => a.uid === "rey")!;
    expect(findExpression(catalog, "reynaldo", rey.expressionId!)!.talk).toContain(rey.mouthAssetId);
    const lay = layoutActor(catalog, rey);
    expect(lay.face.find((l) => l.slot === "mouth")!.assetId).toBe(rey.mouthAssetId);
    // la mirada desplaza las capas de ojos
    const t2 = p.takes[1];
    const before = layoutActor(catalog, evaluateTake(t2, catalog, 4.9).actors.find((a) => a.uid === "rey")!);
    const after = layoutActor(catalog, evaluateTake(t2, catalog, 5.15).actors.find((a) => a.uid === "rey")!);
    expect(after.face.find((l) => l.slot === "eyeL")!.top).toBeLessThan(before.face.find((l) => l.slot === "eyeL")!.top);
  });

  it("el reproductor lo interpreta entero", () => {
    let now = 0;
    const q: (() => void)[] = [];
    const clock: Clock = { now: () => now, request: (cb) => q.push(cb), cancel: () => q.splice(0) };
    const said: string[] = [];
    let ended = false;
    const p = validateProject(raw, catalog).project!;
    const pl = new Player(p, { onFrame: () => {}, onDialogue: (e) => { said.push(e.id); }, onEnd: () => (ended = true) }, clock);
    pl.play();
    for (let i = 0; i < 2000 && q.length; i++) {
      now += 33;
      q.shift()!();
    }
    expect(ended).toBe(true);
    expect(said).toEqual(["t1_d1", "t1_d2", "t2_d1", "t2_d2", "t2_d3", "t3_d1", "t3_d2"]);
  });
});

describe("estabilidad al hablar (bocas y ojos siempre en el mismo sitio)", () => {
  const anchorOf = (l: { left: number; top: number; originX: number; originY: number }) => [l.left + l.originX, l.top + l.originY];

  it("todas las bocas de lip-sync comparten el ancla (labio superior) de la boca en reposo, en todas las poses", () => {
    let checked = 0;
    for (const ch of catalog.characters) {
      for (const pose of ch.poses.filter((p) => !p.flat)) {
        for (const e of ch.expressions) {
          const rest = layoutFace({ character: ch, pose, expression: e }).find((l) => l.slot === "mouth")!;
          for (const m of e.talk) {
            const talk = layoutFace({ character: ch, pose, expression: e, mouthAssetId: m }).find((l) => l.slot === "mouth")!;
            expect(anchorOf(talk)[0]).toBeCloseTo(anchorOf(rest)[0], 6);
            expect(anchorOf(talk)[1]).toBeCloseTo(anchorOf(rest)[1], 6);
            // misma escala de dibujo original (se compensa la normalización de cada PNG)
            const a = findFaceAsset(ch, m)!;
            const r = findFaceAsset(ch, e.mouth.assetId)!;
            expect(talk.scale * (a.normScale ?? 1)).toBeCloseTo(rest.scale * (r.normScale ?? 1), 6);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("los ojos quedan anclados al mismo punto en todas las expresiones de una pose", () => {
    for (const ch of catalog.characters.filter((c) => c.hasEyes)) {
      for (const pose of ch.poses.filter((p) => !p.flat)) {
        const ref = layoutFace({ character: ch, pose, expression: ch.expressions[0] });
        for (const e of ch.expressions) {
          const lay = layoutFace({ character: ch, pose, expression: e });
          for (const s of ["eyeL", "eyeR"] as const) {
            expect(anchorOf(lay.find((l) => l.slot === s)!)).toEqual(anchorOf(ref.find((l) => l.slot === s)!));
          }
        }
      }
    }
  });

  it("cada pose tiene rig para todos sus huecos y el tamaño de las piezas es coherente entre poses", () => {
    for (const ch of catalog.characters) {
      const front = ch.poses.find((p) => p.key === "pose_neutral_front")!;
      for (const pose of ch.poses.filter((p) => !p.flat)) {
        const slots = ch.hasEyes ? ["eyeL", "eyeR", "browL", "browR", "mouth"] : ["browL", "browR", "mouth"];
        for (const s of slots) expect(pose.rig?.[s as "mouth"], `${pose.id}.${s}`).toBeDefined();
        // boca: misma escala que la frontal corregida por el tamaño de dibujo de cada hoja
        const k = front.displayScale / pose.displayScale;
        expect(pose.rig!.mouth!.scale).toBeCloseTo(front.rig!.mouth!.scale * k, 2);
      }
    }
  });
});

describe("guardado real de ajustes por expresión+pose (regresión)", () => {
  it("un ajuste de un solo hueco en una pose se guarda y se vuelve a cargar", () => {
    const usu = findCharacter(catalog, "usu")!;
    const e = { ...findExpression(catalog, "usu", "expression.usu.neutral")!, poseOverrides: { "char.usu.pose_neutral_front": { browL: { dx: 0, dy: -6, dscale: 1, rot: 0 } } } };
    const ov = withRig(withExpression(null, catalog, "usu", e), catalog, usu.poses[2].id, usu.poses[2].rig!);
    const back = JSON.parse(JSON.stringify(ov));
    expect(validateOverrides(back, catalog).errors).toEqual([]);
    const eff = applyOverrides(catalog, back);
    expect(findExpression(eff, "usu", "expression.usu.neutral")!.poseOverrides!["char.usu.pose_neutral_front"].browL!.dy).toBe(-6);
  });

  it("una entrada defectuosa no hace perder el resto", async () => {
    const { salvageOverrides } = await import("@/lib/face/overrides");
    const usu = findCharacter(catalog, "usu")!;
    const ov = withRig(null, catalog, usu.poses[0].id, usu.poses[0].rig!);
    (ov.rigs as Record<string, unknown>)["char.usu.pose_inexistente"] = { status: "calibrated" };
    const { value, dropped } = salvageOverrides(JSON.parse(JSON.stringify(ov)), catalog);
    expect(Object.keys(value!.rigs)).toEqual([usu.poses[0].id]);
    expect(dropped).toEqual(["char.usu.pose_inexistente"]);
  });
});
