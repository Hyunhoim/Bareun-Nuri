"""Frozen CPU inference. Labels are read only after all predictions are saved."""
import importlib.util,json,time,gc,unicodedata,collections,platform
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
R=Path('.runtime/phase1-classifiers-v1')
read=lambda f:json.loads(Path(f).read_text(encoding='utf8'))
def save(n,x):(R/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def metric(rows,pred):
 tp=sum(r['ad'] and pred.get(r['id'])==0 for r in rows);fp=sum(not r['ad'] and pred.get(r['id'])==0 for r in rows);fn=sum(r['ad'] for r in rows)-tp
 return dict(n=len(rows),tp=tp,fp=fp,fn=fn,precision=tp/(tp+fp) if tp+fp else 0,recall=tp/(tp+fn) if tp+fn else 0,f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0)
def main():
 m=read(R/'manifest.json');assert not (R/'started.json').exists();save('started',{'time':time.time()})
 for f,h in m['hashes'].items():assert p.digest(f)==h,f
 rows=read(R/'inputs.json');p.torch.set_num_threads(8);timing={}
 for name,folder in m['models'].items():
  start=time.perf_counter();tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cpu');load=time.perf_counter()-start
  start=time.perf_counter();texts=['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context'] for r in rows];lengths=[len(x) for x in tok(texts,truncation=False,return_token_type_ids=False)['input_ids']];enc,tr=p.encoded(tok,rows);encoding=time.perf_counter()-start
  assert tr==sum(x>512 for x in lengths);p.predict(model,tok,enc[:8]);pred=[];seconds=0
  for i in range(0,len(enc),256):
   ps,sec=p.predict(model,tok,enc[i:i+256]);pred.extend(ps);seconds+=sec
   print(json.dumps({'model':name,'done':len(pred),'seconds':seconds}),flush=True)
  save(name+'-predictions',[dict(id=r['id'],prediction=y,tokens=n,truncated=n>512) for r,y,n in zip(rows,pred,lengths,strict=True)])
  timing[name]=dict(load_seconds=load,encoding_seconds=encoding,inference_seconds=seconds,truncated=tr,cpu_threads=8,batch=8,device='cpu');save('timing',timing);del model;gc.collect()
 # Independent model inference is complete before labels and HCX outcomes enter evaluation.
 source=Path(m['source']);hcx=read(source/'quarantine-tail/evaluation.json')['rows'];gold=[json.loads(x) for x in (source/'gold-frozen.jsonl').read_text(encoding='utf8').splitlines()]
 node_by_gold={}
 import re
 for page in read(source/'scan/checkpoint.json')['state']['pages']:
  snap=read(source/'scan'/page['evidence']['file'])
  from urllib.parse import urlsplit
  for c in snap['candidates']:
   found=re.search(r'#n([a-f0-9]{14})(?![a-f0-9])',c['location'])
   if found:node_by_gold[(urlsplit(c['url']).path,found[1])]=c['node_id']
 common=[r for r in hcx if r['judged']];hpred={r['id']:0 if r['predicted'] else 3 if r['review'] else 2 for r in hcx};result={'HCX_common':metric(common,hpred),'HCX_all':metric(hcx,hpred),'models':{}}
 for name in m['models']:
  ps={r['id']:r for r in read(R/(name+'-predictions.json'))};pred={r['id']:ps[node_by_gold[(r['page'],r['id'])]]['prediction'] for r in hcx if (r['page'],r['id']) in node_by_gold};safe={r['id']:3 if ps[node_by_gold[(r['page'],r['id'])]]['truncated'] else pred[r['id']] for r in hcx if r['id'] in pred}
  changes={k:[] for k in ['lost_tp','gained_tp','fixed_fp','new_fp']}
  for r in common:
   x,y=r['predicted'],pred.get(r['id'])==0;k=('lost_tp' if x and not y else 'gained_tp' if y and not x else None) if r['ad'] else ('fixed_fp' if x and not y else 'new_fp' if y and not x else None)
   if k:changes[k].append(r['id'])
  save(name+'-changes',changes)
  result['models'][name]={'common':metric(common,pred),'all':metric(hcx,pred),'safe_common':metric(common,safe),'common_truncated':sum(ps[node_by_gold[(r['page'],r['id'])]]['truncated'] for r in common),'changes':{k:len(v) for k,v in changes.items()},'timing':timing[name],'by_role':{v:metric([r for r in common if r['role']==v],pred) for v in sorted({r['role'] for r in common})},'by_technique':{v:metric([r for r in common if r['primary']==v],pred) for v in sorted({r['primary'] for r in common})},'by_stratum':{v:metric([r for r in common if r['stratum']==v],pred) for v in sorted({r['stratum'] for r in common})},'uncertain_common':sum(pred.get(r['id'])==3 for r in common)}
 # Exact training overlap only: this cannot establish semantic independence.
 train=read('.runtime/klue-cycle3-v1/train.json')+read('.runtime/klue-audit-learning-v1/train.json')
 norm=lambda v:unicodedata.normalize('NFC',v);targets={norm(r['input']['target']) for r in train};pairs={(norm(r['input']['target']),norm(r['input']['context'])) for r in train};overlap=[r['id'] for r in rows if r['input']['target'] in targets];full=[r['id'] for r in rows if (r['input']['target'],r['input']['context']) in pairs]
 result['overlap']={'target_nodes':len(overlap),'full_inputs':len(full),'labeled_target_overlap':sum(node_by_gold.get((r['page'],r['id'])) in set(overlap) for r in hcx),'note':'Known A8000 and D supplemental source rows; not semantic/template leakage proof'}
 result['machine']={'platform':platform.platform(),'torch':p.torch.__version__};result['collection_context_truncated']=sum(r['collection_truncated'] for r in rows)
 for f,h in m['hashes'].items():assert p.digest(f)==h,f
 save('summary',result);save('completed',{'complete':True,'new_api_calls':0,'new_training':0,'operating_change':False});print(json.dumps(result),flush=True)
if __name__=='__main__':main()
