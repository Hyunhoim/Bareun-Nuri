"""One bounded data-improvement trial; new development panel, old evaluation only after selection."""
import importlib.util,json,random,time,unicodedata,collections
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
root=Path('.runtime/klue-audit-learning-v1');out=root/'run-cpu'
def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def norm(rows):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rows]
def save(n,x):(out/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def binary(gold,ps):
 tp=sum(g['is_violation'] and y==0 for g,y in zip(gold,ps,strict=True));fp=sum(not g['is_violation'] and y==0 for g,y in zip(gold,ps,strict=True));fn=sum(g['is_violation'] for g in gold)-tp
 return {'tp':tp,'fp':fp,'fn':fn,'precision':tp/(tp+fp) if tp+fp else None,'recall':tp/(tp+fn),'f1':2*tp/(2*tp+fp+fn),'normal_uncertain':sum(not g['is_violation'] and y==3 for g,y in zip(gold,ps,strict=True))}
def main():
 out.mkdir(exist_ok=False);torch=p.torch;torch.set_num_threads(8);torch.manual_seed(42);device='cpu'
 manifest=read(root/'manifest.json')
 for f,h in manifest['hashes'].items():assert p.digest(root/f)==h
 source=Path('.runtime/klue-cycle3-v1/frozen8/model');freeze={str(f):p.digest(f) for f in [*source.glob('*'),Path(__file__),Path('local-benchmark/klue-audit-learning-data.cjs'),Path('local-benchmark/klue-scoped-context.cjs'),Path('docs/klue-input-audit-plan.md')] if f.is_file()};save('frozen',freeze)
 new=norm(read(root/'train.json'));old=read('.runtime/klue-cycle3-v1/train.json');random.Random(42).shuffle(old);tr=new+norm(old[:1600]);va=norm(read(root/'validation.json'))
 assert not {r['input']['target'] for r in tr}&{r['input']['target'] for r in va}
 tok=p.AutoTokenizer.from_pretrained(source,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True).to(device)
 for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:8]]:
  for v in module.parameters():v.requires_grad=False
 ti,tt=p.encoded(tok,tr);vi,vt=p.encoded(tok,va);labels=[r['label'] for r in va];base,_=p.predict(model,tok,vi,8,device);baseline=p.metrics(labels,base);save('baseline-development',{'metrics':baseline,'predictions':base})
 save('contract',{'device':device,'gpu_preflight_failed_before_training':True,'new_training_rows':len(new),'rehearsal_rows':1600,'validation_rows':len(va),'lr':5e-6,'epochs':2,'seed':42,'batch':8,'new_data_same_author_synthetic':True,'validation_is_development':True,'training_truncated':tt,'validation_truncated':vt})
 opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=5e-6,weight_decay=.01);best=(-1,-1);history=[];start=time.perf_counter()
 for epoch in range(2):
  model.train();ix=list(range(len(tr)));random.Random(42+epoch).shuffle(ix);losses=[]
  for i in range(0,len(ix),8):
   assert time.perf_counter()-start<1800;ids=ix[i:i+8];opt.zero_grad(set_to_none=True);o=model(**p.batches(tok,ti,ids,device),labels=torch.tensor([tr[j]['label'] for j in ids],device=device));assert torch.isfinite(o.loss);o.loss.backward();torch.nn.utils.clip_grad_norm_([v for v in model.parameters() if v.requires_grad],1);opt.step();losses.append(o.loss.item())
   if i%256==0:print(json.dumps({'epoch':epoch+1,'trained':i+len(ids),'total':len(tr),'seconds':time.perf_counter()-start}),flush=True)
  pred,_=p.predict(model,tok,vi,8,device);met=p.metrics(labels,pred);row={'epoch':epoch+1,'loss':sum(losses)/len(losses),'metrics':met,'seconds':time.perf_counter()-start};history.append(row);save('history',history)
  key=(met['ad_f1'],met['macro4_f1'])
  if key>best:best=key;model.save_pretrained(out/'model');tok.save_pretrained(out/'model');save('selection',row);save('development-predictions',pred)
  print(json.dumps(row),flush=True)
 del model;torch.cuda.empty_cache()
 # Original 2,000 labels do not participate in checkpoint selection.
 chosen=p.AutoModelForSequenceClassification.from_pretrained(out/'model',local_files_only=True).to('cpu');rows=norm(read('.runtime/klue-input-audit-v2/corrected-inputs.json'));inp,rt=p.encoded(tok,rows);p.predict(chosen,tok,vi[:8]);pred=[];seconds=0;mark=time.perf_counter()
 with (out/'regression-started.json').open('x') as f:json.dump({'time':time.time(),'model_hash':p.digest(out/'model/model.safetensors')},f)
 for i in range(0,len(inp),128):
  assert time.perf_counter()-mark<1200;chunk,secs=p.predict(chosen,tok,inp[i:i+128]);pred.extend(chunk);seconds+=secs
 save('regression-predictions',[{'id':r['id'],'prediction':y} for r,y in zip(rows,pred,strict=True)])
 g={r['id']:r for r in read('test-set-contest-v1/data/private/gold.json')};gold=[g[r['id']] for r in rows];met=binary(gold,pred);prior={r['id']:r['prediction'] for r in read('.runtime/klue-contest-v1/candidate-predictions.json')};oldpred=[prior[r['id']] for r in rows];before=binary(gold,oldpred)
 changes={k:[] for k in ['lost_tp','gained_tp','fixed_fp','new_fp']}
 for r,x,y in zip(gold,oldpred,pred,strict=True):
  k=('lost_tp' if x==0 and y!=0 else 'gained_tp' if x!=0 and y==0 else None) if r['is_violation'] else ('fixed_fp' if x==0 and y!=0 else 'new_fp' if x!=0 and y==0 else None)
  if k:changes[k].append(r['id'])
 selected=read(out/'selection');result={'development_before':baseline,'development_after':selected['metrics'],'selected_epoch':selected['epoch'],'regression_before':before,'regression_after':met,'regression_seconds':seconds,'regression_truncated':rt,'changes':{k:len(v) for k,v in changes.items()},'by_technique':{},'by_family':{}}
 for key,name in [('technique','by_technique'),('scenario_family','by_family')]:
  for value in sorted({g[key] for g in gold}):
   ids=[i for i,r in enumerate(gold) if r[key]==value];result[name][value]=binary([gold[i] for i in ids],[pred[i] for i in ids]) if any(gold[i]['is_violation'] for i in ids) else {'fp':sum(pred[i]==0 for i in ids),'normal_uncertain':sum(pred[i]==3 for i in ids),'rows':len(ids)}
 result['promising']=selected['metrics']['ad_f1']>=baseline['ad_f1'] and met['f1']>=before['f1'] and met['tp']>=before['tp'] and met['fp']<=before['fp'];result['production_adoption']=False
 for f,h in freeze.items():assert p.digest(f)==h
 save('changes',changes);save('result',result);save('completed',{'complete':True});print(json.dumps({k:v for k,v in result.items() if k not in ['by_family','by_technique']}),flush=True)
if __name__=='__main__':main()
