import sys
from PIL import Image, ImageDraw
p=sys.argv[1]
fr=[Image.open(f'{p}{i}.png') for i in range(1,5)]
W,H=fr[0].size; bg=(240,236,228,255)
g=[];x=-W;k=0
while x<1000:
    b=Image.new('RGBA',(1000,H+20),bg); ImageDraw.Draw(b).rectangle([0,H,1000,H+20],fill=(200,190,175,255))
    b.alpha_composite(fr[k%4],(int(x),0)); g.append(b.convert('RGB').resize((500,(H+20)//2))); k+=1; x+=30
g[0].save(sys.argv[2],save_all=True,append_images=g[1:],duration=150,loop=0)
