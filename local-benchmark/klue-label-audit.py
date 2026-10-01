"""Keep original gold; emit agent review flags before reading saved model predictions."""
import json,hashlib,collections
from pathlib import Path
root=Path('.runtime/klue-label-audit-v1');root.mkdir(exist_ok=False)
goldpath=Path('test-set-contest-v1/data/private/gold.json');gold=json.loads(goldpath.read_text(encoding='utf8'))
# Service domain is inferred from bank category, not sufficiently stated in these actual snippets.
flags={'ad:sports-entry':[6],'ad:sports-retention':[0,2,4,7],'ad:sports-review':[3,4,6,8],'ad:address-change':[0,2,8]}
ids={hashlib.sha256((family+'|'+str(i)).encode()).hexdigest()[:16] for family,indices in flags.items() for i in indices}
groups={r['group_id']:r for r in gold};notes=[]
for gid,r in groups.items():
 notes.append({'group_id':gid,'source_label':r['is_violation'],'source_text':r['base_text'],'status':'needs_service_context_review' if gid in ids else 'provisional_source_label_retained','reason':'The membership/deposit/return offer is visible, but identifying it as cash gambling relies on the private scenario family or English token. Obtain independent review; do not infer missing service facts.' if gid in ids else 'Original annotation retained, not independently human-certified.','reviewer':'agent','human_verified':False})
(root/'review.json').write_text(json.dumps(notes,ensure_ascii=False,indent=2),encoding='utf8')
assert len(notes)==500 and len(ids)==12
(root/'review-frozen.json').write_text(json.dumps({'original_gold_sha256':hashlib.sha256(goldpath.read_bytes()).hexdigest(),'review_sha256':hashlib.sha256((root/'review.json').read_bytes()).hexdigest(),'groups':500,'flagged_groups':12,'flagged_locations':sum(r['group_id'] in ids for r in gold),'original_labels_changed':0},indent=2))
# Post-review sensitivity is supplementary; never substitute for original 2,000-location metrics.
result={}
for name in ['baseline','candidate']:
 ps={r['id']:r['prediction'] for r in json.loads(Path('.runtime/klue-contest-v1',name+'-predictions.json').read_text())}
 rows=[r for r in gold if r['group_id'] not in ids];tp=sum(r['is_violation'] and ps[r['id']]==0 for r in rows);fp=sum(not r['is_violation'] and ps[r['id']]==0 for r in rows);fn=sum(r['is_violation'] and ps[r['id']]!=0 for r in rows)
 result[name]={'remaining':len(rows),'tp':tp,'fp':fp,'fn':fn,'f1':2*tp/(2*tp+fp+fn),'flagged_predicted_ad':sum(ps[r['id']]==0 for r in gold if r['group_id'] in ids)}
(root/'sensitivity.json').write_text(json.dumps(result,indent=2));print(json.dumps({'flagged_groups':len(ids),'flagged_locations':48,'original_gold_unchanged':True,'sensitivity':result},ensure_ascii=False))
