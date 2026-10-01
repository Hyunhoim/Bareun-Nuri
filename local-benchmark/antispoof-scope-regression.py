"""Read-only, already-observed regressions after development selection; API0."""
import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path(__file__).with_name('antispoof-scope.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
s=importlib.util.spec_from_file_location('ev',Path(__file__).with_name('dual-technique-eval.py'));e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
p=a.p;torch=a.torch;read=a.read;save=a.save

def main(out_root=None, arms=None, candidate_encode=None):
 out=(Path(out_root) if out_root else a.R)/'regression';out.mkdir(exist_ok=False);torch.set_num_threads(8);assert torch.cuda.is_available()
 panels=e.regressions();results={};predictions={}
 for arm,path in (arms or [('baseline',Path('agent/models/kcelectra-antispoof-v1')),('control',a.R/'control/model'),('scope',a.R/'scope/model')]):
  expected=read(path/'manifest.json')['files']['model.safetensors'] if arm=='baseline' else read(path.parent/'frozen.json')['sha256']
  assert p.digest(path/'model.safetensors')==expected
  model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda');tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);metrics={};predictions[arm]={}
  for name,(rows,gold) in panels.items():
   encode=candidate_encode if arm!='baseline' and candidate_encode else a.d.encoded
   enc,lens=encode(tok,rows);assert max(lens)<=512
   ps=a.predict(model,tok,enc);predictions[arm][name]=ps
   baseline=predictions['baseline'][name]
   m={'H':a.d.c.t.metric([g['label'] for g in gold],[v[1] for v in ps]),
      'TP_lost_vs_v1':sum(g['label']==0 and b[1]==0 and v[1]!=0 for g,b,v in zip(gold,baseline,ps,strict=True)),
      'TP_recovered_vs_v1':sum(g['label']==0 and b[1]!=0 and v[1]==0 for g,b,v in zip(gold,baseline,ps,strict=True))}
   if name in ['old-dev','old-final']:
    split=name.removeprefix('old-');intent={r['node_id']:r['is_violation'] for r in read(Path('.runtime/technique-specialist-intent-v1')/f'{split}-decisions.json')};code={r['id']:r['label'] for r in read(Path('.runtime/technique-specialist-hcx-v1')/f'{split}-code.json')}
    truth={g['id'] for g in gold if g['is_ad'] and g['label']==0};found={r['id'] for r,v in zip(rows,ps,strict=True) if intent[r['id']] and (v[1]==0 or code[r['id']]==0)}
    m['stored_hcx']=e.c.binary(truth,found)
   metrics[name]=m
  results[arm]=metrics;save(out/(arm+'-predictions.json'),predictions[arm]);save(out/(arm+'-metrics.json'),metrics)
  del model;torch.cuda.empty_cache()
 save(out/'summary.json',results)
 operating=read(a.R/'operating-before.json');assert all(p.digest(Path(f))==h for f,h in operating.items())
 save(out/'audit.json',{'operating_files_unchanged':len(operating),'new_final_used':False,'api_calls':0,'old_final_is_observed_regression':True})
 print({arm:{panel:round(m['H']['strict_f1']*100,2) for panel,m in ms.items()} for arm,ms in results.items()})

if __name__=='__main__':main()
