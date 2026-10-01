"""Typed presentation of the same Unicode evidence; isolated experiment."""
import importlib.util,json,unicodedata,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('a',Path(__file__).with_name('antispoof-scope.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
R=Path('.runtime/antispoof-typed-v1')
def jamo(c):return any(lo<=ord(c)<=hi for lo,hi in [(0x1100,0x11ff),(0x3130,0x318f),(0xa960,0xa97f),(0xd7b0,0xd7ff),(0xffa0,0xffdc)])
def evidence(token,m):
 skeleton=unicodedata.normalize('NFD',''.join(m.get(c,c) for c in unicodedata.normalize('NFD',token)))
 groups={'자모관련대응':[],'기타문자대응':[]}
 for i,c in enumerate(token):
  if c in m:groups['자모관련대응' if jamo(c) or all(jamo(z) for z in m[c]) else '기타문자대응'].append([i,c,f'U+{ord(c):04X}',m[c],' '.join(f'U+{ord(z):04X}' for z in m[c])])
 return '\nUnicode 문자 대응(위장 확정 아님): '+json.dumps({'원문':token,'skeleton':skeleton,**groups},ensure_ascii=False,separators=(',',':'))
def encoded(tok,rows):
 m=a.d.c.mapping();texts=['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context']+evidence(r['token'],m) for r in rows]
 full=tok(texts,truncation=False,return_token_type_ids=False)
 return [{k:v[i] for k,v in full.items()} for i in range(len(rows))],[len(x) for x in full['input_ids']]
def main():
 R.mkdir(exist_ok=False);rows=a.read(Path('.runtime/antispoof-sparse-v1/train-inputs.json'));gold=a.read(Path('.runtime/antispoof-sparse-v1/train-gold.json'))
 m=a.d.c.mapping()
 for r in rows:
  item=json.loads(evidence(r['token'],m).split(': ',1)[1]);pairs=item['자모관련대응']+item['기타문자대응'];assert sorted((p[0],p[1],p[3]) for p in pairs)==[(i,c,m[c]) for i,c in enumerate(r['token']) if c in m]
  old=json.loads(a.d.c.evidence(r['token'],m).split(': ',1)[1]);assert old['skeleton']==item['skeleton'] and old['원문']==item['원문']
 assert evidence('ㅎㅏㄱ',m)==evidence('ㅎㅏㄱ',m)
 a.save(R/'manifest.json',{'plan_sha256':a.p.digest(Path('docs/antispoof-typed-plan.md')),'script_sha256':a.p.digest(Path(__file__)),'train_sha256':a.p.digest(Path('.runtime/antispoof-sparse-v1/train-inputs.json')),'correspondence_parity':len(rows),'new_mapping':False})
 a.d.encoded=encoded;a.run('scope',out_root=R,extra_pairs=list(zip(rows,gold,strict=True)))
if __name__=='__main__':main()
