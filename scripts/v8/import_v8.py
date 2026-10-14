#!/usr/bin/env python3
"""
Importa los assets REALES de PUÑETOS STUDIO V8 a Pocket.

Uso (requiere Python 3.10+ y Pillow; es una herramienta de desarrollo, no se ejecuta en Vercel):
    unzip PUNETOS_ASSETS_V8_PARTE_1_DE_2.zip -d v8-source
    unzip PUNETOS_ASSETS_V8_PARTE_2_DE_2.zip -d v8-source
    python3 -I scripts/v8/import_v8.py v8-source

Qué hace:
  * Lee PUNETOS_STUDIO_V8/config/library_index.json (IDs reales) y el manifest del pack de poses.
  * Copia SOLO los archivos referenciados (poses + caras normalizadas) a public/assets/v8/,
    conservando la ruta relativa original. No redibuja ni re-codifica nada.
  * Analiza cada pieza facial (bbox de contenido, pieza simple o par, forma de la ceja).
  * ESTIMA una posición facial por personaje+pose a partir de rasgos del dibujo
    (gafas de Usu/Jefe/Reynaldo, hueco de la cara de Sister, barba de Barbas).
    Todas quedan marcadas status="estimated": NO son calibraciones terminadas.
    El ZIP no trae calibraciones ni prefabs (ver LEEME_ASSETS.txt); se calibran en la app.
  * Crea prefabs de expresión en BORRADOR (status="draft") por personaje+emoción,
    eligiendo piezas reales del personaje. Se revisan y guardan desde la app.
  * Escribe src/data/catalog.json, catalog.json y docs/V8_INVENTORY.md.
"""
import json, os, shutil, sys, datetime
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSET_BASE = "/assets/v8"

CHARACTERS = [
    ("usu", "Usu", "#2f7bf0", {"pitch": 1.1, "rate": 1.05}),
    ("reynaldo", "Reynaldo", "#8b5a2b", {"pitch": 0.9, "rate": 1.0}),
    ("sister", "Sister", "#c2410c", {"pitch": 1.35, "rate": 1.05}),
    ("barbas", "Barbas", "#5b3a1e", {"pitch": 0.75, "rate": 0.95}),
    ("jefe", "Jefe", "#111827", {"pitch": 0.85, "rate": 0.95}),
]
POSE_LABELS = {
    "pose_neutral_front": "Neutral frente",
    "pose_neutral_3q_left": "Neutral 3/4 izquierda",
    "pose_neutral_3q_right": "Neutral 3/4 derecha",
    "pose_walk_small_left": "Andar (izquierda)",
    "pose_walk_small_right": "Andar (derecha)",
    "pose_talk_explain": "Explicar",
    "pose_talk_emphasis": "Enfatizar",
    "pose_pointing": "Señalar",
    "pose_arms_crossed": "Brazos cruzados",
    "pose_reaction": "Reacción",
}
# Escala de mundo: un personaje en pose frontal mide ~600 px en el PNG → ~720 px en el lienzo 1080×1920.
WORLD_SCALE = 1.2

EMOTIONS = [
    ("neutral", "Neutral"),
    ("alegria", "Alegría"),
    ("risa", "Risa"),
    ("enfado", "Enfado"),
    ("sorpresa", "Sorpresa"),
    ("tristeza", "Tristeza"),
]

# --- Selección MANUAL de piezas para los prefabs en borrador (revisión visual de los PNG) ---
# Boca en reposo y bocas para hablar (lip-sync aproximado). Números = sufijo _NN del asset.
MOUTHS = {
    "usu":      {"neutral": (10, [8, 5, 3]), "alegria": (9, [5, 8, 1]), "risa": (1, [2, 1, 5]), "enfado": (7, [4, 7, 8]), "sorpresa": (3, [3, 8, 4]), "tristeza": (10, [8, 3])},
    "sister":   {"neutral": (10, [9, 6, 3]), "alegria": (8, [6, 9, 1]), "risa": (1, [2, 1, 6]), "enfado": (5, [4, 5, 9]), "sorpresa": (3, [3, 9, 4]), "tristeza": (7, [7, 9, 4])},
    "reynaldo": {"neutral": (10, [8, 7, 3]), "alegria": (9, [7, 8, 1]), "risa": (1, [2, 1, 7]), "enfado": (5, [6, 5, 8]), "sorpresa": (3, [3, 8, 6]), "tristeza": (10, [6, 8])},
    "jefe":     {"neutral": (8, [9, 4, 3]),  "alegria": (10, [4, 9, 1]), "risa": (1, [2, 1, 4]), "enfado": (6, [7, 6, 9]), "sorpresa": (3, [3, 9]), "tristeza": (8, [9, 3])},
    "barbas":   {"neutral": (1, [2, 3, 5]),  "alegria": (7, [6, 3, 2]), "risa": (6, [3, 6, 4]), "enfado": (9, [8, 9, 2]), "sorpresa": (5, [5, 2, 4]), "tristeza": (1, [2, 5])},
}
# Ojos (pares). None = el personaje no tiene ojos visibles (gafas de sol dibujadas en el cuerpo).
EYES = {
    "usu": None,
    "jefe": None,
    "sister":   {"neutral": "02_der", "alegria": "02_der", "risa": "03", "enfado": "04_der", "sorpresa": "02_izq", "tristeza": "03"},
    "reynaldo": {"neutral": "04", "alegria": "05", "risa": "05", "enfado": "06", "sorpresa": "03_izq", "tristeza": "02"},
    "barbas":   {"neutral": "01", "alegria": "05_der", "risa": "05_der", "enfado": "07", "sorpresa": "02", "tristeza": "03"},
}
# Cejas elegidas a mano (revisión visual) cuando la clasificación automática no acierta.
BROW_OVERRIDES = {
    "jefe": {"neutral": "face.jefe.brows.jefe_brow_09", "enfado": "face.jefe.brows.jefe_brow_04"},
    "usu": {"enfado": "face.usu.brows.usu_brow_06"},
}
# Piezas de ojos que ya llevan las cejas dibujadas (no se superponen cejas sueltas).
EYES_WITH_BROWS = {"barbas": "all", "reynaldo": {"02", "06"}}
# Revisión visual de los rigs estimados (superposición sobre cada pose): casos dudosos.
RIG_REVIEW = {
    "char.reynaldo.pose_reaction": "La mano tapa parte de las gafas: cristales medidos a mano, revisar.",
}
# Cristales medidos a mano (ampliación ×3 con cuadrícula) donde la detección automática falla.
MANUAL_LENSES = {
    "char.reynaldo.pose_reaction": [(212, 168, 64, 74), (288, 182, 52, 72)],  # la mano tapa parte de las gafas
}
# Recortes defectuosos detectados al revisar (se importan pero se avisa y no se usan en borradores).
ASSET_NOTES = {
    "face.sister.eyes.sister_eyes_01": "El recorte contiene tres ojos (dos pares solapados).",
    "face.sister.eyes.sister_eyes_05": "El recorte contiene un solo ojo.",
    "face.barbas.mouths.barbas_mouth_10": "Contiene un fragmento de barba suelto en la parte superior.",
}


VIOLATIONS = []


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def find_v8(src):
    for cand in (src, os.path.join(src, "PUNETOS_STUDIO_V8")):
        if os.path.isfile(os.path.join(cand, "config", "library_index.json")):
            return cand
    die(f"No se encuentra PUNETOS_STUDIO_V8/config/library_index.json en {src}")


def alpha(im):
    return im.convert("RGBA").getchannel("A")


def content_bbox(im):
    return list(alpha(im).point(lambda v: 255 if v > 24 else 0).getbbox() or (0, 0, im.size[0], im.size[1]))


def column_runs(im):
    """Grupos de columnas con contenido (para detectar piezas dobles: par de cejas)."""
    a = alpha(im).point(lambda v: 255 if v > 40 else 0)
    w, h = a.size
    px = a.load()
    cols = [any(px[x, y] for y in range(h)) for x in range(w)]
    runs, start = [], None
    for x, c in enumerate(cols + [False]):
        if c and start is None:
            start = x
        elif not c and start is not None:
            runs.append((start, x))
            start = None
    # fusionar huecos pequeños (antialias)
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < 2:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(r)
    return [r for r in merged if r[1] - r[0] >= 0.25 * w]


def brow_shape(im):
    """Pendiente y curvatura de la línea media de una ceja simple."""
    a = alpha(im)
    w, h = a.size
    px = a.load()
    pts = []
    for x in range(w):
        ys = [y for y in range(h) if px[x, y] > 100]
        if ys:
            pts.append((x, sum(ys) / len(ys)))
    if len(pts) < 5:
        return 0.0, 0.0
    xs = [p[0] for p in pts]
    x0, x1 = min(xs), max(xs)
    span = max(1, x1 - x0)
    # ajuste cuadrático por mínimos cuadrados en x normalizado [-1, 1]
    X = [((p[0] - x0) / span) * 2 - 1 for p in pts]
    Y = [p[1] / span for p in pts]
    n = len(X)
    s = [sum(x ** k for x in X) for k in range(5)]
    t = [sum((x ** k) * y for x, y in zip(X, Y)) for k in range(3)]
    # resolver [s4 s3 s2; s3 s2 s1; s2 s1 s0] [a b c] = [t2 t1 t0]
    M = [[s[4], s[3], s[2], t[2]], [s[3], s[2], s[1], t[1]], [s[2], s[1], s[0], t[0]]]
    for i in range(3):
        piv = max(range(i, 3), key=lambda r: abs(M[r][i]))
        M[i], M[piv] = M[piv], M[i]
        for r in range(3):
            if r != i and M[i][i]:
                f = M[r][i] / M[i][i]
                M[r] = [M[r][k] - f * M[i][k] for k in range(4)]
    a_, b_ = M[0][3] / M[0][0], M[1][3] / M[1][1]
    return round(b_, 3), round(a_, 3)  # pendiente (+ = baja hacia la derecha "\"), curvatura (+ = arco ∩)


# ---------------- análisis de piezas faciales ----------------

def px_is_beard(p):
    r, g, b, a = p
    return a > 120 and r > b + 15 and g > b and r < 170 and not (r > 150 and g > 120)


def content_box(im, pred=None, region=None):
    im = im.convert("RGBA")
    w, h = im.size
    x0r, x1r = region if region else (0, w)
    px = im.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(x0r, x1r):
            p = px[x, y]
            if p[3] > 60 and (pred is None or pred(p)):
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def analyse_part(cid, cat, im, original_size):
    """Escala de normalización (contenido normalizado / original) y puntos de anclaje."""
    w, h = im.size
    bb = content_box(im)
    info = {}
    name = os.path.basename(getattr(im, "filename", ""))
    is_half = "_izq" in name or "_der" in name
    ow = original_size[0] / (2 if is_half else 1)
    info["normScale"] = round((bb[2] - bb[0]) / ow, 4)
    if cat == "mouths":
        if cid == "barbas":
            # ancla = abertura de la boca (zona no-barba), no la barba
            m = content_box(im, pred=lambda p: not px_is_beard(p))
            m = m or bb
        else:
            m = bb
        info["anchors"] = {"full": [round((m[0] + m[2]) / 2, 1), round(m[1] + min(12, (m[3] - m[1]) / 2), 1)]}
    elif cat == "eyes":
        anchors = {}
        lens = {}
        for side, reg in (("left", (0, w // 2)), ("right", (w // 2, w))):
            b = content_box(im, region=reg)
            if not b:
                continue
            anchors[side] = [round((b[0] + b[2]) / 2, 1), round((b[1] + b[3]) / 2, 1)]
            if cid == "reynaldo":
                # Cada mitad es un cristal con su montura (recortada arriba/abajo en el original):
                # centro = centro del contenido; radio interior ≈ media anchura menos el grosor de la montura.
                rx = (b[2] - b[0]) / 2 - 5
                lens[side] = [anchors[side][0], anchors[side][1], round(rx, 1), round(min(rx, (b[3] - b[1]) / 2), 1)]
        info["anchors"] = anchors
        if lens:
            info["lens"] = lens
            # Los originales de Reynaldo tienen tamaños dispares; las versiones normalizadas comparten
            # el tamaño de cristal, que es lo que hay que encajar en las gafas de la pose: sin compensación.
            info["normScale"] = 1
    else:
        info["anchors"] = {"full": [round((bb[0] + bb[2]) / 2, 1), round((bb[1] + bb[3]) / 2, 1)]}
        runs = column_runs(im)
        if len(runs) >= 2:
            for side, (a, b) in (("left", runs[0]), ("right", runs[-1])):
                bx = content_box(im, region=(a, b))
                info["anchors"][side] = [round((bx[0] + bx[2]) / 2, 1), round((bx[1] + bx[3]) / 2, 1)]
    return info


# ---------------- estimación de rigs faciales por pose ----------------

def masks(im):
    im = im.convert("RGBA")
    w, h = im.size
    a = im.getchannel("A")
    interior = a.point(lambda v: 255 if v > 200 else 0).filter(ImageFilter.MinFilter(15))
    return im, im.load(), interior.load(), w, h


def components(points):
    """Componentes conexas (8-vecindad) de un conjunto de píxeles."""
    pts = set(points)
    comps = []
    while pts:
        seed = pts.pop()
        stack, comp = [seed], [seed]
        while stack:
            x, y = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (x + dx, y + dy)
                    if q in pts:
                        pts.remove(q)
                        stack.append(q)
                        comp.append(q)
        comps.append(comp)
    return comps


def lens_region(im, solid):
    """Gafas: banda horizontal con más píxeles oscuros en la zona de la cabeza.
    solid=True (gafas de sol de Usu/Jefe): píxeles oscuros con vecindario oscuro (cristales rellenos;
    descarta contornos, mechones y sombras). solid=False (Reynaldo): monturas finas."""
    im, px, inner, w, h = masks(im)
    top = int(h * 0.45)
    dark = Image.new("L", (w, h), 0)
    dp = dark.load()
    for y in range(top):
        for x in range(w):
            r, g, b, a = px[x, y]
            if inner[x, y] and max(r, g, b) < (45 if solid else 70) and abs(r - b) < 40:
                dp[x, y] = 255
    if solid:
        # cierre (rellena los reflejos blancos de los cristales) y apertura (quita contornos y mechones finos)
        # apertura: quita contornos y mechones finos (el cierre va después de descartar el pelo)
        dark = dark.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
        dp = dark.load()
        # Las gafas tienen la frente (azul) justo encima; el pelo negro no.
        allpts = [(x, y) for y in range(top) for x in range(w) if dp[x, y]]
        keep = Image.new("L", (w, h), 0)
        kp = keep.load()
        for c in components(allpts):
            if len(c) < 40:
                continue
            tops = {}
            for x, y in c:
                tops[x] = min(tops.get(x, y), y)
            # columnas con frente/cabeza (azul) justo encima del componente
            with_head = sum(1 for x, ty in tops.items() if any(is_blue(px[x, yy]) for yy in range(max(0, ty - 30), ty)))
            if with_head > 0.3 * len(tops):
                for q in c:
                    kp[q] = 255
        # cierre: rellena los reflejos blancos de los cristales
        keep = keep.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
        dark, dp = keep, keep.load()
    rows = [sum(1 for x in range(w) if dp[x, y]) for y in range(top)]
    # suavizado y pico
    sm = [sum(rows[max(0, y - 6):y + 7]) for y in range(top)]
    peak = max(range(top), key=lambda y: sm[y])
    band = int(0.07 * h)
    pts = [(x, y) for y in range(max(0, peak - band), min(top, peak + band)) for x in range(w) if dp[x, y]]
    if not pts:
        return None
    if solid:
        comps = [c for c in components(pts) if len(c) > 40]
        pts = [p for c in comps for p in c]
    # columnas de cristal: extensión vertical grande (descarta patillas)
    ext = {}
    for x, y in pts:
        lo, hi = ext.get(x, (y, y))
        ext[x] = (min(lo, y), max(hi, y))
    mx = max(hi - lo for lo, hi in ext.values())
    cols = sorted(x for x, (lo, hi) in ext.items() if hi - lo > 0.3 * mx)
    x0, x1 = min(cols), max(cols)
    ys = sorted(y for x, y in pts if x0 <= x <= x1)
    q = lambda f: ys[int(f * (len(ys) - 1))]
    # cristales = tramos de columnas altas separados por el puente
    runs, start, prev = [], cols[0], cols[0]
    for x in cols[1:]:
        if x - prev > 3:
            runs.append((start, prev))
            start = x
        prev = x
    runs.append((start, prev))
    runs = [r for r in runs if r[1] - r[0] > 8]
    lens_region.runs = sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:2]
    return x0, q(0.02), x1, q(0.98)


def lens_holes(im, box):
    """Cristales de las gafas redondas: regiones no oscuras encerradas por la montura."""
    im, px, inner, w, h = masks(im)
    x0, y0, x1, y1 = box
    padx = int(0.7 * (x1 - x0)) + 30  # el cristal lejano puede sobresalir de la cabeza
    pady = 30
    X0, Y0, X1, Y1 = max(0, x0 - padx), max(0, y0 - pady), min(w, x1 + padx), min(h, y1 + pady)
    dark = lambda p: p[3] > 120 and max(p[:3]) < 70
    seen = set()
    stack = [(x, y) for x in range(X0, X1) for y in (Y0, Y1 - 1)] + [(x, y) for y in range(Y0, Y1) for x in (X0, X1 - 1)]
    while stack:
        q = stack.pop()
        if q in seen:
            continue
        x, y = q
        if not (X0 <= x < X1 and Y0 <= y < Y1) or dark(px[x, y]):
            continue
        seen.add(q)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    inside = [(x, y) for y in range(Y0, Y1) for x in range(X0, X1) if (x, y) not in seen and not dark(px[x, y])]
    holes = []
    for c in components(inside):
        if len(c) < 250:
            continue
        xs = [q[0] for q in c]; ys = [q[1] for q in c]
        bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
        fill = len(c) / (bw * bh)
        # un cristal es casi elíptico: relleno ≈ π/4 ≈ 0.78
        if 0.3 < bw / bh < 1.7 and fill > 0.6 and bh < 0.25 * h:
            holes.append(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, bw, bh))
    # mejor pareja: misma altura, tamaños parecidos, separadas
    best, score = [], -1
    for i in range(len(holes)):
        for j in range(i + 1, len(holes)):
            a, b = holes[i], holes[j]
            if abs(a[1] - b[1]) > 0.35 * max(a[3], b[3]) or abs(a[0] - b[0]) < 0.8 * min(a[2], b[2]):
                continue
            ratio = min(a[3], b[3]) / max(a[3], b[3])
            if ratio < 0.6:
                continue
            sc = a[2] * a[3] + b[2] * b[3]
            if sc > score:
                best, score = [a, b], sc
    return sorted(best)


def is_blue(p):
    r, g, b, a = p
    return a > 200 and b > r + 50 and b > g + 10


def is_hair(p):
    r, g, b, a = p
    return a > 200 and r >= g >= b - 5 and r - b > 18 and not is_blue(p)


def sister_face(im):
    """Óvalo azul de la cara rodeado de pelo: componente azul más alta tras erosionar."""
    im, px, inner, w, h = masks(im)
    blue = Image.new("L", (w, h), 0)
    bp = blue.load()
    for y in range(int(h * 0.6)):
        for x in range(w):
            if is_blue(px[x, y]):
                bp[x, y] = 255
    blue = blue.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(3))
    bp = blue.load()
    pts = [(x, y) for y in range(int(h * 0.6)) for x in range(w) if bp[x, y]]
    comps = [c for c in components(pts) if len(c) > 500]
    if not comps:
        return None
    face = min(comps, key=lambda c: min(p[1] for p in c))
    rows = {}
    for x, y in face:
        lo, hi = rows.get(y, (x, x))
        rows[y] = (min(lo, x), max(hi, x))
    ys = sorted(rows)
    ft = ys[0]
    # ancho de referencia: máximo en la mitad superior; parar cuando el cuello/cuerpo ensancha o se estrecha mucho
    upper = [rows[y][1] - rows[y][0] for y in ys if y < ft + 120]
    ref = max(upper) if upper else 100
    fb = ft
    for y in ys:
        wdt = rows[y][1] - rows[y][0]
        if y > ft + 60 and (wdt > ref * 1.15 or wdt < ref * 0.55):
            break
        fb = y
    mid = [y for y in ys if ft + 0.3 * (fb - ft) <= y <= ft + 0.6 * (fb - ft)] or ys
    cx = sum((rows[y][0] + rows[y][1]) / 2 for y in mid) / len(mid)
    return ft, fb, ref, cx


def beard_bbox(im):
    """Barba: mayor componente conexa de marrón oscuro (descarta correas de la mochila)."""
    im, px, inner, w, h = masks(im)
    pts = [(x, y) for y in range(int(h * 0.55)) for x in range(w) if inner[x, y] and is_hair(px[x, y]) and px[x, y][0] < 125]
    if not pts:
        return None
    c = max(components(pts), key=len)
    xs = sorted(p[0] for p in c)
    ys = sorted(p[1] for p in c)
    q = lambda arr, f: arr[int(f * (len(arr) - 1))]
    return q(xs, 0.02), q(ys, 0.02), q(xs, 0.98), q(ys, 0.98)


def inside_head(im, x, y, cx, margin, both=False):
    """Desplaza x hacia el centro de la cara hasta que la pieza (x±margin, y) caiga sobre la cabeza (azul)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    yy = int(min(h - 1, max(0, y)))
    ok = lambda xx: 0 <= int(xx) < w and is_blue(px[int(xx), yy])
    step = 1 if cx > x else -1
    for _ in range(int(abs(cx - x)) + 40):
        if both:
            if ok(x) and ok(x - margin) and ok(x + margin):
                return x
            # desplazar hacia el lado que tenga cabeza
            step = 1 if not ok(x - margin) else -1 if not ok(x + margin) else step
        elif ok(x) and ok(x - step * margin):
            return x
        x += step
    return x


def face_center(im, y):
    """Centro horizontal del tramo azul más ancho de la fila y (la cara)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    yy = int(min(h - 1, max(0, y)))
    best, start = None, None
    for x in range(w + 1):
        b = x < w and is_blue(px[x, yy])
        if b and start is None:
            start = x
        elif not b and start is not None:
            if best is None or x - start > best[1] - best[0]:
                best = (start, x)
            start = None
    return (best[0] + best[1]) / 2 if best else None


def slot(x, y, s):
    return {"x": round(x, 1), "y": round(y, 1), "scale": round(s, 3)}


def estimate_rig(char, pose_key, im, ref):
    """Posición estimada de cada hueco facial (px de la pose). Escalas en unidades de píxel ORIGINAL de la pieza."""
    w, h = im.size
    facing = -1 if "left" in pose_key else 1 if "right" in pose_key else 0
    rig = {}
    if char in ("usu", "jefe", "reynaldo"):
        lr = lens_region(im, solid=(char != "reynaldo"))
        if not lr:
            return None, "sin gafas detectadas"
        x0, y0, x1, y1 = lr
        lw, cx = x1 - x0, (x0 + x1) / 2
        if char == "reynaldo":
            holes = MANUAL_LENSES.get(f"char.{char}.{pose_key}") or lens_holes(im, lr)
            approx = len(holes) < 2 or abs(holes[0][1] - holes[1][1]) > 25 or holes[1][0] - holes[0][0] < 40
            if approx:
                # aproximación desde la banda de las gafas (marcada para revisión)
                lh = (y1 - y0) * 0.9
                holes = [(cx - lw / 4, (y0 + y1) / 2, lw / 2 * 0.72, lh), (cx + lw / 4, (y0 + y1) / 2, lw / 2 * 0.72, lh)]
            (lx, ly, lw1, lh1), (rx, ry, lw2, lh2) = holes
            for key, (hx, hy, hw, hh) in (("eyeL", holes[0]), ("eyeR", holes[1])):
                # el ojo se escala al ancho del cristal y se recorta a su interior (sin montura duplicada)
                rig[key] = {**slot(hx, hy, (hh / 2) / ref["lens_rx"]), "clip": [round(hw / 2 - 1, 1), round(hh / 2 - 1, 1)]}
            hh = (lh1 + lh2) / 2
            hwm = (lw1 + lw2) / 2
            top = min(ly - lh1 / 2, ry - lh2 / 2)
            bot = max(ly + lh1 / 2, ry + lh2 / 2)
            mid = (lx + rx) / 2
            rig["browL"] = slot(lx, top - 0.32 * hh, 0.95 * hwm / ref["brow"])
            rig["browR"] = slot(rx, top - 0.32 * hh, 0.95 * hwm / ref["brow"])
            rig["mouth"] = slot(mid + facing * 0.12 * hwm, bot + 0.95 * hh, 1.25 * hwm / ref["mouth"])
            method = ("APROXIMADO " if approx else "MEDIDO A MANO " if f"char.{char}.{pose_key}" in MANUAL_LENSES else "") + f"cristales en ({lx:.0f},{ly:.0f}) y ({rx:.0f},{ry:.0f}) bbox=({min(lx - lw1 / 2, rx - lw2 / 2):.0f},{top:.0f},{max(lx + lw1 / 2, rx + lw2 / 2):.0f},{bot:.0f})"
        else:
            runs = sorted(getattr(lens_region, "runs", []))
            lh = y1 - y0  # la altura del cristal no la deforma la perspectiva
            if len(runs) == 2:
                lcx, rcx = (runs[0][0] + runs[0][1]) / 2, (runs[1][0] + runs[1][1]) / 2
                cx = (lcx + rcx) / 2
            else:
                lcx, rcx = cx - 0.25 * lw, cx + 0.25 * lw
            by = y0 - 0.56 * lh
            lcx = inside_head(im, lcx, by, cx, 4)
            rcx = inside_head(im, rcx, by, cx, 4)
            # perspectiva: la ceja del cristal más estrecho (lado lejano) se reduce de forma uniforme
            rw = [r[1] - r[0] for r in runs] if len(runs) == 2 else [lw / 2, lw / 2]
            if min(rw) / max(rw) > 0.85:  # cristales casi iguales: vista frontal, cejas simétricas
                rw = [max(rw), max(rw)]
            big = max(rw)
            rig["browL"] = slot(lcx, by, 0.27 * lw / ref["brow"] * max(0.65, rw[0] / big))
            rig["browR"] = slot(rcx, by, 0.27 * lw / ref["brow"] * max(0.65, rw[1] / big))
            # separación mínima entre cejas (si se tocan, se reducen ambas de forma uniforme)
            need = 0.55 * ref["brow"] * (rig["browL"]["scale"] + rig["browR"]["scale"]) * 1.1
            gap = rcx - lcx
            if gap < need:
                f = max(0.6, gap / need)
                rig["browL"]["scale"] = round(rig["browL"]["scale"] * f, 3)
                rig["browR"]["scale"] = round(rig["browR"]["scale"] * f, 3)
                rw = [rw[0] * f, rw[1] * f]
                big = max(big, 1e-6)
            rig["browL"]["persp"] = round(max(0.65, rw[0] / big), 3)
            rig["browR"]["persp"] = round(max(0.65, rw[1] / big), 3)
            my = y1 + 1.2 * lh
            mw = 0.42 * lw
            mx = inside_head(im, cx + facing * 0.12 * lh, my, cx, mw / 2 + 6, both=True)
            rig["mouth"] = slot(mx, my, mw / ref["mouth"])
            rig["_lens"] = [x0, y0, x1, y1]
            method = f"gafas bbox=({x0},{y0},{x1},{y1}) cristales={runs}"
    elif char == "sister":
        f = sister_face(im)
        if not f:
            return None, "cara no detectada"
        ft, fb, fw, cx = f
        fh = min(fb - ft, 1.25 * fw)
        E = 0.78 * fw
        ey = ft + 0.36 * fh
        rig["eyeL"] = slot(cx - E / 4, ey, E / ref["eyes"])
        rig["eyeR"] = slot(cx + E / 4, ey, E / ref["eyes"])
        rig["browL"] = slot(cx - E / 4, ey - 0.3 * E, 0.32 * E / ref["brow"])
        rig["browR"] = slot(cx + E / 4, ey - 0.3 * E, 0.32 * E / ref["brow"])
        rig["mouth"] = slot(cx + facing * 0.03 * fw, ft + 0.7 * fh, 0.5 * fw / ref["mouth"])
        method = f"cara entre el pelo bbox=({cx - fw / 2:.0f},{ft},{cx + fw / 2:.0f},{ft + fh:.0f})"
    elif char == "barbas":
        b = beard_bbox(im)
        if not b:
            return None, "barba no detectada"
        x0, y0, x1, y1 = b
        bw, bh, cx = x1 - x0, y1 - y0, (x0 + x1) / 2
        E = 0.52 * bw
        ey = y0 - 0.1 * bh
        rig["eyeL"] = slot(cx - E / 4, ey, E / ref["eyes"])
        rig["eyeR"] = slot(cx + E / 4, ey, E / ref["eyes"])
        rig["browL"] = slot(cx - E / 4, ey - 0.32 * E, 0.3 * E / ref["brow"])
        rig["browR"] = slot(cx + E / 4, ey - 0.32 * E, 0.3 * E / ref["brow"])
        my = y0 + 0.42 * bh
        # la pieza (boca + trozo de barba) se recorta a la barba dibujada: nunca la sobrepasa al hablar
        rig["mouth"] = {**slot(cx, my, 0.9 * bw / ref["mouth"]), "clip": [round(bw / 2 * 0.86, 1), round(bh / 2 * 0.84, 1), 0.0, round((y0 + y1) / 2 - my - 0.04 * bh, 1)]}
        method = f"barba bbox=({x0},{y0},{x1},{y1})"
    rig["status"] = "estimated"
    rig["source"] = "scripts/v8/import_v8.py (" + method + ")"
    if f"char.{char}.{pose_key}" in RIG_REVIEW:
        rig["review"] = RIG_REVIEW[f"char.{char}.{pose_key}"]
    if method.startswith("APROXIMADO"):
        rig["review"] = rig.get("review", "No se detectaron bien los cristales: posición aproximada, recalibrar.")
    return rig, method


# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        die("Uso: python3 -I scripts/v8/import_v8.py <carpeta con PUNETOS_STUDIO_V8>")
    v8 = find_v8(os.path.abspath(sys.argv[1]))
    index = json.load(open(os.path.join(v8, "config", "library_index.json"), encoding="utf-8"))
    manifest_path = os.path.join(v8, "library", "packs", "punetos_initial_poses_v1", "manifest.json")
    manifest = json.load(open(manifest_path, encoding="utf-8"))
    assets = index["assets"]
    dest_root = os.path.join(ROOT, "public", "assets", "v8")
    shutil.rmtree(dest_root, ignore_errors=True)
    copied = []

    def copy(rel):
        src = os.path.join(v8, rel)
        if not os.path.isfile(src):
            return None
        dst = os.path.join(dest_root, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)
        copied.append(rel)
        return ASSET_BASE + "/" + rel.replace(os.sep, "/")

    missing = []
    report_lines = []
    pose_order = manifest["pose_order"]

    # Escala por pose: cada hoja maestra se dibujó a un tamaño distinto; se normaliza a la pose frontal.
    heights = {(a["character"], a["pose"]): a["size"][1] for a in assets["poses"].values()}
    pose_scale = {}
    for p in pose_order:
        ratios = [heights[(c, "pose_neutral_front")] / heights[(c, p)] for c, *_ in CHARACTERS if (c, p) in heights]
        pose_scale[p] = round(WORLD_SCALE * sum(ratios) / len(ratios), 4)

    characters = []
    for cid, name, color, voice in CHARACTERS:
        face = {"eyes": [], "brows": [], "mouths": []}
        for cat in ("eyes", "brows", "mouths"):
            for aid, a in sorted(assets.get(cat, {}).items()):
                if a.get("character") != cid:
                    continue
                src = copy(a["file"])
                if not src:
                    missing.append(a["file"])
                    continue
                im = Image.open(os.path.join(v8, a["file"]))
                entry = {"id": aid, "name": a["name"], "src": src, "width": im.size[0], "height": im.size[1], "bbox": content_bbox(im)}
                if cat == "brows":
                    runs = column_runs(im)
                    entry["kind"] = "pair" if len(runs) >= 2 else "single"
                    if entry["kind"] == "single":
                        entry["slope"], entry["curve"] = brow_shape(im)
                elif cat == "eyes":
                    entry["kind"] = "pair"
                    suffix = a["name"].split("_eyes_")[-1]
                    ewb = EYES_WITH_BROWS.get(cid)
                    if ewb == "all" or (isinstance(ewb, set) and suffix in ewb):
                        entry["includesBrows"] = True
                else:
                    entry["kind"] = "single"
                if aid in ASSET_NOTES:
                    entry["note"] = ASSET_NOTES[aid]
                orig_size = None
                if a.get("original_file"):
                    entry["original"] = a["original_file"]
                    op = os.path.join(v8, a["original_file"])
                    if os.path.isfile(op):
                        orig_size = Image.open(op).size
                entry.update(analyse_part(cid, cat, im, orig_size or im.size))
                if cid == "barbas" and cat in ("mouths", "eyes"):
                    entry["feather"] = True  # bordes rectos del recorte: se suavizan al componer
                face[cat].append(entry)

        # Tamaños de referencia en píxeles ORIGINALES (la escala de los rigs se expresa en esas unidades)
        def med(vals, d):
            vals = sorted(v for v in vals if v)
            return vals[len(vals) // 2] if vals else d
        orig_w = lambda e: (e["bbox"][2] - e["bbox"][0]) / e.get("normScale", 1)
        ref = {
            "eyes": med([orig_w(e) for e in face["eyes"]], 140),
            "brow": med([orig_w(e) for e in face["brows"] if e["kind"] == "single"], 100),
            "mouth": med([orig_w(e) for e in face["mouths"]], 140),
            "lens_rx": med([e["lens"][sd][2] for e in face["eyes"] if e.get("lens") for sd in e["lens"]], 30),
        }


        poses = []
        for p in pose_order:
            aid = f"char.{cid}.{p}"
            a = assets["poses"].get(aid)
            if not a:
                missing.append(aid)
                continue
            src = copy(a["file"])
            if not src:
                missing.append(a["file"])
                continue
            im = Image.open(os.path.join(v8, a["file"]))
            rig, method = estimate_rig(cid, p, im, ref)
            if not rig:
                report_lines.append(f"- ⚠ {aid}: {method}")
            poses.append({
                "id": aid, "key": p, "label": POSE_LABELS.get(p, p), "src": src,
                "width": im.size[0], "height": im.size[1], "displayScale": pose_scale[p],
                "facing": "left" if "left" in p else "right" if "right" in p else "front",
                **({"rig": rig} if rig else {}),
            })

        # Mismo tamaño de piezas en todas las poses: la escala sale de la pose frontal (la detección más fiable)
        # corregida por el tamaño de dibujo de cada hoja (displayScale). Reynaldo ajusta los ojos a sus cristales.
        front = next((q for q in poses if q["key"] == "pose_neutral_front" and q.get("rig")), None)
        if front:
            for q in poses:
                rig = q.get("rig")
                if not rig or q is front:
                    continue
                k = front["displayScale"] / q["displayScale"]
                for sl in ("browL", "browR", "mouth", "eyeL", "eyeR"):
                    if sl in rig and sl in front["rig"] and not (cid == "reynaldo" and sl.startswith("eye")):
                        fp = front["rig"][sl].get("persp", 1)
                        rig[sl]["scale"] = round(front["rig"][sl]["scale"] / fp * k * rig[sl].get("persp", 1), 3)
        # Alturas de cejas y boca de Usu/Jefe: desde el CENTRO de las gafas con el tamaño de la pose frontal
        # (la altura medida en algunas poses incluye pelo o patillas y desplazaba la cara).
        if front and "_lens" in front.get("rig", {}):
            fx0, fy0, fx1, fy1 = front["rig"]["_lens"]
            flh = fy1 - fy0
            for q in poses:
                rig = q.get("rig")
                if not rig or "_lens" not in rig:
                    continue
                k = front["displayScale"] / q["displayScale"]
                lx0, ly0, lx1, ly1 = rig["_lens"]
                lh = flh * k
                cy = (ly0 + ly1) / 2
                for sl in ("browL", "browR"):
                    rig[sl]["y"] = round(cy - (0.5 + 0.56) * lh, 1)
                rig["mouth"]["y"] = round(cy + (0.5 + 1.2) * lh, 1)
        # Comprobación final en TODAS las poses: la boca entera y las cejas deben caer sobre la cabeza.
        for q in poses:
            rig = q.get("rig")
            if not rig:
                continue
            rig.pop("_lens", None)
            pim = Image.open(os.path.join(v8, assets["poses"][q["id"]]["file"]))
            m = rig["mouth"]
            half = m["scale"] * ref["mouth"] / 2 + 4
            if cid != "barbas":  # la boca de Barbas va sobre la barba y ya se recorta a su contorno
                m["x"] = round(inside_head(pim, m["x"], m["y"], q["width"] / 2 if not face_center(pim, m["y"]) else face_center(pim, m["y"]), half, both=True), 1)
            for sl in ("browL", "browR"):
                b = rig[sl]
                bh = b["scale"] * ref["brow"] / 2
                b["x"] = round(inside_head(pim, b["x"], b["y"], face_center(pim, b["y"]) or q["width"] / 2, min(bh, 12)), 1)
            # verificación: extremos de la boca y centro de cada ceja sobre la cabeza
            ppx = pim.convert("RGBA").load()
            def on_head(x, y):
                xi, yi = int(x), int(y)
                if not (0 <= xi < q["width"] and 0 <= yi < q["height"]):
                    return False
                p_ = ppx[xi, yi]
                return is_blue(p_) or (cid == "barbas" and is_hair(p_))
            mh = m["scale"] * ref["mouth"] / 2
            for label, (x, y) in (("boca izq.", (m["x"] - mh, m["y"])), ("boca der.", (m["x"] + mh, m["y"])),
                                  ("ceja izq.", (rig["browL"]["x"], rig["browL"]["y"] + 6)), ("ceja der.", (rig["browR"]["x"], rig["browR"]["y"] + 6))):
                if not on_head(x, y):
                    VIOLATIONS.append(f"{q['id']}: {label} fuera de la cara en ({x:.0f},{y:.0f})")
        for q in poses:
            for sl in ("browL", "browR"):
                if q.get("rig", {}).get(sl):
                    q["rig"][sl].pop("persp", None)

        # --- prefabs en borrador ---
        brows = [b for b in face["brows"] if b["kind"] == "single"]
        def pick(key):
            return key(brows)["id"] if brows else None
        flat = pick(lambda bs: min(bs, key=lambda b: abs(b["slope"]) + abs(b["curve"])))
        arch = pick(lambda bs: max(bs, key=lambda b: b["curve"] - abs(b["slope"]) * 0.5))
        falling = pick(lambda bs: max(bs, key=lambda b: b["slope"] - 0.4 * abs(b["curve"])))
        rising = pick(lambda bs: min(bs, key=lambda b: b["slope"] + 0.4 * abs(b["curve"])))
        manual = BROW_OVERRIDES.get(cid, {})
        brow_for = {
            "neutral": (flat, 0), "alegria": (arch, 0), "risa": (arch, -4),
            "enfado": (falling, 4), "sorpresa": (arch, -10), "tristeza": (rising, 0),
        }
        mouth_id = lambda n: f"face.{cid}.mouths.{cid}_mouth_{n:02d}"
        eye_id = lambda s: f"face.{cid}.eyes.{cid}_eyes_{s}"
        exprs = []
        for emo, label in EMOTIONS:
            rest, talk = MOUTHS[cid][emo]
            e = {"id": f"expression.{cid}.{emo}", "emotion": emo, "label": label, "status": "draft",
                 "mouth": {"assetId": mouth_id(rest)}, "talk": [mouth_id(n) for n in talk]}
            eyes_with_brows = False
            if EYES[cid]:
                eid = eye_id(EYES[cid][emo])
                e["eyeL"] = {"assetId": eid, "crop": "left"}
                e["eyeR"] = {"assetId": eid, "crop": "right"}
                eyes_with_brows = any(x["id"] == eid and x.get("includesBrows") for x in face["eyes"])
            bid, dy = brow_for[emo]
            if emo in manual and not eyes_with_brows:
                pid = manual[emo]  # par de cejas: cada lado usa su mitad
                e["browL"] = {"assetId": pid, "crop": "left"}
                e["browR"] = {"assetId": pid, "crop": "right"}
            elif bid and not eyes_with_brows:
                e["browL"] = {"assetId": bid, **({"dy": dy} if dy else {})}
                e["browR"] = {"assetId": bid, "flip": True, **({"dy": dy} if dy else {})}
            exprs.append(e)
        known = {x["id"] for cat in face.values() for x in cat}
        for e in exprs:
            for k in ("mouth", "eyeL", "eyeR", "browL", "browR"):
                if k in e and e[k]["assetId"] not in known:
                    die(f"Prefab {e['id']} usa un asset inexistente: {e[k]['assetId']}")
            for t in e["talk"]:
                if t not in known:
                    die(f"Prefab {e['id']} usa una boca inexistente: {t}")

        characters.append({
            "id": cid, "name": name, "color": color, "defaultVoice": voice,
            "hasEyes": bool(face["eyes"]),
            "poses": poses, "face": face, "expressions": exprs,
            "fallbackExpressionId": f"expression.{cid}.neutral",
        })

    # Fondos y objetos: el ZIP V8 no trae escenarios ni props (scenarios: 0, props: 0).
    # Se conservan los provisionales de Pocket, marcados como tales.
    prev = json.load(open(os.path.join(ROOT, "src", "data", "catalog.json"), encoding="utf-8"))
    backgrounds = [dict(b, placeholder=True) for b in prev.get("backgrounds", [])]
    props = [dict(p, placeholder=True) for p in prev.get("props", [])]

    # Licencia / notas originales
    for extra in ("LEEME_ASSETS.txt",):
        p = os.path.join(os.path.dirname(v8), extra)
        if os.path.isfile(p):
            shutil.copyfile(p, os.path.join(dest_root, extra))
    shutil.copyfile(os.path.join(v8, "templates", "TIMELINE_SCHEMA_EXAMPLE.json"), os.path.join(ROOT, "tests", "fixtures", "v8-timeline-schema-example.json"))

    catalog = {
        "catalogVersion": "v8-assets-1",
        "source": {
            "kind": "v8-library-index",
            "note": "Personajes, poses y piezas faciales REALES de PUNETOS_STUDIO_V8 (library_index.json). "
                    "Posiciones faciales ESTIMADAS (sin calibrar) y prefabs de expresión en BORRADOR creados por Pocket: el ZIP no trae calibraciones ni prefabs. "
                    "Fondos y objetos siguen siendo provisionales (V8 no incluye escenarios ni props).",
            "license": "Assets de PUÑETOS STUDIO V8 (ver public/assets/v8/LEEME_ASSETS.txt). Fondos/objetos provisionales: dibujos de este repositorio.",
            "generatedAt": datetime.date.today().isoformat(),
        },
        "canvas": {"width": 1080, "height": 1920},
        "emotions": [e for e, _ in EMOTIONS],
        "emotionLabels": {e: l for e, l in EMOTIONS},
        "characters": characters,
        "backgrounds": backgrounds,
        "props": props,
    }
    out = os.path.join(ROOT, "src", "data", "catalog.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
        f.write("\n")
    shutil.copyfile(out, os.path.join(ROOT, "catalog.json"))

    # --- inventario ---
    counts = {k: len(v) for k, v in assets.items()}
    lines = [
        "# Inventario PUÑETOS STUDIO V8 → Pocket", "",
        f"Generado por `scripts/v8/import_v8.py` el {datetime.date.today().isoformat()}.", "",
        "## library_index.json", "",
        "| Categoría | Assets |", "|---|---|",
        *[f"| {k} | {v} |" for k, v in counts.items()], "",
        f"Archivos copiados a `public/assets/v8/`: **{len(copied)}** (rutas originales conservadas). Faltantes: {len(missing)}.", "",
        "## Por personaje", "",
        "| Personaje | Poses | Ojos | Cejas (simples/pares) | Bocas | Prefabs borrador |", "|---|---|---|---|---|---|",
    ]
    for c in characters:
        fb = c["face"]["brows"]
        lines.append(f"| {c['name']} | {len(c['poses'])} | {len(c['face']['eyes']) or '— (gafas de sol en el cuerpo)'} | "
                     f"{sum(b['kind']=='single' for b in fb)}/{sum(b['kind']=='pair' for b in fb)} | {len(c['face']['mouths'])} | {len(c['expressions'])} |")
    lines += ["", "## Escala por pose (normaliza el tamaño entre hojas maestras)", "",
              *[f"- `{p}`: {s}" for p, s in pose_scale.items()], "",
              "## Rigs faciales estimados (status `estimated`, NO calibrados)", ""]
    for c in characters:
        for p in c["poses"]:
            lines.append(f"- `{p['id']}`: {p.get('rig', {}).get('source', 'sin rig')}")
    lines += ["", "## Avisos", "", *report_lines, *[f"- `{k}`: {v}" for k, v in ASSET_NOTES.items()],
              *[f"- ⚠ {v_}" for v_ in VIOLATIONS],
              "- El ZIP no incluye calibraciones ni prefabs guardados (LEEME_ASSETS.txt). Los de Pocket son borradores.",
              "- `scenarios: 0`, `props: 0`, `expressions: 0` en library_index: fondos y objetos siguen siendo provisionales.",
              "- Usu y Jefe no tienen piezas de ojos: llevan gafas de sol dibujadas en el cuerpo.",
              "- Las piezas `_izq`/`_der` son las mitades izquierda/derecha de un original con dos variantes de ojos.",
              *[f"- Faltante: {m}" for m in missing]]
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    with open(os.path.join(ROOT, "docs", "V8_INVENTORY.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
