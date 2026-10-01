import importlib.util,json,unicodedata
from pathlib import Path
from safetensors import safe_open
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
root=Path('.runtime/klue-cycle3-v1');read=lambda base,n:json.loads((base/(n+'.json')).read_text(encoding='utf8'))
assert read(root,'completed')['completed']
for f,h in read(root,'frozen').items():assert p.digest(f)==h
for base in [root,root/'final-dom']:
 for f,h in read(base,'manifest')['hashes'].items():assert p.digest(base/f)==h
chosen=read(root,'result')['selected'];prefixes=['roberta.embeddings.']+[f'roberta.encoder.layer.{i}.' for i in range(8)];checked=0
with safe_open('.runtime/klue-base/model.safetensors',framework='pt',device='cpu') as base,safe_open(str(root/chosen/'model/model.safetensors'),framework='pt',device='cpu') as model:
 for k in model.keys():
  if any(k.startswith(prefix) for prefix in prefixes):assert p.torch.equal(base.get_tensor(k),model.get_tensor(k)),k;checked+=1
assert checked>=100
def score(gold,pred):
 by={r['id']:r['prediction'] for r in pred};assert len(by)==len(gold);cm=[[0]*4 for _ in range(4)]
 for r in gold:
  n=by[r['id']];assert n in range(4)
  if r['label'] is not None:cm[r['label']][n]+=1
 tp=cm[0][0];fp=cm[1][0]+cm[2][0];fn=sum(cm[0][1:]);return {'confusion':cm,'tp':tp,'fp':fp,'fn':fn,'f1':2*tp/(2*tp+fp+fn),'uncertain_correct':cm[3][3]}
gold=read(root/'final-dom','labels');result={'frozen_tensors_equal':checked,'final':{},'cpu_regression':{}}
for name in ['baseline','candidate']:
 m=score(gold,read(root,'final-'+name+'-predictions'));assert m['confusion']==read(root,'result')[name]['metrics']['confusion'];result['final'][name]=m
inputs=read(root/'final-dom','inputs');seen=set();unique=[]
for i,r in enumerate(inputs):
 key=unicodedata.normalize('NFC',json.dumps(r['input'],ensure_ascii=False,sort_keys=True))
 if key not in seen:seen.add(key);unique.append(i)
result['deduplicated']={'rows':len(unique)}
for name in ['baseline','candidate']:
 ps=read(root,'final-'+name+'-predictions');result['deduplicated'][name]=score([gold[i] for i in unique],[ps[i] for i in unique])
# Only observed development panels are re-inferred for CPU verification, never final.
p.torch.set_num_threads(8);folder=root/chosen/'model';tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True);panels=read(root,'development');gpu=read(root/chosen,'development-predictions')
for name,suffix in [('replica','regression'),('legacy','legacy-dom')]:
 rows=[{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in panels[name]];inp,tr=p.encoded(tok,rows);pred,_=p.predict(model,tok,inp);saved=[{'id':r['id'],'prediction':y} for r,y in zip(rows,pred,strict=True)];assert saved==gpu[name],'CPU/GPU predictions differ';base={r['id']:r['prediction'] for r in read(Path('.runtime/klue-scale-v1'),'baseline-'+suffix+'-predictions')};now={r['id']:r['prediction'] for r in saved};m=score(rows,saved);m['lost_tp']=[r['id'] for r in rows if r['label']==0 and base[r['id']]==0 and now[r['id']]!=0];m['gained_tp']=[r['id'] for r in rows if r['label']==0 and base[r['id']]!=0 and now[r['id']]==0];m['fixed_fp']=[r['id'] for r in rows if r['label']==2 and base[r['id']]==0 and now[r['id']]!=0];m['new_fp']=[r['id'] for r in rows if r['label']==2 and base[r['id']]!=0 and now[r['id']]==0];result['cpu_regression'][name]=m
result['status']='passed';(root/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result),flush=True)
