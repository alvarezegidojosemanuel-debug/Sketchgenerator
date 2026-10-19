import sys, numpy as np
import scipy.ndimage as nd
from PIL import Image
sys.path.insert(0,'tools/andar'); from crotch import crotch, runs_at
body_path=sys.argv[1]; out=sys.argv[2]
B=Image.open(body_path); b=np.array(B); bal=b[...,3]>128
cyB,_,_=crotch(body_path)
U=[Image.open(f'public/assets/punetos/punetos/usu/anda{i}.webp') for i in range(1,5)]
ua=[np.array(u) for u in U]
cyU=338
yU=cyU-38
def body_run(al,y,ref=None):
    r=runs_at(al,y)
    return max(r,key=lambda q:q[1]-q[0])
ru=body_run(ua[0][...,3]>128,yU)
# escala por la altura total (las piernas de todos los Puñetos son proporcionales al cuerpo)
hU=431
ysB=np.nonzero(bal.any(1))[0]; hB=ysB.max()-ysB.min()
s=float(sys.argv[3]) if len(sys.argv)>3 else hB/hU
yB=int(round(cyB-(cyU-yU)*s))
rb=body_run(bal,yB)
print('scale',round(s,3),'yB',yB,'rb',rb,'ru',ru)
frames=[]
for i,u in enumerate(U):
    a=ua[i]
    # piernas: desde un poco por encima del corte
    top=yU-14
    legs=u.crop((0,top,u.width,u.height))
    legs=legs.resize((round(legs.width*s),round(legs.height*s)),Image.LANCZOS)
    # anclar: centro del tramo de cuerpo de Usu (frame 1) -> centro del de Rey
    cxU=(ru[0]+ru[1])/2; cxB=(rb[0]+rb[1])/2
    ox=round(cxB-cxU*s); oy=round(yB-(yU-top)*s)
    H=oy+legs.height; W=max(B.width,ox+legs.width)-min(0,ox)
    sx=-min(0,ox)
    cv=Image.new('RGBA',(W,max(H,B.height)),(0,0,0,0))
    cv.alpha_composite(legs,(ox+sx,oy))
    # cuerpo de Rey por encima del corte (con un fundido corto)
    bb=b.copy()
    yy=np.arange(b.shape[0])[:,None]
    fade=np.clip((yB+6-yy)/18,0,1)
    # lo que no es cuerpo (bolso, mochila, mano) no se funde: solo el azul y su contorno
    r,g,bl=bb[...,0].astype(int),bb[...,1].astype(int),bb[...,2].astype(int)
    brown=(r>g)&(g>bl)&(r>35)&(r-bl>20)
    brown=nd.binary_opening(brown,iterations=2)

    brown=nd.binary_dilation(nd.binary_fill_holes(nd.binary_closing(brown,iterations=3)),iterations=5)
    f=np.where(brown,np.maximum(fade,(yy<yB+90).astype(float)),fade) if True else fade
    bb[...,3]=(bb[...,3]*f).astype(np.uint8)
    cv.alpha_composite(Image.fromarray(bb),(sx,0))
    frames.append(cv)
Hm=max(f.height for f in frames); Wm=max(f.width for f in frames)
for i,f in enumerate(frames):
    c=Image.new('RGBA',(Wm,Hm),(0,0,0,0)); c.alpha_composite(f,(0,Hm-f.height)); c.save(f'{out}{i+1}.png')
bg=(240,236,228,255)
sheet=Image.new('RGBA',(Wm*4,Hm),bg)
for i in range(4): sheet.alpha_composite(Image.open(f'{out}{i+1}.png'),(i*Wm,0))
sheet.save(f'{out}_sheet.png')
