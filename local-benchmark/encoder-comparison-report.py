"""Score paired changes after frozen models finish; no training or threshold search."""
import json,hashlib
from pathlib import Path
R=Path('.runtime/encoder-comparison-v1')
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
assert read(R/'completed.json')['completed']
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
manifest=read(R/'manifest.json')
assert sha(R/'train.json')==manifest['train_sha256']
assert sha(R/'panels.json')==manifest['panels_sha256']
assert sha('docs/encoder-comparison-plan.md')==manifest['plan_sha256']
for n in ['base','kcelectra','large']:assert sha(R/n/'model/model.safetensors')==read(R/n/'frozen.json')['sha256']
gold=read('test-set-contest-v1/data/private/gold.json')
models=['base','kcelectra','large','A'];results={n:read(R/n/'regression.json') for n in models}
pred={n:{r['id']:r['prediction'] for r in read(R/n/'regression-predictions.json')} for n in models}
for values in pred.values():assert set(values)=={r['id'] for r in gold}
assert pred['A']=={r['id']:r['prediction'] for r in read('.runtime/klue-contest-v1/candidate-predictions.json')}
def changes(n,ref):
 out={'lost_tp':[],'gained_tp':[],'fixed_fp':[],'new_fp':[]}
 for r in gold:
  a=pred[ref].get(r['id'])==0;b=pred[n].get(r['id'])==0
  k=('lost_tp' if a and not b else 'gained_tp' if b and not a else None) if r['is_violation'] else ('fixed_fp' if a and not b else 'new_fp' if b and not a else None)
  if k:out[k].append(r['id'])
 return out
dev={n:read(R/n/'selection.json') for n in models if n!='A'}
report={}
for n in models:
 record={'regression':results[n],'vs_base':changes(n,'base'),'vs_A':changes(n,'A')}
 if n!='A':
  d=dev[n];record['selected_epoch']=d['epoch'];record['development_mean_ad_f1']=d['rank'][1]
  record['promising_gate']=(d['rank'][1]>=dev['base']['rank'][1]+.02 and results[n]['overall']['ad_f1']>=results['base']['overall']['ad_f1']+.02 and results[n]['overall']['fp']<=results['base']['overall']['fp'] and all(v['ad_f1']>=results['base']['by_technique'][t]['ad_f1']-.02 for t,v in results[n]['by_technique'].items()))
 report[n]=record
(R/'comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
for n,r in report.items():print(json.dumps({'model':n,'overall':r['regression']['overall'],'cpu_seconds':r['regression']['cpu_seconds'],'gate':r.get('promising_gate'),'vs_A':{k:len(v) for k,v in r['vs_A'].items()}},ensure_ascii=False))
