import importlib.util,json,random,time,gc
from pathlib import Path
s=importlib.util.spec_from_file_location('f',Path(__file__).with_name('kcelectra-fusion.py'));f=importlib.util.module_from_spec(s);s.loader.exec_module(f);p=f.p;torch=p.torch;R=Path('.runtime/kcelectra-freeze-v1')
def save(n,x):
 path=R/(n+'.json');path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 R.mkdir(exist_ok=False);torch.set_num_threads(8);assert torch.cuda.is_available();train=f.norm(f.read('.runtime/klue-cycle3-v1/train.json'));panels={k:f.norm(v) for k,v in f.read('.runtime/klue-cycle3-v1/development.json').items()};base='.runtime/encoder-comparison-v1/kcelectra/pretrained'
 save('manifest',{'plan_hash':p.digest(Path('docs/kcelectra-freeze-plan.md')),'train_hash':p.digest(Path('.runtime/klue-cycle3-v1/train.json'))})
 for name,n in [('freeze4',4),('full',0)]:
  torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42);start=time.perf_counter();tok=p.AutoTokenizer.from_pretrained(base,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(base,local_files_only=True,num_labels=4).to('cuda')
  if n:
   for mod in [model.base_model.embeddings,*model.base_model.encoder.layer[:n]]:
    for v in mod.parameters():v.requires_grad=False
  enc,tr=p.encoded(tok,train);assert tr==0;dev={k:p.encoded(tok,v)[0] for k,v in panels.items()};opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=1e-5,weight_decay=.01);best=None;history=[]
  for epoch in range(3):
   model.train();ix=list(range(len(train)));random.Random(42+epoch).shuffle(ix);losses=[]
   for i in range(0,len(ix),8):
    assert time.perf_counter()-start<2400;ids=ix[i:i+8];opt.zero_grad(set_to_none=True);out=model(**p.batches(tok,enc,ids,'cuda'),labels=torch.tensor([train[j]['label'] for j in ids],device='cuda'));assert torch.isfinite(out.loss);out.loss.backward();torch.nn.utils.clip_grad_norm_([v for v in model.parameters() if v.requires_grad],1);opt.step();losses.append(out.loss.item())
    if i%2000==0:print(json.dumps({'model':name,'epoch':epoch+1,'seen':i+8,'seconds':time.perf_counter()-start}),flush=True)
   results=f.evaluate(model,tok,panels,dev);rank=f.rank(results,True);rec={'epoch':epoch+1,'rank':rank,'loss':sum(losses)/len(losses),'panels':results};history.append(rec);save(name+'/history',history)
   if best is None or rank>best:best=rank;model.save_pretrained(R/name/'model');tok.save_pretrained(R/name/'model');save(name+'/selection',rec)
   print(json.dumps({'model':name,'epoch_complete':epoch+1,'rank':rank}),flush=True)
  save(name+'/frozen',{'sha256':p.digest(R/name/'model/model.safetensors'),'seconds':time.perf_counter()-start});del model,opt,out;gc.collect();torch.cuda.empty_cache()
 rows=f.norm(f.read('.runtime/klue-contest-v1/inputs.json'));gold={r['id']:r for r in f.read('test-set-contest-v1/data/private/gold.json')};context={'D64':f.norm(f.read('.runtime/klue-audit-learning-v1/validation.json')),'broad120':f.norm(f.read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':f.norm(f.read('.runtime/klue-retention-v1/development.json'))}
 for name in ['freeze4','full']:
  folder=R/name/'model';tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True);enc,tr=p.encoded(tok,rows);assert tr==0;p.predict(model,tok,enc[:8]);ps,secs=p.predict(model,tok,enc);save(name+'/predictions',[{'id':r['id'],'prediction':v} for r,v in zip(rows,ps,strict=True)])
  metric=lambda ids:p.metrics([0 if gold[rows[i]['id']]['is_violation'] else 2 for i in ids],[ps[i] for i in ids]);result={'overall':metric(range(len(rows))),'by_technique':{t:metric([i for i,r in enumerate(rows) if gold[r['id']]['technique']==t]) for t in sorted({g['technique'] for g in gold.values()})},'cpu_seconds':secs,'context':{}}
  for k,rs in context.items():
   es,_=p.encoded(tok,rs);pred,_=p.predict(model,tok,es);result['context'][k]=p.metrics([r['label'] for r in rs],pred)
  save(name+'/result',result);print(json.dumps({'model':name,**result}),flush=True);del model;gc.collect()
 save('completed',{'completed':True,'production_changed':False})
if __name__=='__main__':main()
