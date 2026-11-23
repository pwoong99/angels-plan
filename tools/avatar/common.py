import numpy as np, cv2
from PIL import Image
SKIN_BASE=(254,209,177)
def hsv(a):
    f=a.astype(np.float32)/255
    h=cv2.cvtColor(f,cv2.COLOR_RGB2HSV)  # H 0-360, S,V 0-1
    return h[...,0],h[...,1],h[...,2]
def skin_mask(a):
    H,S,V=hsv(a)
    core=(H>=10)&(H<=34)&(S>=0.12)&(S<=0.48)&(V>=0.82)
    # blush/ear inner shading
    blush=((H>=0)&(H<=12)|(H>=345))&(S>=0.15)&(S<=0.45)&(V>=0.85)
    m=(core|blush).astype(np.uint8)
    # grow into antialiased edge pixels that are warm and not too dark
    g=cv2.dilate(m,np.ones((5,5),np.uint8))
    warm=((H<=40)|(H>=340))&(V>=0.45)&(S>=0.08)
    m2=(m|((g>0)&warm)).astype(bool)
    # require component of core to be reasonably sized (avoid stray tan pixels)
    n,lab,st,_=cv2.connectedComponentsWithStats(m2.astype(np.uint8),8)
    keep=np.zeros(n,bool); keep[1:]=st[1:,4]>60
    return keep[lab]
def bg_mask(a, holes=False, hole_min=1500, white=236):
    """True where background. flood from border over near-white. holes=True also removes enclosed white areas >= hole_min"""
    mn=a.min(2); mx=a.max(2)
    wh=((mn>=white)&((mx-mn)<=14)).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(wh,4)
    H,W=wh.shape
    border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))
    bg=np.zeros(n,bool)
    for i in range(1,n):
        if i in border or (holes and st[i,4]>=hole_min): bg[i]=True
    return bg[lab]
def rgba(a, bg):
    al=np.where(bg,0,255).astype(np.uint8)
    # soften: pixels adjacent to bg that are light -> partial alpha
    near=cv2.dilate(bg.astype(np.uint8),np.ones((3,3),np.uint8))>0
    L=a.mean(2)
    soft=near&~bg
    al2=al.astype(np.float32)
    al2[soft]=np.clip((255-L[soft])/90.0,0,1)*255
    al2[soft]=np.maximum(al2[soft],40)
    out=np.dstack([a,al2.astype(np.uint8)])
    return out
def skin_core(a, hlo=8, hhi=34, slo=0.12, shi=0.48, vlo=0.82):
    H,S,V=hsv(a)
    m=((H>=hlo)&(H<=hhi)&(S>=slo)&(S<=shi)&(V>=vlo)).astype(np.uint8)
    g=cv2.dilate(m,np.ones((5,5),np.uint8))
    warm=((H<=40)|(H>=340))&(V>=0.45)&(S>=0.08)
    return (m|((g>0)&warm)).astype(bool)
def zone_filter(mask, zones, minarea=40):
    """keep components whose centroid lies in any zone (fractions x0,y0,x1,y1)"""
    h,w=mask.shape
    n,lab,st,cen=cv2.connectedComponentsWithStats(mask.astype(np.uint8),8)
    keep=np.zeros(n,bool)
    for i in range(1,n):
        if st[i,4]<minarea: continue
        cx,cy=cen[i][0]/w,cen[i][1]/h
        keep[i]=any(x0<=cx<=x1 and y0<=cy<=y1 for x0,y0,x1,y1 in zones)
    return keep[lab]
def hero_fix(c):
    c=c.copy()
    H,S,V=hsv(c)
    blue=(H>=200)&(H<=240)&(S>=0.35)&(V>=0.35)
    x0,y0,x1,y1=172,84,305,176
    reg=np.zeros(c.shape[:2],bool); reg[y0:y1,x0:x1]=True
    band=np.zeros(c.shape[:2],bool); band[y0:y1,120:340]=True
    base=np.median(c[band&blue&~reg],axis=0).astype(np.uint8)
    dist=np.abs(c.astype(int)-base.astype(int)).sum(2)
    c[reg&((~blue)|(dist>30))]=base
    # recolor blue suit -> teal
    f=c.astype(np.float32)/255; hv=cv2.cvtColor(f,cv2.COLOR_RGB2HSV)
    b2=(hv[...,0]>=200)&(hv[...,0]<=245)&(hv[...,1]>=0.3)
    hv[...,0]=np.where(b2,hv[...,0]-45,hv[...,0])
    c=(cv2.cvtColor(hv,cv2.COLOR_HSV2RGB)*255).clip(0,255).astype(np.uint8)
    im=Image.fromarray(c); from PIL import ImageDraw; d=ImageDraw.Draw(im)
    import math
    cx,cy,R,r=238,128,40,17
    pts=[(cx+(R if k%2==0 else r)*math.sin(k*math.pi/5), cy-(R if k%2==0 else r)*math.cos(k*math.pi/5)) for k in range(10)]
    d.polygon(pts,fill=(255,214,74),outline=(74,44,52),width=5)
    return np.asarray(im)
