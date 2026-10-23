"""Graba el texto en la lápida del cementerio y el nombre en el buzón de la casa de Martínez.

Uso: python3 tools/pantallas/lapida_martinez.py <cementerio.png> <casa.png>
→ public/assets/punetos/backgrounds/bg_cementerio_martinez.webp y bg_casa_martinez_fuera.webp
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

W, H = 1080, 1920
SERIF_B = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
SERIF_I = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"
SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"


def engrave(base, lines, cx, tint=(52, 54, 58), light=(205, 205, 200), blur=0.6):
    """lines: [(texto, fuente, tamaño, y)]. Letras hundidas: sombra oscura arriba-izquierda y brillo abajo-derecha."""
    mask = Image.new("L", base.size, 0)
    d = ImageDraw.Draw(mask)
    for text, font, size, y in lines:
        f = ImageFont.truetype(font, size)
        w = d.textlength(text, font=f)
        d.text((cx - w / 2, y), text, font=f, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(blur))
    hi = ImageChops.offset(mask, 2, 2)
    out = base.convert("RGBA")
    out.paste(Image.new("RGBA", base.size, light + (255,)), (0, 0), hi.point(lambda v: v * 0.55))
    # el interior de la letra coge la textura de la piedra oscurecida
    dark = Image.blend(base.convert("RGBA"), Image.new("RGBA", base.size, tint + (255,)), 0.86)
    out.paste(dark, (0, 0), mask)
    return out.convert("RGB")


def main(cem, casa):
    c = Image.open(cem).convert("RGB").resize((W, H), Image.LANCZOS)
    cx = 548
    c = engrave(c, [
        ("MARTÍNEZ", SERIF_B, 70, 870),
        ("Coordinación", SERIF, 42, 965),
        ("1968 – 2026", SERIF, 42, 1025),
        ("«Siempre conectado»", SERIF_I, 44, 1120),
    ], cx)
    c.save("public/assets/punetos/backgrounds/bg_cementerio_martinez.webp", quality=90)
    h = Image.open(casa).convert("RGB").resize((W, H), Image.LANCZOS)
    # placa del buzón (en el original 170–330 × 978–1055)
    h = engrave(h, [("MARTÍNEZ", SERIF_B, 27, 1150)], 288, tint=(40, 40, 44), light=(235, 235, 235), blur=0.4)
    h.save("public/assets/punetos/backgrounds/bg_casa_martinez_fuera.webp", quality=90)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
