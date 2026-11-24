import sys, json, os, numpy as np, cv2
sys.path.insert(0, '/home/claude/parts/tools')
from common import *
from seg import comps
from PIL import Image, ImageDraw
SRC='/home/claude/parts/src/'
def load(n): return np.asarray(Image.open(SRC+n+'.png').convert('RGB'))
def rowsort(bs, rowh):
    return sorted(bs, key=lambda b:(round((b[1]+b[3]/2)/rowh), b[0]))
def tight(rgba):
    ys,xs=np.where(rgba[...,3]>0)
    return xs.min(),ys.min(),xs.max()+1,ys.max()+1
PARTS={}   # name -> list of layers dicts {img(RGBA full-res), x, y (base coords of top-left), s (scale), kind}
def add(cat, layers): PARTS.setdefault(cat,[]).append(layers)
def L(rgba, x, y, s, kind='plain', ax=0, ay=0):
    """place rgba so that pixel (ax,ay) of rgba lands at base (x,y), scaled by s"""
    x0,y0,x1,y1=tight(rgba); r=rgba[y0:y1,x0:x1]
    return dict(img=r, x=x+(x0-ax)*s, y=y+(y0-ay)*s, s=s, kind=kind)
def split_skin(rgba, mask):
    sk=rgba.copy(); sk[...,3]=np.where(mask,rgba[...,3],0)
    rest=rgba.copy(); rest[...,3]=np.where(mask,0,rgba[...,3])
    return sk, rest
BASE=dict(cx=1376, top=60, blush_y=660, blush_d=395)
TP='/home/claude/parts/tools/tune.json'
TUNE=json.load(open(TP)) if os.path.exists(TP) else {}
def tune(cat,i): return TUNE.get(cat,{}).get(str(i),{})

# ---------- faces ----------
FACE_S=1.08
fa=load('faces'); fb=rowsort(comps(SRC+'faces.png',25),700)
H,S,V=hsv(fa)
blushm=(((H<=12)|(H>=340))&(S>=0.2)&(V>=0.85)).astype(np.uint8)
FACE_ANCH=[]
for i,(x,y,w,h) in enumerate(fb):
    c=fa[y:y+h,x:x+w]; rgba_=rgba(c,bg_mask(c))
    ys,xs=np.where(rgba_[...,3]>0); top=ys.min()
    cx=(xs.min()+xs.max())/2
    n,lab,st,cen=cv2.connectedComponentsWithStats(blushm[y:y+h,x:x+w],8)
    bl=sorted([cen[j] for j in range(1,n) if st[j,4]>3000], key=lambda p:p[0])
    t=tune('face',i); s=FACE_S*t.get('s',1)
    ox=BASE['cx']+t.get('dx',0); oy=BASE['top']+t.get('dy',0)
    add('face',[L(rgba_,ox,oy,s,'skin',cx,top)])
    # anchors in base coords
    bx=[ox+(p[0]-cx)*s for p in bl]; by=np.mean([oy+(p[1]-top)*s for p in bl])
    FACE_ANCH.append(dict(lx=bx[0],rx=bx[1],y=by,d=bx[1]-bx[0],chin=oy+(ys.max()-top)*s))
# ---------- eyes ----------
ea=load('eyes')
COLX=[0,370,690,1020,1340,1680,2000,2330,2752]; ROWY=[0,430,800,1160,1536]
EYE_ITEMS=[]
for r in range(3):
    for k in range(4): EYE_ITEMS.append((r,[(2*k,2*k+1),(2*k+1,2*k+2)]))
EYE_ITEMS+= [(3,[(0,2)]),(3,[(2,4)]),(3,[(4,5),(5,6)]),(3,[(6,7),(7,8)])]
DROP_EYES={11}
EYE_S=0.80
def eye_piece(r,c0,c1):
    x0,x1,y0,y1=COLX[c0],COLX[c1],ROWY[r],ROWY[r+1]
    c=ea[y0:y1,x0:x1]; rg=rgba(c,bg_mask(c))
    Hh,Ss,Vv=hsv(c)
    dark=(Vv<0.42)&(rg[...,3]>0)
    ys,xs=np.where(dark)
    ax,ay=(xs.min()+xs.max())/2,(ys.min()+ys.max())/2
    sk=skin_core(c,slo=0.15)&(rg[...,3]>0)
    sk=zone_filter(sk,[(0,0,1,1)],minarea=800)
    return rg,sk,ax,ay
EYES=[]
for idx,(r,cells) in enumerate(EYE_ITEMS):
    if idx in DROP_EYES: continue
    t=tune('eyes',idx)
    pcs=[]
    for c0,c1 in cells:
        rg,sk,ax,ay=eye_piece(r,c0,c1)
        s=EYE_S*t.get('s',1); ay+=t.get('dy',0)
        ls=[]
        if sk.any():
            a_sk,a_rest=split_skin(rg,sk); ls.append(L(a_sk,0,0,s,'skin',ax,ay)); ls.append(L(a_rest,0,0,s,'plain',ax,ay))
        else: ls.append(L(rg,0,0,s,'plain',ax,ay))
        pcs.append(ls)
    EYES.append(dict(pieces=pcs,single=len(cells)==1))
# ---------- mouths ----------
ma=load('mouths'); mb=rowsort(comps(SRC+'mouths.png',25),450)
MOUTH_S=0.40
MOUTHS=[]
for i,(x,y,w,h) in enumerate(mb):
    c=ma[y:y+h,x:x+w]; rg=rgba(c,bg_mask(c))
    t=tune('mouth',i); s=MOUTH_S*t.get('s',1)
    ys,xs=np.where(rg[...,3]>0)
    MOUTHS.append(L(rg,0,0,s,'plain',(xs.min()+xs.max())/2,ys.min()+t.get('dy',0)))
# ---------- hair ----------
ha=load('hair'); hb=rowsort(comps(SRC+'hair.png',5),380)
HAIR_S=2.02
EAR_HAIRS=set()
MANUAL={4:dict(ears=[(4,178,30,232),(264,178,292,232)],cut=(258,62,240),box=[(212,232,262,330)],wipe=[(200,232,257,330)]),
 8:dict(ears=[(88,178,122,236)],cut=None),
 11:dict(ears=[(8,238,36,292),(294,238,326,292)],cut=None),
 12:dict(ears=[(248,172,286,226)],cut=(250,72,330)),
 14:dict(ears=[(12,168,46,222),(294,168,328,222)],cut=(245,62,270))}
for i,(x,y,w,h) in enumerate(hb):
    pad=6; x0,y0=max(0,x-pad),max(0,y-pad)
    c=ha[y0:y+h+pad,x0:x+w+pad]
    bg=bg_mask(c,holes=True,hole_min=500,white=238)
    rg=rgba(c,bg)
    mn=c.min(2); mx=c.max(2); wh=((mn>=238)&((mx-mn)<=14)).astype(np.uint8)
    n,lab,st,cen=cv2.connectedComponentsWithStats(wh,4)
    border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))
    Wc=c.shape[1]
    holes=[j for j in range(1,n) if j not in border and st[j,4]>300 and 0.25*Wc<cen[j][0]<0.75*Wc]
    holes=holes if any(st[j,4]>8000 for j in holes) else []
    al=rg[...,3]>0
    rows=al.sum(1); mxw=rows.max()
    top=int(np.argmax(rows>=0.5*mxw))
    cols=np.where(al[top:top+int(0.25*al.shape[0])].any(0))[0]
    cx=(cols.min()+cols.max())/2
    # ear-like small enclosed white blobs: erase their outlines
    Hh,Ss,Vv=hsv(c)
    ears=[j for j in range(1,n) if i in EAR_HAIRS and j not in border and j not in holes and 300<st[j,4]<=8000]
    for j in ears:
        em=(lab==j).astype(np.uint8)
        dz=cv2.dilate(em,np.ones((21,21),np.uint8))>0
        rg[...,3]=np.where(dz&((Vv<0.62)|(lab==j)),0,rg[...,3])
    # keep only main components (drop neighbours' stray bits)
    am=(rg[...,3]>0).astype(np.uint8)
    nn,ll,ss,_=cv2.connectedComponentsWithStats(cv2.dilate(am,np.ones((9,9),np.uint8)),8)
    big=ss[1:,4].max()
    keepc=np.zeros(nn,bool); keepc[1:]=ss[1:,4]>=0.08*big
    rg[...,3]=np.where(keepc[ll],rg[...,3],0)
    if i in MANUAL:
        Hh2,Ss2,Vv2=hsv(c)
        gray=((Ss2<0.12)&(Vv2>0.5)&(Vv2<0.93)&(rg[...,3]>0)).astype(np.uint8)
        dist=cv2.distanceTransform(1-gray,cv2.DIST_L2,3)
        for (a0,b0,a1,b1) in MANUAL[i]['ears']:
            box=np.zeros(gray.shape,bool); box[b0:b1,a0:a1]=True
            er=box&((Vv2>=0.93)|(dist>7))
            rg[...,3]=np.where(er,0,rg[...,3])
        holes=[]
    front=rg.copy()
    if i in MANUAL and MANUAL[i]['cut']:
        cy,cx0,cx1=MANUAL[i]['cut']; front[cy:,cx0:cx1,3]=0
        Hq,Sq,Vq=hsv(c)
        for (a0,b0,a1,b1) in MANUAL[i].get('box',[]):
            bx=np.zeros(Vq.shape,bool); bx[b0:b1,a0:a1]=True; front[...,3]=np.where(bx&(Vq<0.45),0,front[...,3])
        for (a0,b0,a1,b1) in MANUAL[i].get('wipe',[]): front[b0:b1,a0:a1,3]=0
    if holes:
        hx=min(st[j,0] for j in holes); hy=min(st[j,1] for j in holes)
        hx1=max(st[j,0]+st[j,2] for j in holes); hy1=max(st[j,1]+st[j,3] for j in holes)
        yy,xx=np.mgrid[0:c.shape[0],0:c.shape[1]]
        cut=(yy>=hy1-14)&(xx>=hx)&(xx<=hx1)
        front[...,3]=np.where(cut,0,front[...,3])
    if False and ears:
        ex0=min(st[j,0] for j in ears)-6; ex1=max(st[j,0]+st[j,2] for j in ears)+6
        if len(ears)==1 and holes:
            ex0=min(ex0,hx-6); ex1=max(ex1,hx1+6)
        ety=min(st[j,1] for j in ears)
        yy,xx=np.mgrid[0:c.shape[0],0:c.shape[1]]
        cut2=(yy>=ety-10)&(xx>=ex0)&(xx<=ex1)
        front[...,3]=np.where(cut2,0,front[...,3])
    t=tune('hair',i); s=HAIR_S*t.get('s',1)
    ox=BASE['cx']+t.get('dx',0); oy=BASE['top']-30+t.get('dy',0)
    add('hair',dict(back=L(rg,ox,oy,s,'hair',cx,top),front=L(front,ox,oy,s,'hair',cx,top),hole=bool(holes)))
# ---------- body ----------
ba=load('body'); bbx=rowsort(comps(SRC+'body.png',25),500)
HANDS=[(0,.45,.22,1),(.78,.45,1,1)]; NECK=[(.35,0,.65,.14)]; LEGS=[(.25,.6,.75,.97)]; ARMS=[(0,.15,.3,1),(.7,.15,1,1)]
EXTRA={1:LEGS+ARMS,9:LEGS+ARMS}
def outfit_layers(c, zones):
    rg=rgba(c,bg_mask(c))
    sk=skin_core(c); sk=zone_filter(sk,zones)&(rg[...,3]>0)
    al=rg[...,3]>0; ys,xs=np.where(al)
    nk=zone_filter(sk,NECK); nys,nxs=np.where(nk)
    if len(nys): ax=(nxs.min()+nxs.max())/2; ay=nys.min()
    else: ax=(xs.min()+xs.max())/2; ay=ys.min()
    hs=zone_filter(sk,HANDS); hys,hxs=np.where(hs)
    span=(hxs.max()-hxs.min()) if len(hxs) else (xs.max()-xs.min())*0.9
    return rg,sk,ax,ay,span
base=load('base')
bbg=bg_mask(base); brg=rgba(base,bbg)
bsk=skin_core(base)&(brg[...,3]>0)
yy=np.mgrid[0:base.shape[0],0:base.shape[1]][0]
body_only=brg.copy(); body_only[...,3]=np.where(yy<800,0,body_only[...,3])
bsk_b=bsk&(yy>=800)
nys,nxs=np.where(bsk&(yy>=800)&(yy<830))
B_NECK=((nxs.min()+nxs.max())/2, 800)
hy,hx=np.where(bsk&(yy>=1000)&(yy<1200))
B_SPAN=hx.max()-hx.min()
print('base neck',B_NECK,'span',B_SPAN)
def body_add(rg,sk,ax,ay,span,t):
    s=B_SPAN/span*t.get('s',1)
    a_sk,a_rest=split_skin(rg,sk)
    ox=B_NECK[0]+t.get('dx',0); oy=B_NECK[1]+t.get('dy',0)
    add('body',[L(a_sk,ox,oy,s,'skin',ax,ay),L(a_rest,ox,oy,s,'plain',ax,ay)])
body_add(body_only,bsk_b,B_NECK[0],B_NECK[1],B_SPAN,{})
for i,(x,y,w,h) in enumerate(bbx):
    c=ba[y:y+h,x:x+w].copy()
    if i==11: c=hero_fix(c)
    rg,sk,ax,ay,span=outfit_layers(c,HANDS+NECK+EXTRA.get(i,[]))
    body_add(rg,sk,ax,ay,span,tune('body',i+1))
# ---------- wings ---------- (10단계 그림 한 장: 1~5 첫 줄, 6~8 둘째 줄, 황금·전설 셋째 줄)
wa=load('wings10')
WBOX=[(196,199,305,156),(649,178,393,203),(1119,166,503,220),(1663,151,432,305),(2138,119,522,287),
      (88,528,649,385),(1005,528,737,386),(1949,519,716,389),(983,1010,783,385),(1823,956,851,454)]
WINGS=[]
for (x,y,w,h) in WBOX:
    P=24; x0,y0=max(0,x-P),max(0,y-P)
    c=wa[y0:y+h+P,x0:x+w+P]; rg=rgba(c,bg_mask(c,white=240))
    al=rg[...,3]>0; cols=al.sum(0); W_=c.shape[1]
    win=cols[int(W_*0.35):int(W_*0.65)]; g=int(W_*0.35)+int(np.argmin(win))
    Lh=rg.copy(); Lh[:,g:,3]=0; Rh=rg.copy(); Rh[:,:g,3]=0
    WINGS.append((Lh,Rh))

# ---------- export ----------
U=0.093; PXU=2.6
OUT='/home/claude/parts/out/'; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(OUT+f)
VX=lambda x:(x-BASE['cx'])*U+60; VY=lambda y:(y-BASE['top'])*U+16
def save(rgba_, name, s, maxpx=None):
    h,w=rgba_.shape[:2]; W=w*s*U; Hh=h*s*U
    pw=max(2,int(round(W*PXU))); ph=max(2,int(round(Hh*PXU)))
    im=Image.fromarray(rgba_,'RGBA')
    # premultiply-safe resize
    im=im.resize((pw,ph),Image.LANCZOS)
    im.save(OUT+name+'.png',optimize=True)
    return round(W,2),round(Hh,2)
def absl(l,name):
    w,h=save(l['img'],name,l['s']); return dict(f=name,x=round(VX(l['x']),2),y=round(VY(l['y']),2),w=w,h=h,k=l['kind'][0])
def rell(l,name):
    w,h=save(l['img'],name,l['s']); return dict(f=name,x=round(l['x']*U,2),y=round(l['y']*U,2),w=w,h=h,k=l['kind'][0])
M=dict(face=[],eyes=[],mouth=[],hair=[],body=[],wings=[])
for i,ls in enumerate(PARTS['face']):
    a=FACE_ANCH[i]; d=a['d']; k=d/BASE['blush_d']
    ex=0.14*d; ey=a['y']-0.31*d
    M['face'].append(dict(img=absl(ls[0],'f%d'%i),
        el=[round(VX(a['lx']+ex),2),round(VY(ey),2)], er=[round(VX(a['rx']-ex),2),round(VY(ey),2)],
        m=[round(VX((a['lx']+a['rx'])/2),2),round(VY(a['y']+0.02*d),2)], k=round(k,3)))
for i,e in enumerate(EYES):
    M['eyes'].append(dict(single=e['single'],p=[[rell(l,'e%d%s%d'%(i,'lr'[j],q)) for q,l in enumerate(ls)] for j,ls in enumerate(e['pieces'])]))
for i,l in enumerate(MOUTHS): M['mouth'].append(rell(l,'m%d'%i))
for i,hh in enumerate(PARTS['hair']):
    M['hair'].append(dict(b=absl(hh['back'],'hb%d'%i),f=absl(hh['front'],'hf%d'%i)))
for i,ls in enumerate(PARTS['body']):
    M['body'].append([absl(l,'b%d%s'%(i,'sp'[q])) for q,l in enumerate(ls)])
# wings export
WL=[(0,150,210,950),(1,200,200,960),(2,250,185,975),(3,250,170,1010),(4,300,150,1010),(5,400,125,1050),(6,450,115,1060),(7,500,105,1065),(8,560,95,1070),(9,650,85,1085)]
def rainbow(rg):
    r=rg.copy().astype(np.float32); h,w=r.shape[:2]
    hue=np.tile(np.linspace(0,300,w,dtype=np.float32),(h,1))
    hsvi=np.dstack([hue,np.full((h,w),0.32,np.float32),np.ones((h,w),np.float32)])
    col=cv2.cvtColor(hsvi,cv2.COLOR_HSV2RGB)
    V=r[...,:3].max(2)/255
    light=(V>0.6)[...,None]
    r[...,:3]=np.where(light,r[...,:3]*col,r[...,:3])
    return r.clip(0,255).astype(np.uint8)
def starlight(rg):
    r=rg.copy().astype(np.float32)
    V=r[...,:3].max(2)/255
    light=(V>0.6)[...,None]
    tint=np.array([200,205,255],np.float32)/255
    r[...,:3]=np.where(light,r[...,:3]*tint,r[...,:3])
    return r.clip(0,255).astype(np.uint8)
for lv,(k,tw,G,WB) in enumerate(WL):
    Lh,Rh=WINGS[k]
    row=[]
    for side,hh in (('l',Lh),('r',Rh)):
        x0,y0,x1,y1=tight(hh); r=hh[y0:y1,x0:x1]
        s=tw/r.shape[1]
        if side=='l': bx=BASE['cx']-G-tw
        else: bx=BASE['cx']+G
        by=WB-r.shape[0]*s*0.78
        w,h=save(r,'w%d%s'%(lv,side),s)
        row.append(dict(f='w%d%s'%(lv,side),x=round(VX(bx),2),y=round(VY(by),2),w=w,h=h,k='p'))
    M['wings'].append(row)
json.dump(M,open(OUT+'manifest.json','w'))
