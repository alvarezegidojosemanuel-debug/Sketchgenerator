"""Pantallas del portátil de Martínez (bg_casa_martinez), ya puestas en perspectiva sobre la pantalla del fondo.

Uso: python3 tools/pantallas/portatil_martinez.py   → public/assets/punetos/props/pantalla_martinez_*.webp
"""
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = "public/assets/punetos/props"
B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
F = lambda p, s: ImageFont.truetype(p, s)
W, H = 800, 520
# esquinas de la pantalla en el fondo (1080x1920): arriba-izq, arriba-dcha, abajo-dcha, abajo-izq
QUAD = [(612, 787), (778, 787), (757.5, 902), (592, 895.5)]


def centered(d, y, text, font, fill):
    w = d.textlength(text, font=font)
    d.text(((W - w) / 2, y), text, font=font, fill=fill)


def mic_off(d, x, y, s, col):
    d.rounded_rectangle((x - s * 0.25, y - s * 0.5, x + s * 0.25, y + s * 0.15), radius=s * 0.25, outline=col, width=4)
    d.arc((x - s * 0.45, y - s * 0.3, x + s * 0.45, y + s * 0.4), 0, 180, fill=col, width=4)
    d.line((x, y + s * 0.4, x, y + s * 0.6), fill=col, width=4)
    d.line((x - s * 0.55, y - s * 0.55, x + s * 0.55, y + s * 0.6), fill=(235, 70, 70), width=6)


def meet():
    im = Image.new("RGB", (W, H), (32, 33, 36))
    d = ImageDraw.Draw(im)
    d.text((24, 16), "Reunión de seguimiento · 09:00", font=F(B, 26), fill=(230, 230, 235))
    cols = [(92, 160, 230), (240, 170, 80), (130, 200, 120), (200, 120, 200), (240, 110, 110)]
    names = ["Ana", "Luis", "Marta", "Pedro", "Carmen", "Martínez"]
    tw, th, gx, gy = 240, 180, 20, 18
    x0, y0 = (W - 3 * tw - 2 * gx) / 2, 70
    for i, n in enumerate(names):
        x, y = x0 + (i % 3) * (tw + gx), y0 + (i // 3) * (th + gy)
        if n == "Martínez":
            d.rounded_rectangle((x, y, x + tw, y + th), radius=14, fill=(8, 8, 10), outline=(70, 70, 75), width=2)
            mic_off(d, x + tw / 2, y + th / 2 - 8, 46, (180, 180, 185))
        else:
            d.rounded_rectangle((x, y, x + tw, y + th), radius=14, fill=(60, 64, 70))
            c = cols[i % len(cols)]
            d.ellipse((x + tw / 2 - 42, y + 30, x + tw / 2 + 42, y + 114), fill=c)
            d.text((x + tw / 2 - 14, y + 50), n[0], font=F(B, 36), fill=(255, 255, 255))
        d.text((x + 12, y + th - 34), n, font=F(B, 20), fill=(240, 240, 240))
    # aviso de que ha entrado
    d.rounded_rectangle((150, 455, W - 150, 505), radius=24, fill=(60, 64, 70))
    centered(d, 466, "Martínez se ha unido a la reunión", F(B, 22), (255, 255, 255))
    return im


def ascenso():
    im = Image.new("RGB", (W, H), (250, 248, 240))
    d = ImageDraw.Draw(im)
    rnd = random.Random(7)
    for _ in range(160):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        c = rnd.choice([(240, 80, 90), (255, 200, 40), (70, 160, 240), (90, 200, 120), (200, 110, 220)])
        s = rnd.uniform(6, 14)
        d.polygon([(x, y), (x + s, y + s * 0.3), (x + s * 0.7, y + s), (x - s * 0.2, y + s * 0.6)], fill=c)
    d.rounded_rectangle((60, 120, W - 60, 420), radius=26, fill=(255, 255, 255), outline=(30, 30, 30), width=5)
    centered(d, 150, "¡Enhorabuena, Martínez!", F(B, 46), (30, 30, 30))
    centered(d, 230, "Has sido ascendido a", F(R, 32), (60, 60, 60))
    centered(d, 278, "Director de Coordinación", F(B, 40), (200, 60, 60))
    centered(d, 350, "Por tu compromiso y disponibilidad 24/7", F(R, 22), (110, 110, 110))
    return im


def warp(flat, name):
    """Pone la imagen plana sobre la pantalla del fondo (perspectiva) y guarda el recorte con su caja."""
    xs, ys = [p[0] for p in QUAD], [p[1] for p in QUAD]
    bx, by = int(min(xs)), int(min(ys))
    bw, bh = int(max(xs)) - bx + 1, int(max(ys)) - by + 1
    S = 4  # supermuestreo
    dst = [((x - bx) * S, (y - by) * S) for x, y in QUAD]
    src = [(0, 0), (W, 0), (W, H), (0, H)]
    # coeficientes de la transformación (destino → origen)
    import numpy as np
    A, b = [], []
    for (X, Y), (u, v) in zip(dst, src):
        A += [[X, Y, 1, 0, 0, 0, -u * X, -u * Y], [0, 0, 0, X, Y, 1, -v * X, -v * Y]]
        b += [u, v]
    coef = np.linalg.solve(np.array(A, float), np.array(b, float))
    out = flat.convert("RGBA").transform((bw * S, bh * S), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC)
    mask = Image.new("L", (bw * S, bh * S), 0)
    ImageDraw.Draw(mask).polygon(dst, fill=255)
    out.putalpha(mask)
    # se guarda a 4x: el catálogo declara el tamaño real (bw×bh) y así aguanta el zoom de cámara
    out.save(f"{OUT}/{name}.webp", quality=92)
    print(name, "x", bx + bw / 2, "y", by + bh, "w", bw, "h", bh)


if __name__ == "__main__":
    warp(meet(), "pantalla_martinez_meet")
    warp(ascenso(), "pantalla_martinez_ascenso")
