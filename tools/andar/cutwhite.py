import sys, numpy as np
from PIL import Image
from scipy import ndimage
src,outp=sys.argv[1],sys.argv[2]
a=np.array(Image.open(src).convert('RGB')).astype(int); mn=a.min(-1); mx=a.max(-1)
shadow=(mx-mn<25)&(mn>140)
fg=(mn<=232)&~shadow
m=ndimage.binary_fill_holes(fg); m=ndimage.binary_opening(m,iterations=1)
lab,n=ndimage.label(m); s=ndimage.sum(m,lab,range(1,n+1))
objs=ndimage.find_objects(lab)
big=sorted([i+1 for i,v in enumerate(s) if v>15000],key=lambda i:objs[i-1][1].start)
for k,i in enumerate(big):
    sl=objs[i-1]; keep=ndimage.binary_fill_holes(lab[sl]==i)
    sub=a[sl]; alpha=np.clip((255-mn[sl])*255/35,0,255); alpha[ndimage.binary_erosion(keep,iterations=2)]=255; alpha[~keep]=0
    Image.fromarray(np.dstack([sub,alpha]).astype(np.uint8),'RGBA').save(f'{outp}{k+1}.png'); print(k+1,keep.shape)
