import importlib.util,json,random,time,gc
from pathlib import Path
s=importlib.util.spec_from_file_location('f',Path(__file__).with_name('kcelectra-fusion.py'));f=importlib.util.module_from_spec(s);s.loader.exec_module(f);p=f.p;torch=p.torch
R=Path('.runtime/kcelectra-distill-v1')
def save(n,x):
 path=R/(n+'.json');path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 R.mkdir(exist_ok=False);torch.set_num_threads(8);assert torch.cuda.is_available()
 old=f.norm(f.read('.runtime/klue-cycle3-v1/train.json'));new=f.norm(f.read('.runtime/klue-audit-learning-v1/train.json'));train=old+new
 panels={k:f.norm(v) for k,v in f.read('.runtime/klue-cycle3-v1/development.json').items()};panels.update({'D64':f.norm(f.read('.runtime/klue-audit-learning-v1/validation.json')),'broad120':f.norm(f.read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':f.norm(f.read('.runtime/klue-retention-v1/development.json'))})
 rng=random.Random(42);batches=[rng.sample(range(len(old)),6)+rng.sample(range(len(old),len(train)),2) for _ in range(256)];used=sorted({j for batch in batches for j in batch});logits={};teacher_hashes={}
 for name,folder,wanted in [('A','.runtime/klue-cycle3-v1/frozen8/model',0),('D','.runtime/klue-audit-learning-v1/run-cpu/model',None)]:
  teacher_hashes[name]=p.digest(Path(folder)/'model.safetensors');tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cuda').eval();ids=[j for j in used if (train[j]['label']==0)==(wanted==0)];enc,tr=p.encoded(tok,[train[j] for j in ids]);assert tr==0
  with torch.inference_mode():
   for i in range(0,len(ids),8):
    scores=model(**p.batches(tok,enc,list(range(i,min(i+8,len(ids)))),'cuda')).logits.cpu().tolist()
    for j,v in zip(ids[i:i+8],scores,strict=True):logits[j]=v
  del model;gc.collect();torch.cuda.empty_cache()
 assert set(logits)==set(used);save('manifest',{'teacher_hashes':teacher_hashes,'train_ids':used,'batches':batches,'plan_hash':p.digest(Path('docs/kcelectra-distill-plan.md'))});save('teacher-logits',logits)
 for name,alpha in [('control',0),('distill',.5)]:
  start=time.perf_counter();torch.manual_seed(42);torch.cuda.manual_seed_all(42);folder=f.R/'K_base/model';tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cuda');f.freeze(model);enc,tr=p.encoded(tok,train);assert tr==0;dev={k:p.encoded(tok,rs)[0] for k,rs in panels.items()};opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=5e-6,weight_decay=.01);history=[];best=None
  for step,ids in enumerate(batches,1):
   assert time.perf_counter()-start<2400;model.train();opt.zero_grad(set_to_none=True);out=model(**p.batches(tok,enc,ids,'cuda'),labels=torch.tensor([train[j]['label'] for j in ids],device='cuda'));teacher=torch.tensor([logits[j] for j in ids],device='cuda');kd=torch.nn.functional.kl_div(torch.log_softmax(out.logits/2,-1),torch.softmax(teacher/2,-1),reduction='batchmean')*4;loss=out.loss+alpha*kd;assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_([v for v in model.parameters() if v.requires_grad],1);opt.step()
   if step in [64,128,256]:
    result=f.evaluate(model,tok,panels,dev);score=f.rank(result);rec={'step':step,'rank':score,'panels':result};history.append(rec);save(name+'/history',history)
    if best is None or score>best:best=score;model.save_pretrained(R/name/'model');tok.save_pretrained(R/name/'model');save(name+'/selection',rec)
    print(json.dumps({'model':name,'step':step,'rank':score}),flush=True)
  save(name+'/frozen',{'sha256':p.digest(R/name/'model/model.safetensors'),'seconds':time.perf_counter()-start});del model,opt,out,loss;gc.collect();torch.cuda.empty_cache()
 rows=f.norm(f.read('.runtime/klue-contest-v1/inputs.json'));gold={r['id']:r for r in f.read('test-set-contest-v1/data/private/gold.json')}
 for name in ['control','distill']:
  folder=R/name/'model';tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True);enc,tr=p.encoded(tok,rows);assert tr==0;p.predict(model,tok,enc[:8]);pred,sec=p.predict(model,tok,enc);save(name+'/predictions',[{'id':r['id'],'prediction':v} for r,v in zip(rows,pred,strict=True)])
  metric=lambda ids:p.metrics([0 if gold[rows[i]['id']]['is_violation'] else 2 for i in ids],[pred[i] for i in ids]);result={'overall':metric(range(len(rows))),'by_technique':{t:metric([i for i,r in enumerate(rows) if gold[r['id']]['technique']==t]) for t in sorted({g['technique'] for g in gold.values()})},'cpu_seconds':sec};save(name+'/result',result);print(json.dumps({'model':name,**result}),flush=True);del model;gc.collect()
 save('completed',{'completed':True,'production_changed':False})
if __name__=='__main__':main()
