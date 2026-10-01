"""Preserve character identity, deduplicate mappings; inspect before learning."""
import importlib.util,json,collections,statistics
from pathlib import Path
s=importlib.util.spec_from_file_location('c',Path(__file__).with_name('antispoof-compact.py'));c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
a=c.a;t=c.t;R=Path('.runtime/antispoof-indexed-v1')
def evidence(token,m):
 old=json.loads(t.evidence(token,m).split(': ',1)[1]);out={'원문':token,'skeleton':old['skeleton']}
 for name in ['자모관련대응','기타문자대응']:
  grouped={}
  for i,ch,cp,dst,dcp in old[name]:grouped.setdefault((cp,dcp),[]).append(i)
  out[name]=[[cp,dcp,ix] for (cp,dcp),ix in grouped.items()]
  restored=sorted((i,chr(int(cp[2:],16)),cp,''.join(chr(int(x[2:],16)) for x in dcp.split()),dcp) for cp,dcp,ix in out[name] for i in ix)
  assert restored==sorted(tuple(row) for row in old[name])
 missing={}
 for i,ch in enumerate(token):
  if ord(ch)>127 and ch not in m:missing.setdefault(f'U+{ord(ch):04X}',[]).append(i)
 if missing:out['표밖원문']=missing
 assert sorted((i,chr(int(cp[2:],16))) for cp,ix in missing.items() for i in ix)==[(i,ch) for i,ch in enumerate(token) if ord(ch)>127 and ch not in m]
 return '\nUnicode 문자 대응(위장 확정 아님): '+json.dumps(out,ensure_ascii=False,separators=(',',':'))
def main():
 R.mkdir(exist_ok=False);tok=a.p.AutoTokenizer.from_pretrained(t.R/'scope/model',local_files_only=True);m=a.d.c.mapping();panels=a.panels();chars=set();result={}
 for name,rows in [('live',a.read(Path('.runtime/antispoof-compact-v1/live-inputs.json')))]+[(n,r) for n,(r,g) in panels.items()]:
  old=c.encode(tok,rows,t.evidence,m)[1];new=c.encode(tok,rows,evidence,m)[1]
  if name!='live':chars.update(''.join(r['token'] for r in rows))
  result[name]={'count':len(rows),'mean_before':statistics.mean(old),'mean_after':statistics.mean(new),'max_after':max(new),'over512_before':sum(x>512 for x in old),'over512_after':sum(x>512 for x in new),'new_over512':[r['id'] for r,o,n in zip(rows,old,new,strict=True) if o<=512<n],'lengths':[{'id':r['id'],'before':o,'after':n} for r,o,n in zip(rows,old,new,strict=True)]}
 groups=collections.defaultdict(list)
 for ch in sorted(chars,key=ord):groups[tuple(tok('판정대상: [표기]'+ch+'[/표기]'+evidence(ch,m),add_special_tokens=False)['input_ids'])].append(ch)
 collisions=[v for v in groups.values() if len(v)>1]
 passed=not collisions and not result['live']['new_over512'] and result['live']['mean_after']<result['live']['mean_before'] and all(result[n]['max_after']<=512 for n in panels)
 out={'pass':passed,'panels':result,'probe_characters':len(chars),'collisions':collisions,'training':0,'api':0,'final860_access':False,'script_sha256':a.p.digest(Path(__file__)),'plan_sha256':a.p.digest(Path('docs/antispoof-indexed-plan.md'))};a.save(R/'diagnosis.json',out)
 print(json.dumps({**out,'panels':{n:{k:v for k,v in d.items() if k!='lengths'} for n,d in result.items()}},ensure_ascii=False))
if __name__=='__main__':main()
