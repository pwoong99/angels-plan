import json, os
from PIL import Image
OUT='/home/claude/parts/out/'
M=json.load(open(OUT+'manifest.json'))
items=[]
def walk(o):
    if isinstance(o,dict):
        if isinstance(o.get('f'),str): items.append(o)
        else: [walk(v) for v in o.values()]
    elif isinstance(o,list): [walk(v) for v in o]
walk(M)
names=sorted({it['f'] for it in items}, key=lambda n:-Image.open(OUT+n+'.png').height)
W=2048; x=y=rowh=0; pos={}
for n in names:
    im=Image.open(OUT+n+'.png')
    if x+im.width+2>W: x=0; y+=rowh+2; rowh=0
    pos[n]=(x,y,im.width,im.height); x+=im.width+2; rowh=max(rowh,im.height)
H=y+rowh
at=Image.new('RGBA',(W,H),(0,0,0,0))
for n,(a,b,w,h) in pos.items(): at.paste(Image.open(OUT+n+'.png').convert('RGBA'),(a,b))
at.save(OUT+'atlas.webp','WEBP',quality=76,method=6,alpha_quality=80)
at.save('/home/claude/parts/dbg/atlas.png')
for it in items: it['a']=list(pos[it['f']])
json.dump(dict(W=W,H=H,M=M),open(OUT+'atlas.json','w'))
print(W,H,os.path.getsize(OUT+'atlas.webp')//1024,'KB', len(names),'parts')
