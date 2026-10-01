"""Audit lexical reuse only; this cannot prove scenario independence."""
import collections, json, re, unicodedata, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent
def norm(s):return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',s)).strip()
def walk(x):
 if isinstance(x,dict):
  if isinstance(x.get('input'),dict) and isinstance(x['input'].get('target'),str):yield x['input']['target']
  for k,v in x.items():
   if k!='input':yield from walk(v)
 elif isinstance(x,list):
  for v in x:yield from walk(v)
def grams(s):return set(s[i:i+3] for i in range(max(0,len(s)-2)))
def main():
 paths=[]
 for folder,names in {
  'klue-pilot-v2':['train','validation','final-inputs'],
  'klue-refinement-v1':['train','validation'],
  'klue-scale-v1':['train','validation','final-inputs','challenge-inputs','corrected-regression','legacy-dom-regression'],
  'klue-cycle2-v3':['train','validation','sealed-inputs'],
  'klue-cycle3-v1':['train','development','final-dom/inputs'],
 }.items():
  for name in names:
   p=REPO/'.runtime'/folder/(name+'.json')
   if p.exists():paths.append(p)
 old=sorted({norm(t) for p in paths for t in walk(json.loads(p.read_text(encoding='utf8')))})
 index=collections.defaultdict(set);sets=[]
 for i,t in enumerate(old):
  gs=grams(t);sets.append(gs)
  for g in gs:index[g].add(i)
 gold=json.loads((ROOT/'data/private/gold.json').read_text(encoding='utf8'));new={r['group_id']:r['base_text'] for r in gold};pairs=[]
 for group,text in new.items():
  gs=grams(norm(text));shared=collections.Counter(i for g in gs for i in index.get(g,()))
  scores=[(n/(len(gs)+len(sets[i])-n),i) for i,n in shared.items()];best=max(scores,default=(0,None));score,i=best
  pairs.append({'group_id':group,'new_text':text,'jaccard_3gram':score,'closest_old_target':old[i] if i is not None else None,'exact_match':norm(text) in old})
 result={'source_files':[str(p.relative_to(REPO)) for p in paths],'old_unique_targets':len(old),'new_unique_semantic_targets':len(new),'exact_reuse':sum(r['exact_match'] for r in pairs),'max_character_3gram_jaccard':max(r['jaccard_3gram'] for r in pairs),'at_least_0_5':sum(r['jaccard_3gram']>=.5 for r in pairs),'at_least_0_3':sum(r['jaccard_3gram']>=.3 for r in pairs),'limitation':'Character overlap is not semantic independence. Same task and same author; no independent human review. Technique variants are paired, not independent examples.','nearest':sorted(pairs,key=lambda r:-r['jaccard_3gram'])}
 (ROOT/'overlap-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps({k:v for k,v in result.items() if k!='nearest'},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
