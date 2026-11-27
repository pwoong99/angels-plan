# 학생 혼자 연습 전용 문제 만들기 → practice.js
# 게임 문제와 겹치지 않는 새 문제만 만듦(연습에서 본 문제가 게임에 나오지 않게)
# 연습 범위: 울타리치기·대칭 퍼즐·큐브 세기 모두 연습 1·2와 1·2단계, 단계마다 게임 문제 수의 2배
# 사용: python3 tools/practice_gen.py
import json, random, itertools, pathlib, re
import numpy as np
here = pathlib.Path(__file__).parent; root = here.parent
def load_js(name, var):
    t = (root / name).read_text(encoding="utf-8")
    m = re.search(r"export const " + var + r" = (.*?);\n", t, re.S)
    return json.loads(m.group(1))
random.seed(1127)

# ---------- 울타리치기: 작은 판은 가능한 모든 닫힌 울타리를 다 구해서, 단서로 정답이 하나뿐인지 확인 ----------
def loops(w, h):
    n = w * h; out = []
    for mask in range(1, 1 << n):
        cells = {i for i in range(n) if mask >> i & 1}
        def conn(S, extra_out=False):
            # extra_out: 바깥(판 밖)과 이어진 빈칸 전체가 하나로 이어져야 함(구멍 없음)
            S = set(S)
            if not S: return True
            st = [next(iter(S))]; seen = {st[0]}
            while st:
                i = st.pop(); r, c = divmod(i, w)
                for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < h and 0 <= cc < w:
                        j = rr * w + cc
                        if j in S and j not in seen: seen.add(j); st.append(j)
            return len(seen) == len(S)
        if not conn(cells): continue
        # 구멍 없음: 빈칸마다 판 밖으로 빈칸만 따라 나갈 수 있어야 함
        empty = set(range(n)) - cells
        border = {i for i in empty if i // w in (0, h - 1) or i % w in (0, w - 1)}
        st = list(border); seen = set(border)
        while st:
            i = st.pop(); r, c = divmod(i, w)
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                rr, cc = r + dr, c + dc
                if 0 <= rr < h and 0 <= cc < w:
                    j = rr * w + cc
                    if j in empty and j not in seen: seen.add(j); st.append(j)
        if len(seen) != len(empty): continue
        # 꼭짓점에서 대각선으로만 붙은 곳이 있으면 울타리가 한 줄이 아님 → 제외
        bad = False
        for r in range(h + 1):
            for c in range(w + 1):
                q = [(r-1, c-1), (r-1, c), (r, c-1), (r, c)]
                v = [0 <= a < h and 0 <= b < w and a * w + b in cells for a, b in q]
                if v == [True, False, False, True] or v == [False, True, True, False]: bad = True
        if bad: continue
        out.append(cells)
    return out
def edges_of(cells, w, h):
    HE = (h + 1) * w; E = set()
    inside = lambda r, c: 0 <= r < h and 0 <= c < w and r * w + c in cells
    for r in range(h + 1):
        for c in range(w):
            if inside(r - 1, c) != inside(r, c): E.add(r * w + c)
    for r in range(h):
        for c in range(w + 1):
            if inside(r, c - 1) != inside(r, c): E.add(HE + r * (w + 1) + c)
    return E
def clues_of(E, w, h):
    HE = (h + 1) * w
    return [sum(e in E for e in (r * w + c, (r + 1) * w + c, HE + r * (w + 1) + c, HE + r * (w + 1) + c + 1)) for r in range(h) for c in range(w)]
def ans_hex(E, w, h):
    n = (h + 1) * w + h * (w + 1)
    return format(int("1" + "".join("1" if i in E else "0" for i in range(n)), 2), "x")
def fence_level(L, game, count):
    w, h = L["w"], L["h"]
    allL = [edges_of(s, w, h) for s in loops(w, h)]
    CL = np.array([clues_of(E, w, h) for E in allL])
    nclue = [sum(ch != "." for ch in p["c"]) for p in game]
    lo, hi = min(nclue), max(nclue)
    used = {p["c"] for p in game}; usedA = {}
    for p in game: usedA[p["a"]] = usedA.get(p["a"], 0) + 1
    out = []; tries = 0
    while len(out) < count and tries < 20000:
        tries += 1
        k = random.randrange(len(allL)); full = CL[k]
        # 숫자를 하나씩 지우며 정답이 하나뿐인지 확인, 목표 개수(게임 문제와 같은 범위)가 되면 멈춤
        target = random.randint(lo, hi)
        show = list(range(w * h)); random.shuffle(show)
        keep = set(range(w * h))
        def unique(ks):
            idx = sorted(ks)
            return int((CL[:, idx] == full[idx]).all(axis=1).sum()) == 1
        if not unique(keep): continue
        for i in show:
            if len(keep) <= target: break
            if unique(keep - {i}): keep.discard(i)
        if not (lo <= len(keep) <= hi): continue
        c = "".join(str(full[i]) if i in keep else "." for i in range(w * h))
        a = ans_hex(allL[k], w, h)
        if c in used: continue
        if sum(1 for p in out if p["a"] == a) + usedA.get(a, 0) >= 3: continue   # 같은 모양 울타리는 몇 번까지만
        used.add(c); out.append({"c": c, "a": a})
    return out

# ---------- 대칭 퍼즐 ----------
src = (here / "sym_gen.py").read_text(encoding="utf-8")
g = {}
exec(src.split("out=[]\nfor name,k,(lo,hi),extra in LEVELS:")[0].replace("random.seed(11)", ""), g)
def sym_key(ps):
    rot = g["rot"]
    return tuple(sorted(tuple(sorted(min((rot(p, r) for r in range(4)), key=lambda z: sorted(z)))) for p in ps))
def sym_level(idx, game, count):
    name, k, (lo, hi), extra = g["LEVELS"][idx]
    seen = {sym_key([frozenset(tuple(map(int, t.split("."))) for t in p.split(" ")) for p in pz["p"]]) for pz in game}
    puz = []; tries = 0
    while len(puz) < count and tries < 300000:
        tries += 1
        S = g["sym_shape"](random.randint(lo, hi))
        if not S or not (lo <= len(S) <= hi): continue
        if g["perim"](S) < g["minper"](len(S)) + extra: continue
        cp = g["cut"](S, k)
        if not cp: continue
        ps = [a for a, b in cp]; sol = [list(b) for a, b in cp]
        key = sym_key(ps)
        if key in seen: continue
        sc = g["scatter"](ps)
        if not sc: continue
        seen.add(key)
        puz.append(dict(p=[" ".join(f"{x}.{y}" for x, y in sorted(p)) for p in ps], s=[list(t) for t in sc], a=sol))
    return puz

# ---------- 큐브 세기 ----------
cg = {}
exec((here / "cubes_gen.py").read_text(encoding="utf-8").split("LEVELS = [")[0], cg)
def cube_level(L, game, count):
    w, h, mx = L["w"], L["h"], L["max"]
    seen = set(game); out = []
    # 작은 판은 가능한 모양을 모두 훑고, 큰 판은 무작위로
    if (mx + 1) ** (w * h) <= 300000:
        cands = [list(t) for t in itertools.product(range(mx + 1), repeat=w * h)]
        random.shuffle(cands)
    else:
        cands = ([random.randint(0, mx) for _ in range(w * h)] for _ in range(400000))
    for v in cands:
        if len(out) >= count: break
        if max(v) < mx or sum(v) < w * h * 0.6: continue
        key = "".join(map(str, v))
        if key in seen: continue
        H = [v[r * w:(r + 1) * w] for r in range(h)]
        if not cg["visible_ok"](H, w, h): continue
        seen.add(key); out.append(key)
    return out

PUZ = load_js("puzzles.js", "PUZZLES"); SYMD = load_js("sym.js", "SYM"); CUB = load_js("cubes.js", "CUBES")
res = {"fence": [], "sym": [], "cube": []}
for i in range(4):
    L = PUZ[i]; p = fence_level(L, L["puzzles"], 2 * len(L["puzzles"]))
    res["fence"].append({k: v for k, v in L.items() if k != "puzzles"} | {"puzzles": p}); print("울타리", L["name"], len(p))
for i in range(4):
    L = SYMD["levels"][i]; p = sym_level(i, L["puzzles"], 2 * len(L["puzzles"]))
    res["sym"].append({k: v for k, v in L.items() if k != "puzzles"} | {"puzzles": p}); print("대칭", L["name"], len(p))
for i in range(4):
    L = CUB[i]; p = cube_level(L, L["puzzles"], 2 * len(L["puzzles"]))
    res["cube"].append({k: v for k, v in L.items() if k != "puzzles"} | {"puzzles": p}); print("큐브", L["name"], len(p))
(root / "practice.js").write_text(
    "// 학생 혼자 연습 전용 문제 — 게임 문제와 겹치지 않음 (tools/practice_gen.py로 만듦)\n"
    "// 울타리치기·대칭 퍼즐·큐브 세기 모두 연습 1·2와 1·2단계만, 단계마다 게임 문제 수의 2배\n"
    "export const PRACTICE = " + json.dumps(res, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
