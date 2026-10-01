"""Context ablation across already observed development panels; not a final holdout."""
import importlib.util,json,unicodedata
from pathlib import Path
s=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
root=Path('.runtime/d-generalization-v1/development');source=Path('.runtime/klue-audit-learning-v1/run-cpu/model')
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def main():
 root.mkdir(exist_ok=False);p.torch.set_num_threads(8);model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True).to('cpu');tok=p.AutoTokenizer.from_pretrained(source,local_files_only=True);results={}
 for panel,path in [('broad','.runtime/klue-broad-development-v1/rows.json'),('ownership','.runtime/klue-retention-v1/development.json')]:
  original=read(path);results[panel]={}
  for mode in ['baseline','no_page_title','target_only']:
   rows=[]
   for r in original:
    inp={k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}
    if mode=='no_page_title':inp['context']='\n'.join(inp['context'].split('\n')[1:])
    if mode=='target_only':inp['context']=''
    rows.append({**r,'input':inp})
   encoded,tr=p.encoded(tok,rows);ps,seconds=p.predict(model,tok,encoded,8,'cpu');result={'metrics':p.metrics([r['label'] for r in rows],ps),'seconds':seconds,'truncated':tr,'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rows,ps,strict=True)],'input_hash':p.digest(path)};results[panel][mode]=result
   (root/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'panel':panel,'mode':mode,'metrics':result['metrics']}),flush=True)
 (root/'completed.json').write_text(json.dumps({'complete':True,'training':0,'independent_final':False}),encoding='utf8')
if __name__=='__main__':main()
