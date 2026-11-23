import random, json
random.seed(11)
D4=[(1,0),(-1,0),(0,1),(0,-1)]
def norm(cells):
    mx=min(x for x,y in cells); my=min(y for x,y in cells)
    return frozenset((x-mx,y-my) for x,y in cells)
REFL=[lambda x,y:(-x,y),lambda x,y:(x,-y),lambda x,y:(y,x),lambda x,y:(-y,-x)]
def symmetric(cells):
    n=norm(cells)
    return any(norm([f(x,y) for x,y in n])==n for f in REFL)
def rot(cells,k):
    c=list(cells)
    for _ in range(k%4): c=[(-y,x) for x,y in c]
    return norm(c)
def connected(cells):
    cells=set(cells); 
    if not cells: return False
    st=[next(iter(cells))]; seen={st[0]}
    while st:
        x,y=st.pop()
        for dx,dy in D4:
            q=(x+dx,y+dy)
            if q in cells and q not in seen: seen.add(q); st.append(q)
    return len(seen)==len(cells)
def grow(n, start=(0,0), allowed=lambda c:True):
    s={start}
    while len(s)<n:
        x,y=random.choice(list(s)); dx,dy=random.choice(D4); q=(x+dx,y+dy)
        if allowed(q): s.add(q)
    return s
def sym_shape(total):
    kind=random.choice(['v','v','v','d','h'])
    for _ in range(1000):
        if kind in 'vh':
            odd=random.random()<0.5
            half=total//2 if not odd else None
            # build half on x>=0 side (vertical axis)
            if odd:
                # axis column x=0 included
                h=grow(max(2,(total+2)//2), (0,0), lambda c:c[0]>=0)
                S=h|{(-x,y) for x,y in h}
            else:
                h=grow(max(1,total//2), (0,0), lambda c:c[0]>=0)
                S=h|{(-1-x,y) for x,y in h}
            if kind=='h': S={(y,x) for x,y in S}
        else:
            h=grow(max(2,(total+1)//2),(0,0),lambda c:c[0]>=c[1])
            S=h|{(y,x) for x,y in h}
        S=norm(S)
        if abs(len(S)-total)<=1 and connected(S):
            w=max(x for x,y in S)+1; hh=max(y for x,y in S)+1
            if w<=7 and hh<=7: return S
    return None
def cut(S,k):
    S=list(S)
    for _ in range(400):
        seeds=random.sample(S,k); own={c:i for i,c in enumerate(seeds)}
        frontier=list(seeds)
        while len(own)<len(S):
            c=random.choice(list(own)); x,y=c; dx,dy=random.choice(D4); q=(x+dx,y+dy)
            if q in set(S) and q not in own: own[q]=own[c]
        pieces=[[c for c in S if own[c]==i] for i in range(k)]
        sizes=[len(p) for p in pieces]
        if min(sizes)<2 or max(sizes)-min(sizes)>max(2,len(S)//k): continue
        if not all(connected(p) for p in pieces): continue
        # 조각 하나가 이미 대칭인 직사각형/막대뿐이면 너무 쉬움 → 최대 1개만 허용
        if len(S) >= 11 and sum(symmetric(p) for p in pieces) > 1: continue
        return [(norm(p),(min(x for x,y in p),min(y for x,y in p))) for p in pieces]
    return None
def trivial(pieces):
    # 조각을 원래 방향 그대로 나란히 붙여도 쉽게 되는지는 검사 어려움 → 생략
    return False
LEVELS=[("연습 1",2,(4,6)),("연습 2",2,(6,7)),("1단계",3,(7,8)),("2단계",3,(8,10)),("3단계",3,(10,12)),("4단계",3,(12,14)),("5단계",4,(12,15)),("6단계",4,(15,18))]
WS=(12,9)   # 작업판 칸 수
def scatter(pieces):
    W,H=WS
    for _ in range(2000):
        occ=set(); out=[]
        ok=True
        for p in pieces:
            r=random.randrange(4); q=rot(p,r)
            w=max(x for x,y in q)+1; h=max(y for x,y in q)+1
            placed=False
            for _ in range(200):
                ox=random.randrange(0,W-w+1); oy=random.randrange(0,H-h+1)
                cells={(x+ox,y+oy) for x,y in q}
                halo={(x+dx,y+dy) for x,y in cells for dx in(-1,0,1) for dy in(-1,0,1)}
                if not (halo & occ):
                    occ|=cells; out.append((ox,oy,r)); placed=True; break
            if not placed: ok=False; break
        if ok: return out
    return None
out=[]
for name,k,(lo,hi) in LEVELS:
    puz=[]; seen=set(); tries=0
    while len(puz)<30 and tries<8000:
        tries+=1
        S=sym_shape(random.randint(lo,hi))
        if not S: continue
        cp=cut(S,k)
        if not cp: continue
        ps=[a for a,b in cp]; sol=[list(b) for a,b in cp]
        key=tuple(sorted(tuple(sorted(min((rot(p,r) for r in range(4)), key=lambda z:sorted(z)))) for p in ps))
        if key in seen: continue
        sc=scatter(ps)
        if not sc: continue
        seen.add(key)
        puz.append(dict(p=[" ".join(f"{x}.{y}" for x,y in sorted(p)) for p in ps], s=[list(t) for t in sc], a=sol))
    out.append(dict(name=name,k=k,size=f"{lo}~{hi}칸",tut=name.startswith("연습"),puzzles=puz))
    print(name,len(puz),tries,flush=True)
json.dump(dict(ws=WS,levels=out),open('/home/claude/gen/sym.json','w'),ensure_ascii=False)
