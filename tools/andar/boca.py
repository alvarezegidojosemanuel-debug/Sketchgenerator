"""Versión «boca abierta» de los pasos de andar (para que hablen andando).

  python3 tools/andar/boca.py <id> <clave> <x> <y> <ancho> [giro] [forma] [salida]

<x> <y>: centro de la sonrisa en el paso 1 (píxeles de la imagen); <ancho>: ancho de la sonrisa.
forma: sonrisa (por defecto) u ovalo (para caras enfadadas). En los demás pasos la cabeza se busca sola.
Escribe <clave>N_boca.webp junto a las poses (o en <salida> para probar) y pone talkSrc en los dos catalog.json.
"""
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw

cid, key = sys.argv[1], sys.argv[2]
X, Y, WID = (float(v) for v in sys.argv[3:6])
ROT = float(sys.argv[6]) if len(sys.argv) > 6 else 0.0
SHAPE = sys.argv[7] if len(sys.argv) > 7 else "sonrisa"
OUT = sys.argv[8] if len(sys.argv) > 8 else None
DIR = f"public/assets/punetos/punetos/{cid}"
SS = 4  # supermuestreo


def bez(p0, p1, p2, p3, n=24):
    return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d for a, b, c, d in zip(p0, p1, p2, p3)) for t in np.linspace(0, 1, n)]


def outline(w, h):
    """Contorno de la boca centrado en (0,0): arriba casi recto siguiendo la sonrisa, abajo en «D»."""
    if SHAPE == "ovalo":
        return [(w / 2 * math.cos(a), h / 2 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 64)]
    top = bez((-w / 2, -h * 0.3), (-w / 6, -h * 0.18), (w / 6, -h * 0.18), (w / 2, -h * 0.3))
    bot = bez((w / 2, -h * 0.3), (w * 0.42, h * 0.75), (-w * 0.42, h * 0.75), (-w / 2, -h * 0.3))
    return top + bot[1:]


def mouth_layer(size, cx, cy):
    W, H = size[0] * SS, size[1] * SS
    w = WID * 1.08 * SS
    h = w * (0.62 if SHAPE == "sonrisa" else 0.8)
    r = math.radians(ROT)
    pts = [(cx * SS + x * math.cos(r) - y * math.sin(r), cy * SS + x * math.sin(r) + y * math.cos(r)) for x, y in outline(w, h)]
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    inside = Image.new("L", (W, H), 0)
    ImageDraw.Draw(inside).polygon(pts, fill=255)
    d = ImageDraw.Draw(lay)
    d.polygon(pts, fill=(59, 11, 18, 255))
    # dientes de arriba y lengua, recortados por la boca
    extra = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    e = ImageDraw.Draw(extra)
    ty = -h * 0.3 + h * 0.2
    teeth = [(x, y) for x, y in outline(w, h) if y <= ty] + [(w / 2, ty), (-w / 2, ty)]
    rot = lambda q: [(cx * SS + x * math.cos(r) - y * math.sin(r), cy * SS + x * math.sin(r) + y * math.cos(r)) for x, y in q]
    e.polygon(rot([(-w / 2, -h), (w / 2, -h), (w / 2, ty), (-w / 2, ty)]), fill=(255, 255, 255, 255))
    tong = [(w * 0.3 * math.cos(a), h * 0.42 + h * 0.26 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 48)]
    e.polygon(rot(tong), fill=(226, 70, 80, 255))
    extra.putalpha(Image.fromarray(np.minimum(np.array(extra)[..., 3], np.array(inside))))
    lay.alpha_composite(extra)
    d = ImageDraw.Draw(lay)
    d.line(pts + [pts[0]], fill=(17, 17, 17, 255), width=max(2, round(w * 0.07)), joint="curve")
    return lay.resize(size, Image.LANCZOS)


frames = [Image.open(f"{DIR}/{key}{i}.webp").convert("RGBA") for i in range(1, 5)]
ref = np.array(frames[0].convert("RGB")).astype(float)
R = int(max(30, WID * 0.8))
x0, y0 = int(X), int(Y)
tpl = ref[y0 - R:y0 + R, x0 - R:x0 + R]
srcs = []
for i, im in enumerate(frames, 1):
    a = np.array(im.convert("RGB")).astype(float)
    # la cabeza puede moverse unos píxeles entre pasos
    _, dx, dy = min((np.abs(a[y0 - R + dy:y0 + R + dy, x0 - R + dx:x0 + R + dx] - tpl).mean(), dx, dy) for dx in range(-12, 13) for dy in range(-12, 13))
    out = im.copy()
    lay = mouth_layer(im.size, X + dx, Y + dy)
    # la boca no se sale del dibujo
    lay.putalpha(Image.fromarray(np.minimum(np.array(lay)[..., 3], np.array(im)[..., 3])))
    out.alpha_composite(lay)
    path = f"{OUT or DIR}/{key}{i}_boca.webp"
    out.save(path, "WEBP", quality=92, method=6)
    srcs.append(path)
    print(path, "desplazamiento", dx, dy)

if not OUT:
    for f in ["catalog.json", "src/data/catalog.json"]:
        c = json.load(open(f))
        ch = next(x for x in c["characters"] if x["id"] == cid)
        for p in ch["poses"]:
            for i in range(1, 5):
                if p["key"] == f"pose_p_{key}{i}":
                    p["talkSrc"] = f"/assets/punetos/punetos/{cid}/{key}{i}_boca.webp"
        open(f, "w").write(json.dumps(c, ensure_ascii=False, indent=1))
