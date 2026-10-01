"""Audit generated training; do not open any sealed/fresh final evaluation."""
import json,hashlib,unicodedata,re,statistics
from collections import Counter,defaultdict
from pathlib import Path
from transformers import AutoTokenizer
import torch
R=Path('local-benchmark/nuri-1.2')
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def norm(t):return unicodedata.normalize('NFC',t)
def key(r):return json.dumps({k:norm(v) for k,v in r['input'].items()},ensure_ascii=False,sort_keys=True)
def grams(t):t=re.sub(r'\s+','',norm(t));return {t[i:i+3] for i in range(max(1,len(t)-2))}
def main():
 rows=read(R/'train.json');meta=read(R/'provenance.json');manifest=read(R/'manifest.json')
 for f,h in manifest['files'].items():assert sha(R/f)==h
 assert sha('local-benchmark/nuri12-data.py')==manifest['generator_sha256']
 assert len(rows)==10000 and len({r['id'] for r in rows})==10000
 # NFC may intentionally recombine NFD; audit the actual classifier serialization too.
 inputs=[key(r) for r in rows];assert len(set(inputs))==10000
 grouped=defaultdict(list)
 for r in rows:grouped[r['group']].append(r)
 assert len(grouped)==1000 and all(Counter(r['label'] for r in rs)=={0:4,1:2,2:3,3:1} for rs in grouped.values())
 paths=['.runtime/klue-input-audit-v2/corrected-inputs.json','.runtime/klue-broad-development-v1/rows.json','.runtime/klue-retention-v1/development.json']
 observed=[r for p in paths for r in read(p)]+read('local-benchmark/a-ft-new-data.json')['development']
 observed_keys={key(r) for r in observed};assert not set(inputs)&observed_keys
 targets={norm(r['input']['target']):r['id'] for r in observed};raw_unique={norm(m['raw_target']):m['id'] for m in meta};exact=[{'new':rid,'observed':targets[t],'characters':len(t)} for t,rid in raw_unique.items() if t in targets]
 # Inverted trigrams avoid quadratic all-pairs Python set unions.
 refs=[grams(t) for t in targets];refids=list(targets.values());index=defaultdict(list)
 for i,g in enumerate(refs):
  for gram in g:index[gram].append(i)
 near=[];maximum=0
 for t,rid in raw_unique.items():
  gs=grams(t);counts=Counter(i for gram in gs for i in index.get(gram,[]))
  for i,n in counts.items():
   similarity=n/(len(gs)+len(refs[i])-n);maximum=max(maximum,similarity)
   if similarity>=.8:near.append({'new':rid,'observed':refids[i],'jaccard':similarity,'characters':len(t)})
 tok=AutoTokenizer.from_pretrained('.runtime/klue-cycle3-v1/frozen8/model',local_files_only=True)
 lengths=[]
 for start in range(0,len(rows),256):
  texts=[f"판정대상: {norm(r['input']['target'])}\n문맥: {norm(r['input']['context'])}" for r in rows[start:start+256]]
  lengths.extend(map(len,tok(texts,truncation=False)['input_ids']))
 stats={str(y):{'n':sum(r['label']==y for r in rows),'target_char_mean':statistics.mean(len(r['input']['target']) for r in rows if r['label']==y),'tokens_mean':statistics.mean(n for r,n in zip(rows,lengths) if r['label']==y),'tokens_max':max(n for r,n in zip(rows,lengths) if r['label']==y)} for y in range(4)}
 changed=sum(norm(r['input']['target'])!=norm(m['raw_target']) for r,m in zip(rows,meta))
 gpu={'available':torch.cuda.is_available(),'torch':torch.__version__}
 if gpu['available']:
  x=torch.ones((128,128),device='cuda');v=(x@x).mean().item();assert v==128;gpu.update({'name':torch.cuda.get_device_name(0),'vram_bytes':torch.cuda.get_device_properties(0).total_memory,'compute_smoke_test':True})
 out={'rows':len(rows),'groups':len(grouped),'independent_real_examples':0,'exact_serialized_duplicates':len(rows)-len(set(inputs)),'exact_observed_input_overlap':0,'exact_observed_raw_target_overlap':exact,'near_observed_raw_targets':near,'maximum_raw_target_jaccard':maximum,'audited_observed_files':paths+['local-benchmark/a-ft-new-data.json:development'],'sealed_files_opened':False,'label_statistics':stats,'token_limit':512,'truncated_rows':sum(n>512 for n in lengths),'max_tokens':max(lengths),'effective_text_changed_after_nfc':changed,'label_by_presentation':{mode:dict(Counter(r['label'] for r,m in zip(rows,meta) if m['presentation']==mode)) for mode in sorted({m['presentation'] for m in meta})},'operation':dict(Counter(m['operation'] for m in meta)),'gpu':gpu,'human_gold_audit':False,'source_shortcut_risk':'Only20 topic atoms/10 discourse families; each slot shares its wording pattern. Group split alone insufficient. Requires independently authored development.','pass_structural_checks':True}
 (R/'audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps(out,ensure_ascii=False));assert not out['truncated_rows'];assert not [v for v in near if v['characters']>=20], 'Review substantive evaluation overlaps before training'
if __name__=='__main__':main()
