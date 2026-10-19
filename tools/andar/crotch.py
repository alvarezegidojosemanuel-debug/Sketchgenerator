from PIL import Image
import numpy as np
def runs_at(al,y):
    xs=np.nonzero(al[y])[0]
    if len(xs)==0: return []
    r=np.split(xs,np.nonzero(np.diff(xs)>3)[0]+1)
    return [(int(q[0]),int(q[-1])) for q in r if len(q)>8]
def crotch(path):
    a=np.array(Image.open(path)); al=a[...,3]>128; H=a.shape[0]
    seen2=False
    for y in range(H-1,0,-1):
        r=runs_at(al,y)
        if len(r)>=2: seen2=True
        elif seen2 and len(r)==1: return y, r[0], H
if __name__=='__main__':
    for p in ['walk3/anda1.png','walk3/anda2.png','walk3/anda3.png','walk3/anda4.png','rey/f4.png','rey/f1.png']:
        print(p,crotch(p))
