"""Poses humanas cuya «boca de hablar» apenas se distingue de la cerrada: dibuja una boca abierta más grande
en el mismo sitio (versión *_boca2.webp) y la pone como talkSrc. Uso: python3 tools/andar/boca_grande.py [--aplicar]"""
import json, sys, numpy as np, os
from PIL import Image, ImageDraw
c = json.load(open('src/data/catalog.json'))
changes = []
for x in c['characters']:
    for p in x['poses']:
        if p.get('archived') or not p['key'].startswith('pose_h_') or not p.get('talkSrc') or p['talkSrc'] == p['src'] or '_boca2' in p['talkSrc']:
            continue
        try:
            a = Image.open('public' + p['src']).convert('RGBA'); b = Image.open('public' + p['talkSrc']).convert('RGBA')
        except Exception:
            continue
        A = np.array(a).astype(int); B = np.array(b).astype(int)
        if A.shape != B.shape: continue
        d = np.abs(A - B).sum(-1) > 60
        ys, xs = np.nonzero(d)
        if len(xs) == 0 or d.sum() < 80 or d.sum() >= 220 or xs.max() - xs.min() > 40 or ys.max() - ys.min() > 30: continue
        cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
        w = min(18, max(14, xs.max() - xs.min() + 1)); S = 4
        big = b.resize((a.width * S, a.height * S), Image.LANCZOS); dr = ImageDraw.Draw(big)
        W, H = w * 1.9 * S, w * 1.05 * S
        X, Y = cx * S, (cy + w * 0.12) * S
        dr.ellipse([X - W / 2, Y - H / 2, X + W / 2, Y + H / 2], fill=(70, 14, 22, 255), outline=(25, 8, 10, 255), width=int(1.6 * S))
        dr.ellipse([X - W * 0.3, Y + H * 0.05, X + W * 0.3, Y + H * 0.45], fill=(205, 85, 95, 255))
        dr.rectangle([X - W * 0.32, Y - H / 2 + 1.6 * S, X + W * 0.32, Y - H / 2 + H * 0.18], fill=(250, 248, 240, 255))
        o = big.resize(a.size, Image.LANCZOS)
        dst = p['src'].replace('.webp', '_boca2.webp')
        changes.append((x['id'], p['key'], dst, o))
print(len(changes), [f'{c_}:{k}' for c_, k, _, _ in changes][:200])
if '--aplicar' in sys.argv:
    for cid, k, dst, o in changes: o.save('public' + dst, 'WEBP', quality=92)
    for fn in ['catalog.json', 'src/data/catalog.json']:
        cc = json.load(open(fn))
        for cid, k, dst, _ in changes:
            q = next(q for y in cc['characters'] if y['id'] == cid for q in y['poses'] if q['key'] == k); q['talkSrc'] = dst
        open(fn, 'w').write(json.dumps(cc, ensure_ascii=False, indent=1))
elif len(sys.argv) > 1 and sys.argv[1] == '--muestra':
    tiles = []
    for cid, k, dst, o in changes[:12]:
        p = next(q for y in c['characters'] if y['id'] == cid for q in y['poses'] if q['key'] == k)
        a = Image.open('public' + p['src']).convert('RGBA'); A = np.array(a).astype(int); B = np.array(Image.open('public' + p['talkSrc']).convert('RGBA')).astype(int)
        ys, xs = np.nonzero(np.abs(A - B).sum(-1) > 60); cx, cy = int(xs.mean()), int(ys.mean())
        box = (cx - 50, cy - 40, cx + 50, cy + 40)
        t = Image.new('RGBA', (300, 120), (255, 255, 255, 255)); t.alpha_composite(a.crop(box).resize((150, 120)), (0, 0)); t.alpha_composite(o.crop(box).resize((150, 120)), (150, 0)); tiles.append(t)
    s = Image.new('RGBA', (900, 120 * ((len(tiles) + 2) // 3)), (255, 255, 255, 255))
    for i, t in enumerate(tiles): s.alpha_composite(t, ((i % 3) * 300, (i // 3) * 120))
    s.save(sys.argv[2])
