"""Development-only fixed-grid promotion calibration; frozen weights, no final860."""
import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('a',Path(__file__).with_name('antispoof-scope.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
s=importlib.util.spec_from_file_location('e',Path(__file__).with_name('dual-technique-eval.py'));e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
R=Path('.runtime/antispoof-calibration-v1')
def labels(probs,t):
 out=[]
 for p in probs:
  v=[max(range(3),key=lambda j:x[j]) for x in p]
  if p[1][0]>=t:v[1]=0
  out.append(v)
 return out
def main():
 R.mkdir(exist_ok=False);torch=a.torch;torch.set_num_threads(8);torch.manual_seed(42)
 source=Path('.runtime/antispoof-sparse-v1/scope/model');assert a.p.digest(source/'model.safetensors')==a.read(source.parent/'frozen.json')['sha256']
 model=a.p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True).to('cuda').eval();tok=a.p.AutoTokenizer.from_pretrained(source,local_files_only=True)
 def predict(rows):
  enc,lens=a.d.encoded(tok,rows);assert max(lens)<=512;out=[]
  with torch.inference_mode():
   for i in range(0,len(enc),8):out+=model(**a.p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cuda')).logits.reshape(-1,2,3).softmax(-1).cpu().tolist()
  return out
 panels=a.panels();probs={name:predict(rows) for name,(rows,gold) in panels.items()};scores=[]
 for t in [.2,.35,1.]:
  ms={name:a.d.metric([g['labels'] for g in gold],labels(probs[name],t)) for name,(rows,gold) in panels.items()}
  score=(ms['old']['positive_macro_f1']+ms['role']['HOMOGLYPH']['strict_f1']+ms['scope']['positive_macro_f1'])/3
  scores.append({'threshold':t,'score':score,'false':sum(m['normal_false']+m['uncertain_false'] for m in ms.values()),'metrics':ms})
 selected=max(scores,key=lambda x:(x['score'],-x['false'],x['threshold']==.2));a.save(R/'selection.json',selected);a.save(R/'development.json',scores);a.save(R/'development-probabilities.json',probs)
 # Selection is sealed before any observed regression is loaded.
 chosen=selected['threshold'];result={};baseline=a.read(a.R/'regression/baseline-predictions.json')
 for name,(rows,gold) in e.regressions().items():
  pr=predict(rows);ps=labels(pr,chosen);old=baseline[name]
  m={'H':a.d.c.t.metric([g['label'] for g in gold],[v[1] for v in ps]),'lost':sum(g['label']==0 and b[1]==0 and v[1]!=0 for g,b,v in zip(gold,old,ps,strict=True)),'recovered':sum(g['label']==0 and b[1]!=0 and v[1]==0 for g,b,v in zip(gold,old,ps,strict=True))}
  if name in ['old-dev','old-final']:
   split=name.removeprefix('old-');intent={r['node_id']:r['is_violation'] for r in a.read(Path('.runtime/technique-specialist-intent-v1')/f'{split}-decisions.json')};code={r['id']:r['label'] for r in a.read(Path('.runtime/technique-specialist-hcx-v1')/f'{split}-code.json')}
   truth={g['id'] for g in gold if g['is_ad'] and g['label']==0};found={r['id'] for r,v in zip(rows,ps,strict=True) if intent[r['id']] and (v[1]==0 or code[r['id']]==0)};m['stored_hcx']=e.c.binary(truth,found)
  result[name]=m;a.save(R/(name+'-predictions.json'),{'probabilities':pr,'labels':ps})
 pins=a.read(a.R/'operating-before.json');assert all(a.p.digest(Path(f))==h for f,h in pins.items())
 a.save(R/'regression.json',result);a.save(R/'audit.json',{'model_sha256':a.p.digest(source/'model.safetensors'),'plan_sha256':a.p.digest(Path('docs/antispoof-calibration-plan.md')),'script_sha256':a.p.digest(Path(__file__)),'training':0,'api':0,'final860_access':False,'production_files_unchanged':len(pins)})
 print({'development':[(m['threshold'],m['score'],m['false']) for m in scores],'selected':chosen,'regression':{n:{'f1':m['H']['strict_f1'],'lost':m['lost'],'recovered':m['recovered'],'hcx':m.get('stored_hcx')} for n,m in result.items()}},flush=True)
if __name__=='__main__':main()
