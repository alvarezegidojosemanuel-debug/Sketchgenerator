#!/usr/bin/env python3
"""
Extiende las calibraciones hechas a mano (export de Pocket «Exportar caras») a TODAS las poses.

Uso:  python3 -I scripts/v8/derive_calibration.py calibration/<archivo>.json
Escribe src/data/face-overrides.json (se aplica sobre el catálogo para todos los usuarios).

Método (por personaje y hueco facial):
  1. Posición efectiva calibrada en cada pose calibrada = rig del usuario + media de los ajustes
     por expresión en esa pose (los ajustes específicos de cada expresión se guardan aparte).
  2. Corrección = calibrado − estimado, normalizada por el tamaño de dibujo de la pose
     (displayScale) y referida a la orientación: en poses 3/4 se usa «lado cercano / lejano»
     y el desplazamiento horizontal se mide «hacia donde mira» (así una corrección hecha en
     3/4 izquierda vale, en espejo, para 3/4 derecha).
  3. Se aplica la corrección media (de poses frontales a poses frontales y de 3/4 a 3/4;
     si un grupo no tiene datos se usa el otro) a cada pose no calibrada.
  4. Los ajustes propios de cada expresión se reaplican en todas las poses, escalados.
Las poses calibradas a mano se conservan exactamente (status "calibrated"); las derivadas
quedan con status "derived".
"""
import json, os, sys, statistics as st
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SLOTS = ["eyeL", "eyeR", "browL", "browR", "mouth"]


def facing_of(pose, im):
    """-1 mira a la izquierda, 1 a la derecha, 0 de frente (rasgos desplazados respecto a la cabeza)."""
    k = pose["key"]
    if "left" in k:
        return -1
    if "right" in k:
        return 1
    rig = pose.get("rig") or {}
    pts = [rig[s]["x"] for s in ("eyeL", "eyeR", "browL", "browR") if s in rig]
    if not pts:
        return 0
    a = im.convert("RGBA").getchannel("A")
    w, h = a.size
    top = a.crop((0, 0, w, int(h * 0.35))).point(lambda v: 255 if v > 100 else 0).getbbox()
    if not top:
        return 0
    head_cx, head_w = (top[0] + top[2]) / 2, top[2] - top[0]
    off = (sum(pts) / len(pts) - head_cx) / head_w
    return -1 if off < -0.045 else 1 if off > 0.045 else 0


def role(slot, f):
    """En 3/4 los lados se nombran cercano/lejano; de frente, izquierda/derecha."""
    if slot == "mouth" or f == 0:
        return slot
    side = slot[-1]  # L / R
    far = (side == "L") == (f == -1)
    return slot[:-1] + ("Far" if far else "Near")


def consensus_facing(cat):
    """Las 10 poses son las mismas para los 5 personajes: orientación por mayoría; la frontal siempre 0."""
    votes = {}
    for ch in cat["characters"]:
        for p in ch["poses"]:
            im = Image.open(os.path.join(ROOT, "public", p["src"].lstrip("/")))
            votes.setdefault(p["key"], []).append(facing_of(p, im))
    out = {}
    for key, v in votes.items():
        out[key] = 0 if key == "pose_neutral_front" else max(set(v), key=v.count)
    return out


def main():
    src = json.load(open(sys.argv[1], encoding="utf-8"))
    cat = json.load(open(os.path.join(ROOT, "src/data/catalog.json"), encoding="utf-8"))
    FACING = consensus_facing(cat)
    out = {"kind": "pocket-face-overrides", "version": 1, "catalogVersion": cat["catalogVersion"],
           "updatedAt": src.get("updatedAt"), "rigs": {}, "expressions": {}}
    report = []
    for ch in cat["characters"]:
        cid = ch["id"]
        poses = {p["id"]: p for p in ch["poses"]}
        front = next(p for p in ch["poses"] if p["key"] == "pose_neutral_front")
        size = {pid: front["displayScale"] / p["displayScale"] for pid, p in poses.items()}  # px de la pose / px frontal
        facing = {pid: FACING[p["key"]] for pid, p in poses.items()}
        user_exprs = {k: v for k, v in src.get("expressions", {}).items() if v.get("characterId") == cid}
        base_exprs = {e["id"]: e for e in ch["expressions"]}
        all_exprs = {**base_exprs, **{k: {kk: vv for kk, vv in v.items() if kk != "characterId"} for k, v in user_exprs.items()}}

        # 1. posición efectiva calibrada + residuos por expresión
        target, residual = {}, {}
        cal_poses = [pid for pid in poses if pid in src.get("rigs", {})]
        for pid in poses:
            ovs = {eid: (e.get("poseOverrides") or {}).get(pid, {}) for eid, e in all_exprs.items()}
            touched = any(ovs.values())
            if pid not in cal_poses and not touched:
                continue
            rig = json.loads(json.dumps(src["rigs"].get(pid) or poses[pid]["rig"]))
            for sl in SLOTS:
                if sl not in rig:
                    continue
                vals = [ovs[e].get(sl, {}) for e in all_exprs]
                mdx = st.mean(v.get("dx", 0) for v in vals)
                mdy = st.mean(v.get("dy", 0) for v in vals)
                mds = st.mean(v.get("dscale", 1) for v in vals)
                rig[sl]["x"] += mdx
                rig[sl]["y"] += mdy
                rig[sl]["scale"] *= mds
                for e, v in zip(all_exprs, vals):
                    r = {"dx": v.get("dx", 0) - mdx, "dy": v.get("dy", 0) - mdy, "dscale": v.get("dscale", 1) / mds}
                    if abs(r["dx"]) > 0.5 or abs(r["dy"]) > 0.5 or abs(r["dscale"] - 1) > 0.01:
                        residual.setdefault(e, {}).setdefault(sl, []).append((pid, r))
            target[pid] = rig

        # 2. correcciones normalizadas por grupo (frente / 3/4)
        corr = {"front": {}, "side": {}}
        for pid, rig in target.items():
            est = poses[pid].get("rig") or {}
            f, k = facing[pid], size[pid]
            g = "front" if f == 0 else "side"
            for sl in SLOTS:
                if sl not in rig or sl not in est:
                    continue
                dx = (rig[sl]["x"] - est[sl]["x"]) / k
                if f:
                    dx *= f  # positivo = hacia donde mira
                c = {"dx": dx, "dy": (rig[sl]["y"] - est[sl]["y"]) / k, "ds": rig[sl]["scale"] / est[sl]["scale"]}
                if "clip" in rig[sl] and "clip" in est[sl]:
                    c["clip"] = [rig[sl]["clip"][0] / est[sl]["clip"][0], rig[sl]["clip"][1] / est[sl]["clip"][1]]
                corr[g].setdefault(role(sl, f), []).append(c)

        def mean_corr(group, rl):
            cs = corr[group].get(rl) or corr["side" if group == "front" else "front"].get(rl)
            if not cs:
                # rol cercano/lejano sin datos: usar el hueco equivalente de frente
                plain = rl.replace("Far", "L").replace("Near", "R")
                cs = corr["front"].get(plain) or corr["front"].get(plain[:-1] + "L")
            if not cs:
                return None
            m = {"dx": st.mean(c["dx"] for c in cs), "dy": st.mean(c["dy"] for c in cs), "ds": st.mean(c["ds"] for c in cs)}
            clips = [c["clip"] for c in cs if "clip" in c]
            if clips:
                m["clip"] = [st.mean(c[0] for c in clips), st.mean(c[1] for c in clips)]
            return m

        # 3. aplicar a todas las poses
        for pid, p in poses.items():
            if pid in cal_poses:
                rig = target[pid]
                rig["status"], rig["source"] = "calibrated", "Calibrado a mano"
                rig.pop("review", None)
                out["rigs"][pid] = rig
                continue
            est = p.get("rig")
            if not est:
                continue
            f, k = facing[pid], size[pid]
            g = "front" if f == 0 else "side"
            rig = json.loads(json.dumps(est))
            for sl in SLOTS:
                if sl not in rig:
                    continue
                m = mean_corr(g, role(sl, f))
                if not m:
                    continue
                rig[sl]["x"] = round(rig[sl]["x"] + m["dx"] * k * (f if f else 1), 1)
                rig[sl]["y"] = round(rig[sl]["y"] + m["dy"] * k, 1)
                rig[sl]["scale"] = round(rig[sl]["scale"] * m["ds"], 3)
                if "clip" in rig[sl] and "clip" in m:
                    rig[sl]["clip"] = [round(rig[sl]["clip"][0] * m["clip"][0], 1), round(rig[sl]["clip"][1] * m["clip"][1], 1)]
            if pid in target:  # pose sin rig calibrado pero con ajustes por expresión: manda lo del usuario
                for sl in SLOTS:
                    if sl in target[pid]:
                        rig[sl] = target[pid][sl]
            rig["status"] = "derived"
            rig["source"] = "Derivado de las calibraciones a mano (" + ", ".join(sorted(p_.split(".")[-1] for p_ in cal_poses)) + ")"
            out["rigs"][pid] = rig
        report.append(f"{ch['name']}: calibradas {len(cal_poses)}, derivadas {len(poses) - len(cal_poses)}; orientación " +
                      ", ".join(f"{poses[pid]['key'].replace('pose_', '')}={facing[pid]:+d}" for pid in poses))

        # 4. expresiones del usuario con sus ajustes propios reaplicados en todas las poses
        for eid, e in user_exprs.items():
            e = json.loads(json.dumps(e))
            po = {}
            for sl, items in residual.get(eid, {}).items():
                for pid in poses:
                    f, k = facing[pid], size[pid]
                    srcs = [(spid, r) for spid, r in items if spid == pid] or items
                    spid, r = srcs[0]
                    sf, sk = facing[spid], size[spid]
                    dx = r["dx"] / sk
                    if sf and f:
                        dx = dx * sf * f
                    elif sf != f:
                        dx = 0.0
                    a = {"dx": round(dx * k, 2), "dy": round(r["dy"] / sk * k, 2), "dscale": round(r["dscale"], 3)}
                    if pid == spid:
                        a = {"dx": round(r["dx"], 2), "dy": round(r["dy"], 2), "dscale": round(r["dscale"], 3)}
                    po.setdefault(pid, {})[sl] = a
            e["poseOverrides"] = po
            out["expressions"][eid] = e
    path = os.path.join(ROOT, "src/data/face-overrides.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("\n".join(report))
    print(f"→ {len(out['rigs'])} rigs, {len(out['expressions'])} expresiones en {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
