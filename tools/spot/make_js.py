# spots.json(다른 곳 위치) → spot.js
import json, os
here = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(here, 'spots.json')))
body = "{\n" + ",\n".join(f'  "{k}": {json.dumps(v, separators=(",", ":"))}' for k, v in sorted(d.items())) + "\n}"
t = open(os.path.join(here, 'spot_template.js'), encoding='utf-8').read().replace('__BOXES__', body)
open(os.path.join(here, '..', '..', 'spot.js'), 'w', encoding='utf-8').write(t)
print('spot.js', len(d), 'pictures')
