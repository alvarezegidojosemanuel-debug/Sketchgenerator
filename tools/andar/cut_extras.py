"""Recorta figuras de una hoja con fondo blanco conservando los blancos interiores (ojos, tazas, zapatillas).
Los huecos blancos grandes y cerrados (entre patas de sillas) sí se vuelven transparentes.
Uso: python3 tools/andar/cut_extras.py <hoja.png> <salida_prefijo>  → <prefijo>1.png, 2.png…"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage
a=np.array(Image.open(sys.argv[1]).convert('RGB')).astype(int); mn=a.min(-1)
white=mn>=238
if '--sin-sombra' in sys.argv:
    white|=(a.max(-1)-mn<22)&(mn>150)  # sombra gris clara en el suelo
m=ndimage.binary_closing(~white,iterations=1)
lab,n=ndimage.label(m); s=ndimage.sum(m,lab,range(1,n+1)); objs=ndimage.find_objects(lab)
out=[]
for i,v in enumerate(s):
    if v<20000: continue
    sl=objs[i]; own=lab[sl]==i+1; keep=ndimage.binary_fill_holes(own)
    holes=keep&~own&white[sl]
    hl,hn=ndimage.label(holes); hs=ndimage.sum(holes,hl,range(1,hn+1))
    big=np.isin(hl,[j+1 for j,x in enumerate(hs) if x>2500])
    keep2=keep&~big
    alpha=np.clip((255-mn[sl])*255/30,0,255)
    inner=ndimage.binary_erosion(keep2,iterations=2)
    alpha[inner]=255; alpha[~keep2]=0
    out.append(((sl[0].start//250, sl[1].start) if "--rejilla" in sys.argv else sl[1].start,Image.fromarray(np.dstack([a[sl],alpha]).astype(np.uint8),'RGBA')))
for k,(_,im) in enumerate(sorted(out,key=lambda o:o[0])): im.save(f'{sys.argv[2]}{k+1}.png'); print(k+1,im.size)
