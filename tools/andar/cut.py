import cv2, numpy as np, sys
from scipy import ndimage
from PIL import Image, ImageDraw
src,outp=sys.argv[1],sys.argv[2]
im=cv2.imread(src)
beige=np.array([228,236,240])
dist=np.abs(im.astype(int)-beige).sum(-1)
lab,n=ndimage.label(dist<40)
border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
fg=ndimage.binary_fill_holes(~np.isin(lab,list(border)))
rgb=im[...,::-1]; Wf=im.shape[1]//4
outs=[]
for i in range(4):
    x0,x1=i*Wf,(i+1)*Wf
    m=fg[:,x0:x1]; l2,n2=ndimage.label(m); s=ndimage.sum(m,l2,range(1,n2+1)); keep=l2==(np.argmax(s)+1)
    alpha=np.clip(dist[:,x0:x1]*255/60,0,255); alpha[ndimage.binary_erosion(keep,iterations=2)]=255; alpha[~keep]=0
    outs.append(Image.fromarray(np.dstack([rgb[:,x0:x1],alpha]).astype(np.uint8)))
# misma rejilla que la hoja (ya alineada): recorte común
bbs=[o.getbbox() for o in outs]
L=min(b[0] for b in bbs); T=min(b[1] for b in bbs); R=max(b[2] for b in bbs); B=max(b[3] for b in bbs)
fr=[o.crop((L-4,T-4,R+4,B+4)) for o in outs]
for i,f in enumerate(fr): f.save(f'{outp}{i+1}.png')
W,H=fr[0].size; bg=(240,236,228,255)
sheet=Image.new('RGBA',(W*4,H),bg)
for i,f in enumerate(fr): sheet.alpha_composite(f,(i*W,0))
sheet.save(f'{outp}_sheet.png')
g=[];x=-W;k=0
while x<1000:
    b=Image.new('RGBA',(1000,H+20),bg); ImageDraw.Draw(b).rectangle([0,H,1000,H+20],fill=(200,190,175,255))
    b.alpha_composite(fr[k%4],(int(x),0)); g.append(b.convert('RGB').resize((500,(H+20)//2))); k+=1; x+=30
g[0].save(f'{outp}.gif',save_all=True,append_images=g[1:],duration=150,loop=0)
print(W,H)
