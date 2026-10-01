"""A-style pristine baselines then controlled D/rehearsal updates, isolated."""
import importlib.util,json,random,time,gc,unicodedata,traceback
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p);torch=p.torch
R=Path('.runtime/kcelectra-fusion-v1')
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def save(name,v):
 f=R/(name+'.json');f.parent.mkdir(parents=True,exist_ok=True);tmp=f.with_suffix('.tmp');tmp.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8');tmp.replace(f)
def norm(rs):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rs]
def freeze(model):
 core=model.base_model;assert len(core.encoder.layer)==12
 for mod in [core.embeddings,*core.encoder.layer[:8]]:
  for v in mod.parameters():v.requires_grad=False
def evaluate(model,tok,panels,enc):
 out={}
 for k,rs in panels.items():
  pred,_=p.predict(model,tok,enc[k],8,'cuda');out[k]={'metrics':p.metrics([r['label'] for r in rs],pred),'predictions':pred}
 return out
def rank(result,original=False):
 ms=[x['metrics'] for x in result.values()];fs=[m['ad_f1'] for m in ms]
 if original:
  unknown=[m['uncertain_correct']/sum(m['confusion'][3]) for m in ms if sum(m['confusion'][3])];return (int(min(fs)>=.8 and min(unknown)>=.8),min(fs),sum(fs)/len(fs))
 return (min(fs),sum(fs)/len(fs),sum(m['macro4_f1'] for m in ms)/len(ms))
def main():
 R.mkdir(exist_ok=False);assert torch.cuda.is_available();torch.set_num_threads(8)
 manifest=read('.runtime/klue-cycle3-v1/manifest.json')
 for f,h in manifest['hashes'].items():assert p.digest(Path('.runtime/klue-cycle3-v1')/f)==h
 train=norm(read('.runtime/klue-cycle3-v1/train.json'));original={k:norm(v) for k,v in read('.runtime/klue-cycle3-v1/development.json').items()}
 extra=norm(read('.runtime/klue-audit-learning-v1/train.json'));panels={**original,'D64':norm(read('.runtime/klue-audit-learning-v1/validation.json')),'broad120':norm(read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':norm(read('.runtime/klue-retention-v1/development.json'))}
 key=lambda r:json.dumps(r['input'],ensure_ascii=False,sort_keys=True)
 training={key(r) for r in train+extra}
 for rs in panels.values():assert not training&{key(r) for r in rs},'Training/development exact overlap'
 save('manifest',{'A_train':len(train),'D_train':len(extra),'panels':{k:len(v) for k,v in panels.items()},'data_hashes':{f:p.digest(Path(f)) for f in ['.runtime/klue-cycle3-v1/train.json','.runtime/klue-audit-learning-v1/train.json','docs/kcelectra-fusion-plan.md']}})
 def setup(folder,fresh):
  torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42)
  tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True,**({'num_labels':4} if fresh else {})).to('cuda');freeze(model)
  return tok,model
 def checkpoint(name,model,tok,rec):
  model.save_pretrained(R/name/'model');tok.save_pretrained(R/name/'model');save(name+'/selection',rec)
 def finish(name,start):save(name+'/frozen',{'sha256':p.digest(R/name/'model/model.safetensors'),'seconds':time.perf_counter()-start})
 for name,folder in [('A_replay','.runtime/klue-base'),('K_base','.runtime/encoder-comparison-v1/kcelectra/pretrained')]:
  start=time.perf_counter();tok,model=setup(folder,True);ti,tt=p.encoded(tok,train);enc={k:p.encoded(tok,v)[0] for k,v in original.items()};assert tt==0
  opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=1e-5,weight_decay=.01);history=[];best=None
  for epoch in range(3):
   model.train();order=list(range(len(train)));random.Random(42+epoch).shuffle(order);losses=[]
   for i in range(0,len(order),8):
    assert time.perf_counter()-start<2400;ids=order[i:i+8];opt.zero_grad(set_to_none=True);out=model(**p.batches(tok,ti,ids,'cuda'),labels=torch.tensor([train[j]['label'] for j in ids],device='cuda'));assert torch.isfinite(out.loss);out.loss.backward();torch.nn.utils.clip_grad_norm_([v for v in model.parameters() if v.requires_grad],1);opt.step();losses.append(out.loss.item())
    if i%1600==0:print(json.dumps({'model':name,'epoch':epoch+1,'seen':i+8,'seconds':time.perf_counter()-start}),flush=True)
   results=evaluate(model,tok,original,enc);score=rank(results,True);rec={'epoch':epoch+1,'rank':score,'loss':sum(losses)/len(losses),'panels':results};history.append(rec);save(name+'/history',history)
   if best is None or score>best:best=score;checkpoint(name,model,tok,rec)
   print(json.dumps({'model':name,'epoch_complete':epoch+1,'rank':score}),flush=True)
  finish(name,start);del model,opt,out;gc.collect();torch.cuda.empty_cache()
 # All branches start at the same selected K checkpoint, with equal updates.
 for name,new_count in [('D_only',8),('mix50',4),('mix12',1)]:
  start=time.perf_counter();tok,model=setup(R/'K_base/model',False);old,_=p.encoded(tok,train);new,_=p.encoded(tok,extra);enc={k:p.encoded(tok,v)[0] for k,v in panels.items()};opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=5e-6,weight_decay=.01);best=None;history=[];rng=random.Random(42)
  for step in range(1,129):
   assert time.perf_counter()-start<2400;model.train();ni=rng.sample(range(len(new)),new_count);oi=rng.sample(range(len(old)),8-new_count);items=[new[i] for i in ni]+[old[i] for i in oi];labels=[extra[i]['label'] for i in ni]+[train[i]['label'] for i in oi]
   opt.zero_grad(set_to_none=True);out=model(**tok.pad(items,padding=True,return_tensors='pt').to('cuda'),labels=torch.tensor(labels,device='cuda'));assert torch.isfinite(out.loss);out.loss.backward();torch.nn.utils.clip_grad_norm_([v for v in model.parameters() if v.requires_grad],1);opt.step()
   if step in [64,128]:
    results=evaluate(model,tok,panels,enc);score=rank(results);rec={'step':step,'rank':score,'panels':results};history.append(rec);save(name+'/history',history)
    if best is None or score>best:best=score;checkpoint(name,model,tok,rec)
    print(json.dumps({'model':name,'step':step,'rank':score}),flush=True)
  finish(name,start);del model,opt,out;gc.collect();torch.cuda.empty_cache()
 save('training-completed',{'completed':True,'new_final_opened':False,'production_changed':False})
if __name__=='__main__':
 try:main()
 except Exception:
  if R.exists():save('error',{'traceback':traceback.format_exc()})
  raise
