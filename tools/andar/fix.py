import cv2, numpy as np
from scipy import ndimage
im=cv2.imread('/tmp/claude-0/-home-user/8fce80ec-0b52-584b-9cbc-de0404003495/images/70.webp')
H,W=im.shape[:2]
beige=np.array([228,236,240])  # BGR
near=(np.abs(im.astype(int)-beige).sum(-1)<40)
lab,n=ndimage.label(near)
border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
bg=np.isin(lab,list(border))
body=~bg
dw=cv2.distanceTransform(body.astype(np.uint8),cv2.DIST_L2,5)
out=im.copy()
def fix(x0,y0,x1,y1):
    reg=im[y0:y1,x0:x1].copy(); b=body[y0:y1,x0:x1]; d=dw[y0:y1,x0:x1]
    s=reg.astype(int).sum(-1)
    dark=((s<300)&b).astype(np.uint8)
    k=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5))
    thick=cv2.morphologyEx(dark,cv2.MORPH_OPEN,k)
    thin=dark&(1-thick)&(d>9)
    thin=cv2.morphologyEx(thin.astype(np.uint8),cv2.MORPH_OPEN,np.ones((2,2),np.uint8))
    lines=dark|cv2.dilate(thin,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(4,4)))
    specks=((reg.min(-1)>170)&b&(d>3)).astype(np.uint8)
    fill=cv2.inpaint(reg,((dark|specks)*255).astype(np.uint8),5,cv2.INPAINT_TELEA)
    sm=cv2.bilateralFilter(cv2.medianBlur(fill,21),15,40,15)
    res=reg.astype(np.float32)
    inner=b&(d>2)
    res[inner]=sm[inner]
    a=np.clip(cv2.GaussianBlur(lines.astype(np.float32),(3,3),0)*1.6,0,1)[...,None]
    res=res*(1-a)+5*a
    res[~b]=reg[~b]
    h,w=reg.shape[:2]
    m=np.zeros((h,w),np.float32); m[8:h-8,8:w-8]=1; m=cv2.GaussianBlur(m,(17,17),0)[...,None]
    out[y0:y1,x0:x1]=(res*m+reg*(1-m)).astype(np.uint8)
fix(925,412,1135,560)
fix(1335,402,1570,470)
cv2.imwrite('sis2/fixed.png',out)
cv2.imwrite('sis2/cmp.png',cv2.resize(np.hstack([im[330:597,818:1636],out[330:597,818:1636]]),None,fx=1.3,fy=1.3))
