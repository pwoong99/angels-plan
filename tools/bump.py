"""새 버전 올리기: python3 tools/bump.py v1.6
app.js의 VERSION, 파일 주소의 ?v=, version.json을 한 번에 바꿈 (브라우저가 예전 파일을 쓰지 않도록)"""
import re, sys, json, pathlib
v = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent
app = root / "app.js"; s = app.read_text()
s = re.sub(r'const VERSION = "[^"]+";', f'const VERSION = "{v}";', s)
s = re.sub(r'(from "\./[a-z]+\.js)\?v=[^"]*"', rf'\1?v={v}"', s)
app.write_text(s)
idx = root / "index.html"; h = idx.read_text()
h = re.sub(r'(href="style\.css)\?v=[^"]*"', rf'\1?v={v}"', h)
h = re.sub(r'(src="app\.js)\?v=[^"]*"', rf'\1?v={v}"', h)
idx.write_text(h)
(root / "version.json").write_text(json.dumps({"version": v}) + "\n")
print("버전", v)
