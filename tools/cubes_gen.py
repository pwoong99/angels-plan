import random, json, numpy as np
from PIL import Image, ImageDraw
SX, SY, SZ = 0.9, 0.5, 0.85
def P(c, r, z, S=40, ox=0, oy=0): return ((c - r) * SX * S + ox, (c + r) * SY * S - z * SZ * S + oy)
def faces(c, r, z):
    top = [(c, r, z+1), (c+1, r, z+1), (c+1, r+1, z+1), (c, r+1, z+1)]
    left = [(c, r+1, z), (c+1, r+1, z), (c+1, r+1, z+1), (c, r+1, z+1)]   # r+1 face
    right = [(c+1, r, z), (c+1, r+1, z), (c+1, r+1, z+1), (c+1, r, z+1)]  # c+1 face
    return top, left, right
def visible_ok(H, w, h, thr=0.45):
    S = 40; W = int((w + h) * SX * S + 2 * S); Hh = int((w + h) * SY * S + 8 * SZ * S + 2 * S)
    ox = h * SX * S + S; oy = 7 * SZ * S + S
    lab = Image.new('I', (W, Hh), 0); full = {}
    d = ImageDraw.Draw(lab)
    cubes = [(c, r, z) for r in range(h) for c in range(w) for z in range(H[r][c])]
    cubes.sort(key=lambda t: (t[0] + t[1], t[2]))
    tid = {}
    for (c, r, z) in cubes:
        t, l, rt = faces(c, r, z)
        key = (r * w + c + 1) if z == H[r][c] - 1 else 0
        for f, k in ((l, 0), (rt, 0), (t, key)):
            d.polygon([P(*p, S, ox, oy) for p in f], fill=k)
        if key:
            im = Image.new('1', (W, Hh), 0); ImageDraw.Draw(im).polygon([P(*p, S, ox, oy) for p in t], fill=1)
            full[key] = np.asarray(im).sum()
    a = np.asarray(lab)
    for k, n in full.items():
        if (a == k).sum() < thr * n: return False
    return True
LEVELS = [
  ("연습 1", 2, 2, 2, True), ("연습 2", 3, 3, 2, True), ("1단계", 3, 3, 3, False), ("2단계", 4, 3, 3, False),
  ("3단계", 4, 4, 3, False), ("4단계", 4, 4, 4, False), ("5단계", 5, 4, 4, False), ("6단계", 5, 5, 4, False),
  ("7단계", 5, 5, 5, False), ("8단계", 6, 5, 5, False)]
random.seed(7)
out = []
for name, w, h, mx, tut in LEVELS:
    seen = set(); puz = []
    tries = 0
    while len(puz) < 40 and tries < 200000:
        tries += 1
        H = []
        for r in range(h):
            row = []
            for c in range(w):
                # 뒤쪽(작은 r,c)이 높고 앞쪽이 낮은 계단 모양 경향 + 무작위
                bias = (1 - (r + c) / max(1, (w + h - 2))) * mx
                v = round(random.uniform(0, mx) * 0.55 + bias * 0.55 + random.uniform(-0.8, 0.8))
                if random.random() < 0.15: v = 0
                row.append(max(0, min(mx, v)))
            H.append(row)
        s = sum(map(sum, H))
        if s < (w * h) * 0.6 or max(map(max, H)) < mx: continue
        key = "".join(str(v) for row in H for v in row)
        if key in seen: continue
        if not visible_ok(H, w, h): continue
        # 숨은 큐브가 있어야 재미: 보이는 면만 세면 틀리는 문제
        seen.add(key); puz.append(key)
    out.append(dict(name=name, w=w, h=h, max=mx, tut=tut, puzzles=puz))
    print(name, len(puz), tries, [sum(map(int, p)) for p in puz[:6]])
open('/home/claude/gen/cubes.json', 'w').write(json.dumps(out, ensure_ascii=False))
