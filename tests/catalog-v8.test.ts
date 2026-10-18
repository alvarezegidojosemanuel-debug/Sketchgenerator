import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyOverrides, emptyOverrides, FACE_SLOTS, findCharacter, findExpression, findFaceAsset, findPose } from "@/lib/catalog";
import { layoutActor } from "@/lib/renderer/layout";
import { salvageOverrides, validateOverrides, withExpression, withRig } from "@/lib/face/overrides";
import { evaluateTake } from "@/lib/timeline/evaluate";
import type { ExpressionPrefab, FaceRig } from "@/lib/catalog/types";
import type { Take } from "@/lib/schema/pocket";
import { catalog, root } from "./helpers";

const fileOf = (src: string) => path.join(root, "public", src);
const PROTAS = ["usu", "reynaldo", "sister", "barbas", "jefe"];
/** Rig de cara de prueba (las poses actuales no traen rig: están dibujadas enteras). */
const RIG: FaceRig = { mouth: { x: 200, y: 210, scale: 0.6 }, browL: { x: 150, y: 90, scale: 0.6 }, status: "estimated" };

describe("catálogo: carga de recursos reales", () => {
  it("carga los personajes con sus poses dibujadas enteras (Puñeto y Humano), sin poses del rig V8", () => {
    expect(catalog.source.kind).toBe("v8-library-index");
    expect(catalog.characters.map((c) => c.id)).toEqual(["usu", "reynaldo", "sister", "barbas", "jefe", "director", "neli", "gala", "damian", "cientifica", "vanesa", "ruan", "alf", "fake", "anastasia"]);
    for (const c of catalog.characters) {
      // todos tienen su versión humana; solo los cinco protagonistas tienen versión Puñeto
      expect(c.poses.some((p) => p.key === "pose_h_neutro"), c.id).toBe(true);
      expect(c.poses.some((p) => p.key === "pose_p_neutro"), c.id).toBe(PROTAS.includes(c.id));
      for (const p of c.poses) {
        expect(p.id).toBe(`char.${c.id}.${p.key}`);
        expect(p.key, p.id).toMatch(/^pose_[hp]_[a-z0-9_]+$/);
        expect(p.flat, p.id).toBe(true);
        expect(p.rig, p.id).toBeUndefined();
        expect(p.displayScale).toBeGreaterThan(0);
        for (const src of [p.src, p.talkSrc, p.bodySrc, p.head?.src, p.head?.talkSrc]) if (src) expect(fs.existsSync(fileOf(src)), src).toBe(true);
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

  it("no presenta calibraciones como terminadas: prefabs de expresión en borrador", () => {
    for (const c of catalog.characters) for (const e of c.expressions) expect(e.status).toBe("draft");
  });

  it("cada prefab usa piezas reales del mismo personaje", () => {
    for (const c of catalog.characters.filter((c) => PROTAS.includes(c.id))) {
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

describe("caras: prefabs y poses dibujadas enteras", () => {
  it("Sister mira al frente: el mismo ojo suelto en ambos lados, el derecho en espejo", () => {
    const neutral = findExpression(catalog, "sister", "expression.sister.neutral")!;
    expect(neutral.eyeL).toEqual({ assetId: "face.sister.eyes.sister_eyes_05" });
    expect(neutral.eyeR).toEqual({ assetId: "face.sister.eyes.sister_eyes_05", flip: true });
  });

  it("Barbas y las gafas con cejas dibujadas no duplican cejas", () => {
    const barbas = findCharacter(catalog, "barbas")!;
    for (const e of barbas.expressions) expect(e.browL ?? null).toBeNull();
    const rey = findExpression(catalog, "reynaldo", "expression.reynaldo.enfado")!;
    expect(rey.browL ?? null).toBeNull();
    expect(findExpression(catalog, "reynaldo", "expression.reynaldo.neutral")!.browL).toBeDefined();
  });

  it("ninguna pose usa capas de cara: la boca es la imagen alternativa (talkSrc) de la pose", () => {
    for (const c of catalog.characters) {
      for (const p of c.poses) {
        const take: Take = { id: "t", duration: 1, backgroundId: null, actors: [{ uid: "a", characterId: c.id, poseId: p.id, x: 540, y: 1780, scale: 1, zIndex: 0 }], events: [] };
        const lay = layoutActor(catalog, evaluateTake(take, catalog, 0.5, { life: false }).actors[0]);
        expect(lay.face, p.id).toEqual([]);
        expect(lay.talkOpen, p.id).toBe(p.talkSrc ? false : undefined);
      }
    }
  });
});

describe("guardar y recuperar calibraciones y expresiones", () => {
  it("una expresión y un rig guardados se aplican y se pueden exportar/importar", () => {
    const pose = findPose(catalog, "usu", "char.usu.pose_p_neutro")!;
    let ov = withRig(null, catalog, pose.id, RIG);
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
    expect(p2.rig!.mouth!.y).toBeCloseTo(RIG.mouth!.y);
    expect(findExpression(eff, "usu", "expression.usu.picaro")).toMatchObject({ label: "Pícaro", status: "final" });
    // el catálogo base no cambia
    expect(findPose(catalog, "usu", pose.id)!.rig).toBeUndefined();
    expect(findExpression(catalog, "usu", "expression.usu.picaro")).toBeUndefined();
  });

  it("rechaza calibraciones con piezas de otro personaje o poses inexistentes (también las del rig V8 retirado)", () => {
    const bad = emptyOverrides(catalog);
    bad.rigs["char.usu.pose_volar"] = { status: "calibrated" };
    bad.rigs["char.usu.pose_neutral_front"] = { status: "calibrated" };
    bad.expressions["expression.usu.x"] = {
      id: "expression.usu.x", characterId: "usu", emotion: "neutral", label: "X", status: "draft",
      mouth: { assetId: "face.jefe.mouths.jefe_mouth_01" }, talk: [],
    };
    const v = validateOverrides(bad, catalog);
    expect(v.ok).toBe(false);
    expect(v.errors.map((e) => e.path)).toEqual(expect.arrayContaining(["rigs.char.usu.pose_volar", "rigs.char.usu.pose_neutral_front", "expressions.expression.usu.x.mouth"]));
  });
});

describe("guardado real de ajustes por expresión+pose (regresión)", () => {
  it("un ajuste de un solo hueco en una pose se guarda y se vuelve a cargar", () => {
    const e = { ...findExpression(catalog, "usu", "expression.usu.neutral")!, poseOverrides: { "char.usu.pose_p_neutro": { browL: { dx: 0, dy: -6, dscale: 1, rot: 0 } } } };
    const ov = withRig(withExpression(null, catalog, "usu", e), catalog, "char.usu.pose_p_senala", RIG);
    const back = JSON.parse(JSON.stringify(ov));
    expect(validateOverrides(back, catalog).errors).toEqual([]);
    const eff = applyOverrides(catalog, back);
    expect(findExpression(eff, "usu", "expression.usu.neutral")!.poseOverrides!["char.usu.pose_p_neutro"].browL!.dy).toBe(-6);
  });

  it("una entrada defectuosa no hace perder el resto", () => {
    const ov = withRig(null, catalog, "char.usu.pose_p_neutro", RIG);
    (ov.rigs as Record<string, unknown>)["char.usu.pose_inexistente"] = { status: "calibrated" };
    const { value, dropped } = salvageOverrides(JSON.parse(JSON.stringify(ov)), catalog);
    expect(Object.keys(value!.rigs)).toEqual(["char.usu.pose_p_neutro"]);
    expect(dropped).toEqual(["char.usu.pose_inexistente"]);
  });
});
