import sys, numpy as np, cv2
from PIL import Image, ImageDraw
def comps(path, dil=15, minarea=2000):
    a=np.asarray(Image.open(path).convert('RGB')).astype(int)
    mn=a.min(2); mx=a.max(2)
    ink=((mn<232)|((mx-mn)>22)).astype(np.uint8)
    k=np.ones((dil,dil),np.uint8)
    d=cv2.dilate(ink,k)
    n,lab,st,_=cv2.connectedComponentsWithStats(d,8)
    boxes=[tuple(st[i][:4]) for i in range(1,n) if st[i][4]>minarea]
    boxes.sort(key=lambda b:(b[1]//200,b[0]))
    return boxes
if __name__=='__main__':
    p=sys.argv[1]; dil=int(sys.argv[2]) if len(sys.argv)>2 else 15
    bs=comps(p,dil)
    im=Image.open(p).convert('RGB'); dr=ImageDraw.Draw(im)
    for i,(x,y,w,h) in enumerate(bs):
        dr.rectangle([x,y,x+w,y+h],outline=(255,0,0),width=4); dr.text((x+5,y+5),str(i),fill=(255,0,0))
        print(i,x,y,w,h)
    im.thumbnail((1400,800)); im.save('/home/claude/parts/dbg/'+p.split('/')[-1])
