"""Cierra la boca de una pose usando OTRA imagen de la misma pose con la boca cerrada (p. ej. regenerada con GPT):
alinea la cerrada sobre la abierta (afín, ECC) y copia solo una elipse alrededor de la boca, así el cuerpo no salta.
Uso: python3 tools/andar/boca_de_otra.py <abierta.png> <cerrada.png> <salida.png> cx cy rx ry   (elipse en px de la abierta)"""
import sys, numpy as np, cv2
from PIL import Image

op, cp, out = sys.argv[1:4]
cx, cy, rx, ry = map(float, sys.argv[4:8])
A = np.array(Image.open(op).convert('RGBA')); C = np.array(Image.open(cp).convert('RGBA'))
H, W = A.shape[:2]
# arranque: escalar la cerrada a la altura de la abierta y alinear por arriba y por el centro
s = H / C.shape[0]
Cs = cv2.resize(C, (max(1, int(C.shape[1] * s)), H), interpolation=cv2.INTER_AREA)
def gray(x):
    g = cv2.cvtColor(x[..., :3], cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    return g * (x[..., 3] > 128) + (x[..., 3] <= 128) * 1.0
ga = gray(A)
canvas = np.zeros_like(A); w = min(W, Cs.shape[1]); ox = (W - Cs.shape[1]) // 2
src = np.zeros((H, max(W, Cs.shape[1]) + abs(ox) * 2, 4), np.uint8)
# coloca la cerrada centrada en un lienzo del tamaño de la abierta
M0 = np.float32([[1, 0, ox], [0, 1, 0]])
C0 = cv2.warpAffine(Cs, M0, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
gc = gray(C0)
warp = np.eye(2, 3, dtype=np.float32)
# la región de la cara pesa más: se alinea con una máscara alrededor de la boca (cabeza)
mask = np.zeros((H, W), np.uint8)
cv2.ellipse(mask, (int(cx), int(cy)), (int(rx * 4), int(ry * 4)), 0, 0, 360, 255, -1)
try:
    _, warp = cv2.findTransformECC(ga, gc, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), mask, 5)
except cv2.error as e:
    print('ECC falló:', e)
C1 = cv2.warpAffine(C0, warp, (W, H), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderValue=(0, 0, 0, 0))
m = np.zeros((H, W), np.float32)
cv2.ellipse(m, (int(cx), int(cy)), (int(rx), int(ry)), 0, 0, 360, 1, -1)
m = cv2.GaussianBlur(m, (0, 0), max(2, rx * 0.12))[..., None]
O = A.copy()
O[..., :3] = (A[..., :3] * (1 - m) + C1[..., :3] * m).astype(np.uint8)
Image.fromarray(O).save(out)
err = np.abs(gray(C1) - ga)[mask > 0].mean()
print('ok', round(float(err), 3))
