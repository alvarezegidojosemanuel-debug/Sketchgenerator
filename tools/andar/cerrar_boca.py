"""Para poses con la boca ABIERTA (lengua roja visible): genera la versión con la boca CERRADA.
La cerrada pasa a ser la imagen normal (src) y la abierta la de hablar (talkSrc) → la boca se mueve al hablar.
Uso: python3 tools/andar/cerrar_boca.py <png_entrada> <png_salida_cerrada>  (imprime OK o NO)"""
import sys, numpy as np, cv2
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.interpolate import griddata
src, dst = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert('RGBA')); rgb = a[..., :3].astype(int); al = a[..., 3] > 128
H, W = al.shape
ys, _ = np.nonzero(al); top = ys.min()
red = (rgb[..., 0] > 190) & (rgb[..., 1] < 110) & (rgb[..., 2] < 120) & (rgb[..., 0] - rgb[..., 1] > 110) & al
red[int(top + 0.5 * (ys.max() - top)):] = False
red = ndimage.binary_opening(red, iterations=1)
dark = ndimage.binary_dilation((rgb.max(-1) < 70) & al, iterations=6)
lab0, n0 = ndimage.label(red)
red = np.isin(lab0, [j for j in range(1, n0 + 1) if ((lab0 == j) & dark).sum() > 0.3 * (lab0 == j).sum()])
lab, n = ndimage.label(red)
if not n: print('NO'); sys.exit(0)
s = ndimage.sum(red, lab, range(1, n + 1)); t = lab == (np.argmax(s) + 1)
if s.max() < 40: print('NO'); sys.exit(0)
ty, tx = np.nonzero(t); cy, cx = int(ty.mean()), int(tx.mean())
mx = rgb.max(-1)
cand = (red | (mx < 42) | (rgb.min(-1) > 185) | ((rgb[..., 0] > 40) & (rgb[..., 1] < 0.33 * rgb[..., 0]) & (rgb[..., 2] < 0.7 * rgb[..., 0] + 20))) & al
box = np.zeros_like(cand); r = max(30, int(np.sqrt(s.max()) * 2.6))
box[max(0, cy - int(r * 0.75)):cy + r // 2 + 6, max(0, cx - r):cx + r] = True
lab2, _ = ndimage.label(cand & box)
keep = ndimage.binary_fill_holes(np.isin(lab2, np.unique(lab2[t])[np.unique(lab2[t]) > 0]))
ky, kx = np.nonzero(keep)
hull = cv2.convexHull(np.stack([kx, ky], 1).astype(np.int32))
hm = np.zeros(al.shape, np.uint8); cv2.fillPoly(hm, [hull], 1)
mask = ndimage.binary_dilation(hm.astype(bool), iterations=5) & al
ring = ndimage.binary_dilation(mask, iterations=9) & ~mask & al & (mx >= 55)
ry, rx = np.nonzero(ring); yy, xx = np.nonzero(mask)
out = a.astype(float)
for ch in range(3):
    out[yy, xx, ch] = griddata((ry, rx), rgb[ry, rx, ch], (yy, xx), method='linear', fill_value=float(np.median(rgb[ry, rx, ch])))
rr = rgb[ry, rx]
beard = np.mean((rr[:, 0] > rr[:, 2] + 20) & (rr[:, 2] < 120)) > 0.5
if beard:
    br = rr[(rr[:, 0] > rr[:, 2] + 20) & (rr[:, 2] < 120)]
    rng = np.random.default_rng(1)
    out[yy, xx, :3] = br[rng.integers(0, len(br), len(yy))]
    out[..., :3] = np.where(mask[..., None], cv2.GaussianBlur(out[..., :3], (5, 5), 0), out[..., :3])
sm = cv2.GaussianBlur(out[..., :3], (3, 3), 0) if beard else cv2.GaussianBlur(out[..., :3], (5, 5), 0)
soft = cv2.GaussianBlur(mask.astype(np.float32), (5, 5), 0)[..., None]
out[..., :3] = a[..., :3] * (1 - soft) + sm * soft
o = Image.fromarray(out.astype(np.uint8)); d = ImageDraw.Draw(o)
x0, x1, y0, y1 = kx.min(), kx.max(), ky.min(), ky.max()
w = (x1 - x0) * 0.55; c0 = (x0 + x1) / 2; ym = y0 + (y1 - y0) * 0.3
d.arc([c0 - w / 2, ym - 14, c0 + w / 2, ym + 10], 18, 162, fill=(40, 22, 12, 255) if beard else (8, 8, 25, 255), width=max(3, int(W / 110)))
o.save(dst); print('OK', x0, x1, y0, y1)
