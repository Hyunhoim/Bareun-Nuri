import json,statistics,math,hashlib
from pathlib import Path
root=Path('.runtime/exaone-hcx-v1')
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
gold=read('.runtime/slm-three/inputs.json');g={(r['panel'],r['id']):r for r in gold}
manifest=read(root/'manifest.json');done=read(root/'completion.json');assert done['status']=='completed'
assert hashlib.sha256(Path('.runtime/slm-three/inputs.json').read_bytes()).hexdigest()==manifest['input_hash']
rows=read(root/'rows.json');assert len(rows)==253
exa=read('.runtime/slm-three/comparison-v4/exaone-rows.json');ep={(r['panel'],r['id']):r['prediction'] for r in exa if r['phase']=='evaluation'}
system=read('.runtime/slm-three/comparison-v4/manifest.json')['system']
def unique(pairs):
 d={}
 for k,v in pairs:
  assert k not in d,'duplicate JSON key'
  d[k]=v
 return d
for row,plan in zip(rows,manifest['plans']):
 raw=read(root/f"{row['index']}-response.json");request=read(root/f"{row['index']}-request.json")
 assert raw['status']==200 and request['body']==plan['body']
 result=json.loads(raw['text'])['result'];assert result['usage']==row['usage']
 assert result['finishReason']=='stop' and row['error'] is None
 pred=json.loads(result['message']['content'],object_pairs_hook=unique)
 assert set(pred)==set(plan['ids'])
 assert [pred[i] for i in plan['ids']]==[r['prediction'] for r in row['rows']]
 assert all(type(v) is int and 0<=v<=3 for v in pred.values())
 msg=plan['body']['messages'];user=json.loads(msg[1]['content'])
 if row['phase'] in ['single','repeat']:
  assert msg[0]['content']==system and user==plan['rows'][0]['input']
 else:
  assert len(user)==len(plan['rows'])
  for u,original in zip(user,plan['rows']):assert {k:u[k] for k in ['target','context']}==original['input']
def metric(items):
 cm=[[0]*4 for _ in range(4)]
 for x in items:cm[g[x['panel'],x['id']]['label']][x['prediction']]+=1
 tp=cm[0][0];fp=cm[1][0]+cm[2][0];fn=sum(cm[0][1:])
 return dict(tp=tp,fp=fp,fn=fn,precision=tp/(tp+fp) if tp+fp else None,recall=tp/(tp+fn),f1=2*tp/(2*tp+fp+fn),confusion=cm,uncertain_as_ad=cm[3][0],uncertain_correct=cm[3][3])
output={}
for phase in ['single','batch12']:
 rr=[r for r in rows if r['phase']==phase];flat=[x for r in rr for x in r['rows']];assert [(r['panel'],r['id']) for r in flat]==list(g)
 dev=[x for x in flat if x['panel']!='human17'];pred={(x['panel'],x['id']):x['prediction'] for x in flat}
 usage={k:sum(r['usage'][k] for r in rr) for k in ['promptTokens','completionTokens','totalTokens']}
 times=sorted(r['seconds'] for r in rr);wait=sum(r['wait_sec'] for r in rr)
 output[phase]={'development':metric(dev),'panels':{p:metric([x for x in dev if x['panel']==p]) for p in ['new40','broad120','ownership44']},'human17_fp':sum(x['prediction']==0 for x in flat if x['panel']=='human17'),'calls':len(rr),'request_seconds':sum(times),'wait_seconds':wait,'request_plus_wait_seconds':sum(times)+wait,'median_request_seconds':statistics.median(times),'p95_request_seconds':times[math.ceil(.95*len(times))-1],'usage':usage,'list_price_krw':usage['promptTokens']*.00125+usage['completionTokens']*.005,'vs_exaone':{ 'lost_tp':sum(v['label']==0 and ep[k]==0 and pred[k]!=0 for k,v in g.items()),'recovered_fn':sum(v['label']==0 and ep[k]!=0 and pred[k]==0 for k,v in g.items()),'resolved_fp':sum(v['label'] in [1,2] and ep[k]==0 and pred[k]!=0 for k,v in g.items()),'new_fp':sum(v['label'] in [1,2] and ep[k]!=0 and pred[k]==0 for k,v in g.items())}}
 if phase=='single':output[phase]['repeat_changes']=sum(x['prediction']!=pred[x['panel'],x['id']] for r in rows if r['phase']=='repeat' for x in r['rows'])
output['total_usage']={k:sum(r['usage'][k] for r in rows) for k in ['promptTokens','completionTokens','totalTokens']}
output['total_list_price_krw']=output['total_usage']['promptTokens']*.00125+output['total_usage']['completionTokens']*.005
output['completion']=done;output['audit']='253 raw responses, predictions, exact input contents and hashes verified; no format errors or truncation'
(root/'report.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(output,ensure_ascii=False,indent=2))
