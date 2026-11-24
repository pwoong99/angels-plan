# 큐브 세기 문제를 답(큐브 개수)이 최대한 겹치지 않게 다시 고름
# 단계마다 후보를 많이 만든 뒤, 답마다 하나씩 돌아가며 뽑음 → 가능한 답이 40가지보다 적으면 겹침이 고르게 퍼짐
# (사용: python3 tools/cubes_spread.py) — 연습 1·2는 판이 작아 그대로 둠
import json, random, pathlib, sys
here = pathlib.Path(__file__).parent
src = here.parent / "cubes.js"
lines = src.read_text(encoding="utf-8").split("\n")
i = next(k for k, l in enumerate(lines) if l.startswith("export const CUBES = "))
data = json.loads(lines[i][len("export const CUBES = "):].rstrip(";"))
exec(open(here / "cubes_gen.py", encoding="utf-8").read().split("LEVELS = [")[0])   # visible_ok(그림에서 모든 기둥 윗면이 보이는지)
random.seed(1124)
def shape(w, h, mx):
    dens = random.uniform(0.3, 1.0)          # 단계마다 낮은 모양 ~ 높은 모양을 고루
    H = []
    for r in range(h):
        row = []
        for c in range(w):
            bias = (1 - (r + c) / max(1, (w + h - 2))) * mx
            v = round(random.uniform(0, mx) * 0.55 * dens + bias * (0.35 + 0.4 * dens) + random.uniform(-0.8, 0.8))
            if random.random() < 0.15: v = 0
            row.append(max(0, min(mx, v)))
        H.append(row)
    return H
for L in data:
    if L.get("tut"): continue
    w, h, mx, N = L["w"], L["h"], L["max"], len(L["puzzles"])
    buckets, seen = {}, set()
    for k in L["puzzles"]:
        buckets.setdefault(sum(map(int, k)), []).append(k); seen.add(k)
    for _ in range(60000):
        H = shape(w, h, mx)
        s = sum(map(sum, H))
        if s < (w * h) * 0.5 or max(map(max, H)) < mx: continue
        key = "".join(str(v) for row in H for v in row)
        if key in seen or len(buckets.get(s, [])) >= 4: continue
        if not visible_ok(H, w, h): continue
        seen.add(key); buckets.setdefault(s, []).append(key)
    # 답마다 하나씩 돌아가며 뽑기(가운데 답부터 → 너무 쉽거나 너무 어려운 끝 답은 나중)
    sums = sorted(buckets); mid = sums[len(sums) // 2]
    order = sorted(sums, key=lambda s: abs(s - mid))
    pick, rnd = [], 0
    while len(pick) < N:
        for s in order:
            if len(pick) < N and rnd < len(buckets[s]): pick.append(buckets[s][rnd])
        rnd += 1
    random.shuffle(pick)
    L["puzzles"] = pick
    cnt = {}
    for k in pick: cnt[sum(map(int, k))] = cnt.get(sum(map(int, k)), 0) + 1
    print(L["name"], f"답 {min(cnt)}~{max(cnt)}", "답 종류", len(cnt), "· 같은 답 최대", max(cnt.values()), "개")
lines[i] = "export const CUBES = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"
src.write_text("\n".join(lines), encoding="utf-8")
