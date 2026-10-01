"""Controlled D ablations; oracle restoration is diagnostic only, never deployable."""
import importlib.util,json,time,unicodedata
from pathlib import Path
s=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
root=Path('.runtime/d-generalization-v1');modelpath=Path('.runtime/klue-audit-learning-v1/run-cpu/model')
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def save(n,x):(root/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 root.mkdir(exist_ok=False);p.torch.set_num_threads(8)
 originals=read('.runtime/klue-input-audit-v2/corrected-inputs.json');gold={g['id']:g for g in read('test-set-contest-v1/data/private/gold.json')};prior={r['id']:r['prediction'] for r in read('.runtime/klue-audit-learning-v1/run-cpu/regression-predictions.json')}
 freeze={str(f):p.digest(f) for f in [*modelpath.glob('*'),Path(__file__),Path('docs/d-generalization-plan.md'),Path('.runtime/klue-input-audit-v2/corrected-inputs.json'),Path('test-set-contest-v1/data/private/gold.json')] if f.is_file()};save('frozen',freeze)
 tok=p.AutoTokenizer.from_pretrained(modelpath,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(modelpath,local_files_only=True).to('cpu');results={};ys=[0 if gold[r['id']]['is_violation'] else 2 for r in originals]
 for mode in ['baseline','no_page_title','target_only','oracle_reading']:
  rows=[]
  for r in originals:
   inp={k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}
   if mode=='no_page_title':inp['context']='\n'.join(inp['context'].split('\n')[1:])
   if mode=='target_only':inp['context']=''
   if mode=='oracle_reading':inp['target']=unicodedata.normalize('NFC',gold[r['id']]['base_text'])
   rows.append({**r,'input':inp})
  save(mode+'-inputs',rows);encoded,truncated=p.encoded(tok,rows);p.predict(model,tok,encoded[:8],8,'cpu');pred=[];seconds=0;start=time.perf_counter()
  for i in range(0,len(rows),128):
   assert time.perf_counter()-start<600;ps,sec=p.predict(model,tok,encoded[i:i+128],8,'cpu');pred.extend(ps);seconds+=sec
   if i%512==0:print(json.dumps({'mode':mode,'done':len(pred)}),flush=True)
  save(mode+'-predictions',[{'id':r['id'],'prediction':v} for r,v in zip(rows,pred,strict=True)])
  base=[prior[r['id']] for r in rows];changes={'lost_tp':[],'gained_tp':[],'fixed_fp':[],'new_fp':[]}
  for r,y,a,b in zip(rows,ys,base,pred,strict=True):
   if (a==0)==(b==0):continue
   changes[('lost_tp' if a==0 else 'gained_tp') if y==0 else ('fixed_fp' if a==0 else 'new_fp')].append(r['id'])
  result={'metrics':p.metrics(ys,pred),'seconds':seconds,'truncated':truncated,'changed_inputs':sum(a['input']!=b['input'] for a,b in zip(rows,originals)),'prediction_changes_vs_saved_D':sum(a!=b for a,b in zip(base,pred)),'changes':{k:len(v) for k,v in changes.items()},'diagnostic_only':True};save(mode+'-changes',changes);results[mode]=result;save('results',results);print(json.dumps({'mode':mode,**result}),flush=True)
 for f,h in freeze.items():assert p.digest(f)==h
 save('completed',{'complete':True,'production_changes':0,'training':0})
if __name__=='__main__':main()
