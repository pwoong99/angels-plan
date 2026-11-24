# 달라진 그림 찾기: 자동 비교 결과(boxes3.json)에 사람이 고친 내용(합치기·더하기)을 반영해 spot 데이터와 webp 그림을 만든다
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else 'src'   # 제미나이 원본 PNG 폴더(setN_original/easy/normal/hard.png)
OUT = os.path.join(HERE, '..', '..', 'img', 'spot')
CHK = os.path.join(HERE, 'check')   # 확인용(다른 곳에 빨간 네모)
from PIL import Image, ImageDraw
B = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'auto_boxes.json')))
FIX = {
 '1_normal': {'merge': [[3,4]], 'add': [[1424,720,1700,1080]]},
 '1_hard':   {'merge': [[6,8]], 'add': [[240,870,690,1080]]},
 '2_easy':   {'merge': [[0,1,2]]},
 '2_normal': {'merge': [[1,2,3]]},
 '3_normal': {'merge': [[6,7],[8,9]]},
 '4_hard':   {'merge': [[0,1],[3,4],[9,10]]},
 '5_easy':   {'merge': [[1,2,5,7],[6,8]]},
 '5_normal': {'merge': [[0,2],[5,6]]},
}
out = {}
os.makedirs(OUT, exist_ok=True)
os.makedirs(CHK, exist_ok=True)
for key, boxes in B.items():
    bx = [b[:4] for b in boxes]
    f = FIX.get(key, {})
    gone = set()
    for g in f.get('merge', []):
        xs = [bx[i] for i in g]
        bx[g[0]] = [min(b[0] for b in xs), min(b[1] for b in xs), max(b[2] for b in xs), max(b[3] for b in xs)]
        gone.update(g[1:])
    bx = [b for i, b in enumerate(bx) if i not in gone] + f.get('add', [])
    # 1200×896 기준 좌표(원본 2400×1792의 절반), [x, y, w, h]
    out[key] = [[round(b[0]/2), round(b[1]/2), round((b[2]-b[0])/2), round((b[3]-b[1])/2)] for b in bx]
    s, lv = key.split('_')
    im = Image.open(f'{SRC}/set{s}_{lv}.png').convert('RGB').resize((1200, 896), Image.LANCZOS)
    im.save(f'{OUT}/set{s}_{lv}.webp', quality=82, method=6)
    d = ImageDraw.Draw(im)
    for b in out[key]: d.rectangle([b[0], b[1], b[0]+b[2], b[1]+b[3]], outline=(255, 0, 0), width=4)
    im.save(f'{CHK}/{key}.jpg', quality=70)
for s in sorted(int(f[3:-13]) for f in os.listdir(SRC) if f.endswith('_original.png')):
    Image.open(f'{SRC}/set{s}_original.png').convert('RGB').resize((1200, 896), Image.LANCZOS).save(f'{OUT}/set{s}_original.webp', quality=82, method=6)
json.dump(out, open(os.path.join(HERE, 'spots.json'), 'w'))
for k, v in sorted(out.items()): print(k, len(v))
