# 원본과 바꾼 그림을 픽셀 비교해 다른 곳 후보를 찾음 → auto_boxes.json. 결과를 보고 build.py의 FIX(합치기·더하기)를 고침
import sys, json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage
src=sys.argv[4] if len(sys.argv)>4 else 'src'; dst='check_auto'   # 사용: python3 diff.py 60 10 300 [PNG폴더]
TH=int(sys.argv[1]); DIL=int(sys.argv[2]); MINC=int(sys.argv[3])
os.makedirs(dst,exist_ok=True)
def load(n): return np.asarray(Image.open(f'{src}/{n}.png').convert('RGB').filter(ImageFilter.GaussianBlur(2))).astype(np.int16)
out={}
for s in sorted(int(f[3:-13]) for f in os.listdir(src) if f.endswith('_original.png')):
    o=load(f'set{s}_original')
    for lv in ['easy','normal','hard']:
        b=load(f'set{s}_{lv}')
        d=np.abs(o-b).sum(axis=2)
        m=ndimage.binary_opening(d>TH,iterations=3)
        big=ndimage.binary_dilation(m,iterations=DIL)
        lab,n=ndimage.label(big)
        boxes=[]
        for i,sl in enumerate(ndimage.find_objects(lab)):
            cnt=int((m[sl]&(lab[sl]==i+1)).sum())
            if cnt<MINC: continue
            y,x=sl
            if x.start>2180 and y.start>1580: continue
            boxes.append([x.start,y.start,x.stop,y.stop,cnt])
        out[f'{s}_{lv}']=boxes
        im=Image.open(f'{src}/set{s}_{lv}.png').convert('RGB')
        dr=ImageDraw.Draw(im)
        f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',60)
        for k,bx in enumerate(boxes):
            dr.rectangle(bx[:4],outline=(255,0,0),width=8); dr.text((bx[0]+5,bx[1]+5),str(k),fill=(255,0,0),font=f)
        im.resize((1200,896)).save(f'{dst}/s{s}_{lv}.jpg',quality=80)
        print(s,lv,len(boxes),[(k,b[4]) for k,b in enumerate(boxes)])
json.dump(out,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'auto_boxes.json'),'w'))
