# 큐브 세기 문제 다시 고르기: 한 단계 안에서 같은 답(큐브 개수)이 너무 자주 나오지 않게
# 기존 문제는 되도록 그대로 두고, 같은 답이 CAP개를 넘는 문제만 새 문제로 바꿈 (사용: python3 tools/cubes_rebalance.py)
import json, random, re, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
src = pathlib.Path(__file__).resolve().parent.parent / "cubes.js"
text = src.read_text(encoding="utf-8")
lines = text.split("\n")
i = next(k for k, l in enumerate(lines) if l.startswith("export const CUBES = "))
data = json.loads(lines[i][len("export const CUBES = "):].rstrip(";"))
exec(open(pathlib.Path(__file__).parent / "cubes_gen.py", encoding="utf-8").read().split("LEVELS = [")[0])   # visible_ok 등 그림 검사 함수만
random.seed(2026)
def new_shape(w, h, mx):
    H = []
    for r in range(h):
        row = []
        for c in range(w):
            bias = (1 - (r + c) / max(1, (w + h - 2))) * mx
            v = round(random.uniform(0, mx) * 0.55 + bias * 0.55 + random.uniform(-0.8, 0.8))
            if random.random() < 0.15: v = 0
            row.append(max(0, min(mx, v)))
        H.append(row)
    return H
for L in data:
    if L.get("tut"): continue
    w, h, mx, N = L["w"], L["h"], L["max"], len(L["puzzles"])
    cap = 4 if w * h <= 12 else 3
    cnt, keep = {}, []
    for k in L["puzzles"]:
        s = sum(map(int, k))
        if cnt.get(s, 0) < cap: cnt[s] = cnt.get(s, 0) + 1; keep.append(k)
    seen = set(L["puzzles"]); tries = 0; added = 0
    while len(keep) < N and tries < 400000:
        tries += 1
        H = new_shape(w, h, mx)
        s = sum(map(sum, H))
        if s < (w * h) * 0.6 or max(map(max, H)) < mx or cnt.get(s, 0) >= cap: continue
        key = "".join(str(v) for row in H for v in row)
        if key in seen or not visible_ok(H, w, h): continue
        seen.add(key); keep.append(key); cnt[s] = cnt.get(s, 0) + 1; added += 1
    L["puzzles"] = keep
    print(L["name"], "바꾼 문제", added, "가장 많은 답", max(cnt.values()), "개 · 답 종류", len(cnt))
lines[i] = "export const CUBES = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"
src.write_text("\n".join(lines), encoding="utf-8")
