"""Replay recorded responses and verify fixed inputs without model calls."""
import json,hashlib
from pathlib import Path
def unique(pairs):
 out={}
 for k,v in pairs:
  assert k not in out,('duplicate JSON key',k)
  out[k]=v
 return out
def read(p):return json.loads(Path(p).read_text(encoding='utf8'),object_pairs_hook=unique)
expected=hashlib.file_digest(open('.runtime/slm-three/inputs.json','rb'),'sha256').hexdigest()
roots=['.runtime/gemma4-cpu/comparison-v2','.runtime/gemma4-cpu/hcx-current','.runtime/gemini35-comparison-v1','.runtime/gemini35-comparison-v1/resume-15rpm']
counts={}
for root in roots:
 p=Path(root);m=read(p/'manifest.json');assert m['input_hash']==expected
 rows=read(p/'rows.json')
 for r in rows:
  i=r['index'];plan=m['plans'][i];saved=read(p/f'{i}-request.json');request=saved.get('body',saved)
  if 'gemini' in root:
   assert request['systemInstruction']['parts'][0]['text']==plan['body']['messages'][0]['content']
   assert request['contents'][0]['parts'][0]['text']==plan['body']['messages'][1]['content']
  else:assert request['messages']==plan['body']['messages']
  raw=read(p/f'{i}-response.json');assert raw['status']==200;response=json.loads(raw['text'],object_pairs_hook=unique)
  if 'gemini' in root:text=''.join(x.get('text','') for x in response['candidates'][0]['content']['parts'] if not x.get('thought'))
  elif 'hcx-current' in root:text=response['result']['message']['content']
  else:text=response['choices'][0]['message']['content']
  answer=json.loads(text,object_pairs_hook=unique)
  assert set(answer)==set(plan['ids'])
  assert all(type(v)==int and 0<=v<=3 for v in answer.values())
  assert [answer[k] for k in plan['ids']]==[x['prediction'] for x in r['rows']]
  assert [x['id'] for x in plan['rows']]==[x['id'] for x in r['rows']]
 counts[root]=len(rows)
phase2=read('test-set-operating-phase2/private/status.json');assert phase2['evaluation_runs']==phase2['training_runs']==0
assert hashlib.file_digest(open('test-set-operating-phase2/manifest.json','rb'),'sha256').hexdigest()=='b9aafb8e33ef6a458eb3b2df295cc9605042a00ceca9c20e2616e897ac9859c8'
Path('.runtime/gemma4-cpu/audit.json').write_text(json.dumps(dict(checked_requests=counts,exact_inputs=True,raw_prediction_match=True,duplicate_keys=0,phase2_unchanged=True),indent=2),encoding='utf8')
print(json.dumps(counts))
