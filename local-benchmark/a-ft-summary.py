"""Rebuild the completed fine-tuning scoreboard without training or private gold."""
import json,hashlib
from pathlib import Path
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def main():
 roots=['a-finetune-v1','a-finetune-v2','a-finetune-v3','a-finetune-v4','a-finetune-calibration-v1','a-finetune-rehearsal-v1','a-finetune-rehearsal-kd-v1','a-finetune-head-v1'];out={}
 for name in roots:
  root=Path('.runtime')/name;entry={'selection':read(root/'selection.json')}
  if (root/'evaluation/regression.json').exists():
   r=read(root/'evaluation/regression.json');entry['regression']={k:r[k] for k in ['metrics','techniques','seconds','gate']};entry['changes']={k:len(v) for k,v in r['changes'].items()}
  if (root/'candidates.json').exists():entry['development']={k:{'step':v['step'],'score':v['score'],'panels':{q:x['metrics'] for q,x in v['panels'].items()}} for k,v in read(root/'candidates.json').items()}
  assert not (root/'evaluation/confirmation-started.json').exists()
  for f,h in read(root/'frozen.json').items():assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h
  out[name]=entry
 used=Path('.runtime/kcelectra-confirmation-v1/evaluation-status.json')
 out['sealed_confirmation']={'sha256':hashlib.sha256(Path('local-benchmark/a-ft-confirmation-private.json').read_bytes()).hexdigest(),'model_evaluations':5 if used.exists() else 0,'campaigns':1 if used.exists() else 0,'future_use':'regression only' if used.exists() else 'sealed'};assert out['sealed_confirmation']['sha256'].upper()=='845EDF63D26543C7901E532A7DA5636EDDB483D7FB7B765E3EECE4807DA755DB'
 Path('.runtime/a-ft-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps({k:v.get('changes',v.get('selection')) for k,v in out.items()},ensure_ascii=False))
if __name__=='__main__':main()
