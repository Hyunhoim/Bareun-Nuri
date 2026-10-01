"""Development-only, coarse global H promotion; no model training."""
import importlib.util,json
from pathlib import Path
s=importlib.util.spec_from_file_location('d',Path(__file__).with_name('dual-technique.py'));d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
p=d.p;torch=d.torch;R=d.R
def main():
 assert not (R/'calibration-selection.json').exists();torch.set_num_threads(8);name='kc-density-role';path=R/name/'model';assert p.digest(path/'model.safetensors')==d.read(R/name/'frozen.json')['model_sha256'];tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda');model.eval();panels={}
 for panel,folder in [('base',R),('contrast',R/'followup')]:
  rows=d.read(folder/'dev-inputs.json');gold=d.read(folder/'dev-gold.json');enc,lens=d.encoded(tok,rows);assert max(lens)<=512;probs=[]
  with torch.inference_mode():
   for i in range(0,len(enc),8):probs.extend(model(**p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cuda')).logits.reshape(-1,2,3).softmax(-1).cpu().tolist())
  panels[panel]={'ids':[r['id'] for r in rows],'gold':[r['labels'] for r in gold],'probabilities':probs}
 d.save(R/'calibration-development-probabilities.json',panels);results={}
 for threshold in [None,.05,.1,.2,.3]:
  mets={}
  for panel,data in panels.items():
   ps=[[max(range(3),key=lambda i:v[j][i]) for j in range(2)] for v in data['probabilities']]
   if threshold is not None:
    for pr,v in zip(ps,data['probabilities'],strict=True):
     if v[1][0]>=threshold:pr[1]=0
   mets[panel]=d.metric(data['gold'],ps)
  score=(mets['base']['positive_macro_f1']+mets['contrast']['HOMOGLYPH']['strict_f1'])/2
  results[str(threshold)]={'metrics':mets,'score':score,'normal_false':sum(m['normal_false'] for m in mets.values()),'uncertain_false':sum(m['uncertain_false'] for m in mets.values())}
 base=results['None'];eligible=[t for t in [.05,.1,.2,.3] if results[str(t)]['score']>=base['score']+.02 and results[str(t)]['normal_false']<=base['normal_false']+3 and results[str(t)]['uncertain_false']<=base['uncertain_false']+3];chosen=max(eligible,key=lambda t:(results[str(t)]['score'],t)) if eligible else None
 d.save(R/'calibration-selection.json',{'candidate':name,'threshold':chosen,'sha256':p.digest(path/'model.safetensors'),'plan_sha256':p.digest(Path('docs/dual-technique-calibration-plan.md')),'results':results,'eligible':eligible,'final_opened':False,'selection_data':'development only'})
 print(json.dumps({'threshold':chosen,'conditions':{k:{a:v[a] for a in ['score','normal_false','uncertain_false']} for k,v in results.items()}}),flush=True)
if __name__=='__main__':main()
