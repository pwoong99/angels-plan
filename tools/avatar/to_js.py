# out/atlas.json → angels-plan/avatar.js 의 const D = {...} 부분만 바꿈
import json
D=json.load(open('/home/claude/parts/out/atlas.json')); M=D['M']
def it(o): return [o['x'],o['y'],o['w'],o['h'],o['k']]+o['a']
data=dict(W=D['W'],H=D['H'],
 face=[dict(i=it(f['img']),el=f['el'],er=f['er'],m=f['m'],k=f['k']) for f in M['face']],
 eyes=[dict(s=1 if e['single'] else 0,p=[[it(l) for l in ls] for ls in e['p']]) for e in M['eyes']],
 mouth=[it(m) for m in M['mouth']],
 hair=[[it(h['b']),it(h['f'])] for h in M['hair']],
 body=[[it(l) for l in b] for b in M['body']],
 wings=[[it(l) for l in w] for w in M['wings']])
p='/home/claude/angels-plan/avatar.js'; js=open(p).read()
i=js.index('const D = '); j=js.index(';\n',i)
open(p,'w').write(js[:i]+'const D = '+json.dumps(data,separators=(',',':'))+js[j:])
print('wings', len(data['wings']))
