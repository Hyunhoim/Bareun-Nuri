"""Frozen D: dataset-independent mixed-script reading, with/without page title."""
import importlib.util,json,re,unicodedata
from pathlib import Path
s=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
mapping=read('agent/src/core/confusables-latin.json')['mapping']
def reading(text):
 def token(m):
  t=m[0]
  return ''.join(mapping.get(c,c) for c in t) if re.search('[A-Za-z]',t) else t
 return re.sub(r'[^\W_]+',token,text)
def main():
 assert reading('Bоnus')=='Bonus' and reading('α β 2026 A14')=='α β 2026 A14'
 root=Path('.runtime/d-generalization-v1/reading');root.mkdir(exist_ok=False)
 p.torch.set_num_threads(8);source=Path('.runtime/klue-audit-learning-v1/run-cpu/model')
 tok=p.AutoTokenizer.from_pretrained(source,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True).to('cpu')
 results={};gold={r['id']:r for r in read('test-set-contest-v1/data/private/gold.json')}
 for panel,path in [('regression','.runtime/klue-input-audit-v2/corrected-inputs.json'),('broad','.runtime/klue-broad-development-v1/rows.json'),('ownership','.runtime/klue-retention-v1/development.json')]:
  original=read(path);ys=[(0 if gold[r['id']]['is_violation'] else 2) if panel=='regression' else r['label'] for r in original];results[panel]={}
  for mode in ['reading','reading_no_title']:
   rows=[]
   for r in original:
    inp={k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()};inp['target']=reading(inp['target'])
    if mode=='reading_no_title':inp['context']='\n'.join(inp['context'].split('\n')[1:])
    rows.append({**r,'input':inp})
   encoded,tr=p.encoded(tok,rows);ps,seconds=p.predict(model,tok,encoded,8,'cpu')
   result={'metrics':p.metrics(ys,ps),'seconds':seconds,'truncated':tr,'changed_inputs':sum(a['input']!=b['input'] for a,b in zip(original,rows)),'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rows,ps,strict=True)]};results[panel][mode]=result
   (root/(panel+'-'+mode+'-inputs.json')).write_text(json.dumps(rows,ensure_ascii=False),encoding='utf8')
   (root/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'panel':panel,'mode':mode,**{k:v for k,v in result.items() if k!='predictions'}}),flush=True)
 (root/'completed.json').write_text(json.dumps({'complete':True,'script_sha256':p.digest(__file__),'mapping_sha256':p.digest('agent/src/core/confusables-latin.json'),'training':0,'production_change':False}),encoding='utf8')
if __name__=='__main__':main()
