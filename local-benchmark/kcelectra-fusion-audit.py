import json,hashlib
from pathlib import Path
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
F=Path('.runtime/kcelectra-fusion-v1');S=Path('.runtime/kcelectra-freeze-v1');C=Path('.runtime/kcelectra-confirmation-v1')
assert read(F/'evaluation-completed.json')['completed'] and read(S/'completed.json')['completed']
assert read(C/'hcx-completed.json')['completed'] and read(C/'evaluation-status.json')['campaigns']==1
for path,h in read(F/'manifest.json')['data_hashes'].items():assert sha(path)==h
for root,names in [(F,['A_replay','K_base','D_only','mix50','mix12']),(Path('.runtime/kcelectra-distill-v1'),['control','distill']),(S,['freeze4','full'])]:
 for name in names:assert sha(root/name/'model/model.safetensors')==read(root/name/'frozen.json')['sha256']
assert read(F/'A_replay/regression-predictions.json')==read(F/'A/regression-predictions.json')
gold={r['id']:r for r in read('test-set-contest-v1/data/private/gold.json')};a={r['id']:r['prediction'] for r in read(F/'A/regression-predictions.json')};changes={}
for name in ['freeze4','full']:
 pred={r['id']:r['prediction'] for r in read(S/name/'predictions.json')};assert set(pred)==set(gold);out={k:0 for k in ['lost_tp','gained_tp','fixed_fp','new_fp']}
 for i,g in gold.items():
  x,y=a[i]==0,pred[i]==0;k=('lost_tp' if x and not y else 'gained_tp' if y and not x else None) if g['is_violation'] else ('fixed_fp' if x and not y else 'new_fp' if y and not x else None)
  if k:out[k]+=1
 changes[name]=out
freeze=read(C/'frozen.json');assert sha('local-benchmark/a-ft-confirmation-private.json')==freeze['private_sha256'];assert sha(S/'full/model/model.safetensors')==freeze['models']['K_full']
rows=read(C/'inputs.json');assert all(set(r)=={'id','input'} and set(r['input'])=={'target','context'} for r in rows)
for name in ['K_full','A','D','hcx-forward','hcx-reverse']:
 pred=read(C/(name+'-predictions.json'));assert len(pred)==48 and {r['id'] for r in pred}=={r['id'] for r in rows}
out={'model_hashes_verified':9,'A_replay_identical_predictions':2000,'changes':changes,'confirmation_rows':48,'confirmation_campaigns':1,'production_adopted':False}
Path('.runtime/kcelectra-fusion-audit.json').write_text(json.dumps(out,indent=2),encoding='utf8');print(json.dumps(out))
