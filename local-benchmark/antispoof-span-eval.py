"""Post-selection observed regression and bounded CPU parity, no final/API."""
import argparse,gc,importlib.util,time,statistics
from pathlib import Path
s=importlib.util.spec_from_file_location('b',Path(__file__).with_name('antispoof-span.py'));b=importlib.util.module_from_spec(s);s.loader.exec_module(b)
s=importlib.util.spec_from_file_location('e',Path(__file__).with_name('dual-technique-eval.py'));e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
p=b.p;torch=b.torch;read=b.read;save=b.save

def load(device):
 source=b.R/'model';assert p.digest(source/'model.safetensors')==read(b.R/'frozen.json')['sha256']
 return b.TargetModel(p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True)).to(device),p.AutoTokenizer.from_pretrained(source,local_files_only=True)

def regression():
 out=b.R/'regression';out.mkdir(exist_ok=False);model,tok=load('cuda');torch.set_num_threads(8);metrics={};predictions={}
 baseline=read(b.a.R/'regression/baseline-predictions.json')
 for name,(rows,gold) in e.regressions().items():
  enc,lens=b.encoded(tok,rows);assert max(lens)<=512
  ps=b.predict(model,tok,enc);predictions[name]=ps;old=baseline[name];assert len(old)==len(ps)
  m={'H':b.a.d.c.t.metric([g['label'] for g in gold],[v[1] for v in ps]),'TP_lost_vs_v1':sum(g['label']==0 and o[1]==0 and v[1]!=0 for g,o,v in zip(gold,old,ps,strict=True)),'TP_recovered_vs_v1':sum(g['label']==0 and o[1]!=0 and v[1]==0 for g,o,v in zip(gold,old,ps,strict=True))}
  if name in ['old-dev','old-final']:
   split=name.removeprefix('old-');intent={r['node_id']:r['is_violation'] for r in read(Path('.runtime/technique-specialist-intent-v1')/f'{split}-decisions.json')};code={r['id']:r['label'] for r in read(Path('.runtime/technique-specialist-hcx-v1')/f'{split}-code.json')}
   truth={g['id'] for g in gold if g['is_ad'] and g['label']==0};found={r['id'] for r,v in zip(rows,ps,strict=True) if intent[r['id']] and (v[1]==0 or code[r['id']]==0)};m['stored_hcx']=e.c.binary(truth,found)
  metrics[name]=m
 save(out/'predictions.json',predictions);save(out/'metrics.json',metrics)
 pins=read(b.a.R/'operating-before.json');assert all(p.digest(Path(f))==h for f,h in pins.items())
 save(out/'audit.json',{'operating_files_unchanged':len(pins),'final860_used':False,'api_calls':0})
 print({n:{'H_F1':round(m['H']['strict_f1']*100,2),'lost':m['TP_lost_vs_v1'],'recovered':m['TP_recovered_vs_v1'],'hcx':m.get('stored_hcx')} for n,m in metrics.items()},flush=True)

def cpu():
 model,tok=load('cpu');torch.set_num_threads(8);rows=read(b.a.R/'dev-inputs.json');enc,_=b.encoded(tok,rows[:8]);b.predict(model,tok,enc,'cpu');times=[];first=None
 for rep in range(3):
  order=list(range(len(rows)));order=order[::-1] if rep==1 else order
  start=time.perf_counter();enc,lens=b.encoded(tok,[rows[i] for i in order]);assert max(lens)<=512;ps=b.predict(model,tok,enc,'cpu');times.append(time.perf_counter()-start)
  found=dict(zip(order,ps,strict=True));ordered=[found[i] for i in range(len(rows))]
  if first is None:first=ordered
  else:assert first==ordered
 epoch=read(b.R/'selection.json')['epoch'];assert first==read(b.R/f'epoch{epoch}/scope-predictions.json')
 result={'rows':len(rows),'seconds':times,'median_seconds':statistics.median(times),'order_equal':True,'cpu_gpu_equal':True,'includes':'tokenization and inference; excludes load/browser/HCX'}
 save(b.R/'cpu.json',result);print(result,flush=True)

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('action',choices=['regression','cpu']);args=ap.parse_args();globals()[args.action]()
