"""Instala un pack de 3 poses sentado (una imagen por personaje, fondo blanco).
Uso: python3 tools/andar/install_sentados.py <dir_imagenes> <n_reynaldo> <n_barbas> <n_sister> <n_usu> <n_jefe> clave1:etiqueta1 ... (tantas como figuras; "-" = saltar personaje)
Tamaño: la figura más alta del pack mide como pose_p_cafe_habla del personaje."""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage
I=sys.argv[1]; nums=sys.argv[2:7]; keys=[a.split(':',1) for a in sys.argv[7:]]
NK=len(keys)
def cut(path, minarea=20000):
    a=np.array(Image.open(path).convert('RGB')).astype(int); mn=a.min(-1)
    m=ndimage.binary_closing(mn<238,iterations=2)
    lab,n=ndimage.label(m); s=ndimage.sum(m,lab,range(1,n+1)); objs=ndimage.find_objects(lab)
    out=[]
    for i,v in enumerate(s):
        if v<minarea: continue
        sl=objs[i]; keep=lab[sl]==i+1
        alpha=np.clip((255-mn[sl])*255/30,0,255); alpha[ndimage.binary_erosion(keep,iterations=2)&(mn[sl]<238)]=255; alpha[~keep]=0
        out.append((sl[1].start,Image.fromarray(np.dstack([a[sl],alpha]).astype(np.uint8),'RGBA')))
    return [o[1] for o in sorted(out,key=lambda o:o[0])]
order=['reynaldo','barbas','sister','usu','jefe']
for n,cid in zip(nums,order):
    if n=='-': continue
    ims=cut(f'{I}/{n}.webp'); print(cid,len(ims),[i.size for i in ims])
    if len(ims)!=NK: continue
    href=max(i.height for i in ims)
    c=json.load(open('src/data/catalog.json')); ch=[x for x in c['characters'] if x['id']==cid][0]
    ref=next(p for p in ch['poses'] if p['key']=='pose_p_cafe_habla')
    for (k,label),im in zip(keys,ims):
        im.save(f'public/assets/punetos/punetos/{cid}/{k}.webp','WEBP',quality=92)
        e={'id':f'char.{cid}.pose_p_{k}','key':f'pose_p_{k}','label':f'Puñeto · {label}','src':f'/assets/punetos/punetos/{cid}/{k}.webp','width':im.width,'height':im.height,'displayScale':round(ref['displayScale']*ref['height']/href,3),'facing':'right','flat':True,'look':'puneto'}
        for f in ['catalog.json','src/data/catalog.json']:
            cc=json.load(open(f)); x=[y for y in cc['characters'] if y['id']==cid][0]
            x['poses']=[p for p in x['poses'] if p['key']!=e['key']]+[e]
            open(f,'w').write(json.dumps(cc,ensure_ascii=False,indent=1))
