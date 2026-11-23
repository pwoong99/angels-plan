import json, sys, numpy as np
from PIL import Image
OUT='/home/claude/parts/out/'
M=json.load(open(OUT+'manifest.json'))
SKIN=["#ffe8d8","#fed1b1","#f2bd96","#e0a47a","#c78a5c","#a66d44","#85522f","#62391f"]
HAIR=["#3a2a22","#5c3a24","#8a5a36","#b0703e","#e9c46a","#f3e3bd","#e2683c","#ff8fb4","#9a7ae0","#5b8def","#4fbf9f","#b9bdc9"]
def hx(c): return np.array([int(c[i:i+2],16) for i in (1,3,5)],np.float32)
SK0=np.array([254,209,177],np.float32); HR0=np.array([212,212,212],np.float32)
P=5.0
def paste(canvas, it, ox=0, oy=0, sc=1.0, tint=None):
    im=Image.open(OUT+it['f']+'.png').convert('RGBA')
    w=max(1,int(round(it['w']*sc*P))); h=max(1,int(round(it['h']*sc*P)))
    im=im.resize((w,h),Image.LANCZOS)
    if tint is not None:
        a=np.asarray(im).astype(np.float32); a[...,:3]=np.clip(a[...,:3]*tint,0,255); im=Image.fromarray(a.astype(np.uint8),'RGBA')
    x=int(round((ox+it['x']*sc)*P)); y=int(round((oy+it['y']*sc)*P))
    canvas.alpha_composite(im,(x+int(40*P),y+int(20*P)))
def render(av, lv=0):
    W,H=int(200*P),int(190*P)
    cv=Image.new('RGBA',(W,H),(255,255,255,255))
    st=hx(SKIN[av['skin']])/SK0; ht=hx(HAIR[av['hairColor']])/HR0
    def T(it): return st if it['k']=='s' else (ht if it['k']=='h' else None)
    for it in M['wings'][lv]: paste(cv,it)
    hr=M['hair'][av['hair']]; paste(cv,hr['b'],tint=ht)
    for it in M['body'][av['body']]: paste(cv,it,tint=T(it))
    f=M['face'][av['face']]; paste(cv,f['img'],tint=st)
    e=M['eyes'][av['eyes']]; k=f['k']
    if e['single']:
        cx=(f['el'][0]+f['er'][0])/2; cy=(f['el'][1]+f['er'][1])/2
        for it in e['p'][0]: paste(cv,it,cx,cy,k,T(it))
    else:
        for j,pos in enumerate((f['el'],f['er'])):
            for it in e['p'][j]: paste(cv,it,pos[0],pos[1],k,T(it))
    paste(cv,M['mouth'][av['mouth']],f['m'][0],f['m'][1],k)
    paste(cv,hr['f'],tint=ht)
    return cv.convert('RGB').crop((int(25*P),int(5*P),int(175*P),int(175*P)))
def grid(avs, cols, path, lv=0, thumb=330):
    rows=(len(avs)+cols-1)//cols
    sheet=Image.new('RGB',(cols*thumb,rows*thumb),'white')
    for i,a in enumerate(avs):
        im=render(a, a.get('lv',lv)); im.thumbnail((thumb,thumb)); sheet.paste(im,((i%cols)*thumb,(i//cols)*thumb))
    sheet.save(path)
if __name__=='__main__':
    base=dict(face=0,skin=1,eyes=0,mouth=0,hair=1,hairColor=1,body=0)
    what=sys.argv[1]; n=len(M[what]) if what in M else 8
    key={'skin':'skin','hairColor':'hairColor'}.get(what,what)
    avs=[]
    for i in range(n if what not in('skin','hairColor','wings') else {'skin':8,'hairColor':12,'wings':8}[what]):
        a=dict(base); 
        if what=='wings': a['lv']=i
        else: a[key]=i
        avs.append(a)
    grid(avs,6,'/home/claude/parts/dbg/pv_'+what+'.png')
