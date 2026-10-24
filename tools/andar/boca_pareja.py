"""Tiras «boca cerrada» + «boca abierta» de las mismas poses: la cerrada ya instalada es la pose; de la abierta
se copia solo la boca (alineada) → <clave>_boca.webp como talkSrc. Así al hablar solo se mueve la boca.
Uso: python3 tools/andar/boca_pareja.py <personaje> <dir_figuras_abiertas (f1.png…)> clave1 clave2 …"""
import sys, json, subprocess, tempfile, numpy as np
from PIL import Image
from scipy import ndimage

cid, odir, keys = sys.argv[1], sys.argv[2], sys.argv[3:]
D = f"public/assets/punetos/punetos/{cid}/"
tmp = tempfile.mkdtemp()
for i, k in enumerate(keys, 1):
    op = f"{odir}/f{i}.png"
    o = np.array(Image.open(op).convert("RGBA")).astype(int)
    red = (o[..., 0] > 170) & (o[..., 1] < 120) & (o[..., 2] < 130) & (o[..., 0] - o[..., 1] > 90) & (o[..., 3] > 128)
    red[int(o.shape[0] * 0.55):] = False
    lab, n = ndimage.label(red)
    if not n:
        print(k, "sin boca roja: se deja sin talkSrc")
        continue
    s = ndimage.sum(red, lab, range(1, n + 1))
    ys, xs = np.nonzero(lab == (np.argmax(s) + 1))
    a = Image.open(D + k + ".webp")
    sx, sy = a.width / o.shape[1], a.height / o.shape[0]
    cx, cy = (xs.min() + xs.max()) / 2 * sx, ((ys.min() + ys.max()) / 2 - 5) * sy
    rx, ry = (xs.max() - xs.min()) * 0.55 * sx + 16, (ys.max() - ys.min()) * 0.75 * sy + 18
    a.save(f"{tmp}/a.png")
    r = subprocess.run(["python3", "tools/andar/boca_de_otra.py", f"{tmp}/a.png", op, f"{tmp}/b.png", str(cx), str(cy), str(rx), str(ry)], capture_output=True, text=True)
    print(k, r.stdout.strip())
    Image.open(f"{tmp}/b.png").save(D + k + "_boca.webp", "WEBP", quality=92)
    for f in ("catalog.json", "src/data/catalog.json"):
        c = json.load(open(f))
        ch = [x for x in c["characters"] if x["id"] == cid][0]
        for p in ch["poses"]:
            if p["key"] == f"pose_p_{k}":
                p["talkSrc"] = p["src"].replace(".webp", "_boca.webp")
        open(f, "w").write(json.dumps(c, ensure_ascii=False, indent=1))
