"""Frozen comparison on saved collected inputs; unknown labels stay unknown."""
import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('t',Path(__file__).with_name('antispoof-typed.py'));t=importlib.util.module_from_spec(s);s.loader.exec_module(t)
a=t.a;R=t.R/'collected'
def main():
 R.mkdir(exist_ok=False);source=Path('.runtime/technique-collected-v1/inputs.json');rows=a.read(source);a.torch.set_num_threads(8);all_preds={};summary={}
 for arm,path,encode in [('baseline',Path('agent/models/kcelectra-antispoof-v1'),a.d.encoded),('typed',t.R/'scope/model',t.encoded)]:
  model=a.p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda').eval();tok=a.p.AutoTokenizer.from_pretrained(path,local_files_only=True);enc,lens=encode(tok,rows)
  valid=[i for i,n in enumerate(lens) if n<=512 and not rows[i].get('collection_truncated')];ps=a.predict(model,tok,[enc[i] for i in valid]);found=dict(zip(valid,ps,strict=True))
  output=[{'id':r['id'],'labels':found.get(i,[2,2]),'protected':None if i in found else 'collection_truncated' if r.get('collection_truncated') else 'token_limit'} for i,r in enumerate(rows)]
  all_preds[arm]=output;a.save(R/(arm+'-predictions.json'),output);summary[arm]={'processed':len(valid),'protected':len(rows)-len(valid),'H_present':sum(v[1]==0 for v in ps),'H_absent':sum(v[1]==1 for v in ps),'H_uncertain':sum(v[1]==2 for v in ps),'known_ad_H':[]}
  for r,o in zip(rows,output,strict=True):
   if r.get('known_ad_label')==0 and 'HOMOGLYPH' in r.get('known_techniques',[]):summary[arm]['known_ad_H'].append({'id':r['id'],'token':r['token'],'prediction':o['labels'][1],'protected':o['protected']})
  del model;a.torch.cuda.empty_cache()
 summary['changed']=[{'id':r['id'],'panel':r['panel'],'known_ad_label':r.get('known_ad_label'),'before':b['labels'],'after':n['labels']} for r,b,n in zip(rows,all_preds['baseline'],all_preds['typed'],strict=True) if b!=n]
 pins=a.read(a.R/'operating-before.json');assert all(a.p.digest(Path(f))==h for f,h in pins.items())
 a.save(R/'summary.json',summary);a.save(R/'audit.json',{'source_sha256':a.p.digest(source),'script_sha256':a.p.digest(Path(__file__)),'training':0,'api':0,'final860_access':False,'unknown_rows_not_scored':True,'stored_HCX_intent_join':False});print(summary,flush=True)
if __name__=='__main__':main()
