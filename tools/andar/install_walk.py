import json, sys, numpy as np
from PIL import Image
cid, srcp = sys.argv[1], sys.argv[2]
KEY=sys.argv[3] if len(sys.argv)>3 else 'anda'
NAME=sys.argv[4] if len(sys.argv)>4 else 'andar'
hs=[]
for i in range(1,5):
    im=Image.open(f'{srcp}{i}.png'); a=np.array(im)[...,3]>128; ys,_=np.nonzero(a); hs.append(ys.max()-ys.min())
    im.save(f'public/assets/punetos/punetos/{cid}/{KEY}{i}.webp','WEBP',quality=92,method=6)
W,H=im.size
for f in ['catalog.json','src/data/catalog.json']:
    c=json.load(open(f))
    ch=[x for x in c['characters'] if x['id']==cid][0]
    cam=next(p for k in ('pose_p_camina','pose_p_neutro') for p in ch['poses'] if p['key']==k)
    camimg=np.array(Image.open('public'+cam['src']))[...,3]>128; ys,_=np.nonzero(camimg); camh=ys.max()-ys.min()
    ds=round(cam['displayScale']*camh/max(hs),3)
    ch['poses']=[p for p in ch['poses'] if not __import__('re').fullmatch(rf'pose_p_{KEY}\d',p['key'])]
    idx=max([i for i,p in enumerate(ch['poses']) if p['key'].startswith('pose_p_camina') or p['key'].startswith('pose_p_anda') or p['key']=='pose_p_neutro'])+1
    for i in range(4,0,-1):
        ch['poses'].insert(idx,{'id':f'char.{cid}.pose_p_{KEY}{i}','key':f'pose_p_{KEY}{i}','label':f'Puñeto · {NAME} (paso {i} de 4)','src':f'/assets/punetos/punetos/{cid}/{KEY}{i}.webp','width':W,'height':H,'displayScale':ds,'facing':'right','flat':True,'look':'puneto'})
    open(f,'w').write(json.dumps(c,ensure_ascii=False,indent=1))
an=json.load(open('src/data/animations.json'))
an[cid]=[a for a in an.get(cid,[]) if a['nombre']!=NAME]+[{'nombre':NAME,'bucle':True,'frames':[{'pose':f'{KEY}{i}','dur':0.15} for i in range(1,5)]}]
open('src/data/animations.json','w').write(json.dumps(an,ensure_ascii=False,indent=2))
print(cid,'ds',ds,'camh',camh,'h',max(hs))
