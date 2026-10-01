"""Conditional fresh freeze4/freeze10 comparison; same fixed protocol as freeze8."""
import importlib.util,time,random,json,traceback
from pathlib import Path
s=importlib.util.spec_from_file_location('f',Path(__file__).with_name('nuri12-freeze.py'));f=importlib.util.module_from_spec(s);s.loader.exec_module(f)
n=f.n;p=f.p;torch=f.torch;P=f.R;R=Path('.runtime/nuri-1.2-freeze-expand-v1')
def save(name,x):
 path=R/(name+'.json');tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8');tmp.replace(path)
def main():
 assert n.read(P/'summary.json')['pairs']['fresh']['expand'];assert torch.cuda.is_available();R.mkdir(exist_ok=False);torch.set_num_threads(8);started=time.perf_counter()
 frozen=n.read(P/'frozen.json')
 for path,h in frozen.items():assert p.digest(path)==h
 frozen.update({str(path):p.digest(path) for path in [Path(__file__),Path('docs/nuri12-freeze-expansion-plan.md'),P/'summary.json']});save('frozen',frozen)
 tr=n.norm(n.read(n.D/'train.json'));panels={'new40':n.norm(n.read('local-benchmark/a-ft-new-data.json')['development']),'broad120':n.norm(n.read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':n.norm(n.read('.runtime/klue-retention-v1/development.json'))}
 old=n.read(n.R/'history.json')[n.read(n.R/'selection.json')['epoch']-1]['panels'];original=n.read(n.R/'A-development.json');tok=p.AutoTokenizer.from_pretrained(n.BASE,local_files_only=True);ti,tt=p.encoded(tok,tr);assert tt==0;enc={k:p.encoded(tok,rs)[0] for k,rs in panels.items()}
 def evaluate(model):
  out={}
  for k,rs in panels.items():
   pred,sec=p.predict(model,tok,enc[k],8,'cuda');out[k]={'metrics':p.metrics([r['label'] for r in rs],pred),'seconds':sec,'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rs,pred,strict=True)]}
  return out
 candidates={}
 for lower in [4,10]:
  arm='fresh_freeze'+str(lower);torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42)
  model=p.AutoModelForSequenceClassification.from_pretrained(n.BASE,local_files_only=True,num_labels=4,id2label=dict(enumerate(p.LABELS)),label2id={x:i for i,x in enumerate(p.LABELS)}).to('cuda')
  assert f.tensor_hash(model,{name for name,_ in model.named_parameters()})==n.read(P/'fresh_freeze8-contract.json')['initial_hash']
  for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:lower]]:
   for v in module.parameters():v.requires_grad=False
  fixed={name for name,v in model.named_parameters() if not v.requires_grad};before=f.tensor_hash(model,fixed);save(arm+'-contract',{'frozen_tensors':len(fixed),'frozen_hash':before,'lower':lower,'trainable':sum(v.numel() for v in model.parameters() if v.requires_grad),'lr':2e-5,'initialization_matches_freeze8':True})
  opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=2e-5,weight_decay=.01);start=time.perf_counter();history=[];best=None
  for epoch in [1,2]:
   order=list(range(len(tr)));random.Random(42+epoch).shuffle(order);model.train();losses=[]
   for step,i in enumerate(range(0,len(order),8),1):
    assert time.perf_counter()-start<1200 and time.perf_counter()-started<2400
    ix=order[i:i+8];opt.zero_grad(set_to_none=True);out=model(**p.batches(tok,ti,ix,'cuda'),labels=torch.tensor([tr[j]['label'] for j in ix],device='cuda'));assert torch.isfinite(out.loss);out.loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(out.loss.item())
    if step%100==0:save('progress',{'arm':arm,'epoch':epoch,'step':step,'seconds':time.perf_counter()-started})
    if step in [250,625,1250]:
     results=evaluate(model);score=f.key(results,old,original);record={'epoch':epoch,'step':step,'global_step':(epoch-1)*1250+step,'score':score,'summary':f.stats(results),'panels':results,'loss':sum(losses)/len(losses),'seconds':time.perf_counter()-start};history.append(record);save(arm+'-history',history)
     if best is None or score>best:
      best=score;model.save_pretrained(R/arm/'model');tok.save_pretrained(R/arm/'model');candidates[arm]=record;save('candidates',candidates)
     print(json.dumps({'arm':arm,'epoch':epoch,'step':step,'score':score,'summary':f.stats(results)}),flush=True);model.train()
  assert before==f.tensor_hash(model,fixed);save(arm+'-complete',{'frozen_equal':True,'seconds':time.perf_counter()-start});del model,opt;torch.cuda.empty_cache()
 allc={**n.read(P/'candidates.json'),**candidates};chosen=max(allc,key=lambda k:(tuple(allc[k]['score']),-allc[k]['global_step']));src=(R if chosen in candidates else P)/chosen/'model';save('selection',{'arm':chosen,'model_path':str(src),'model_hash':p.digest(src/'model.safetensors'),'score':allc[chosen]['score'],'Nuri_improved':bool(allc[chosen]['score'][1]),'A_development_gate':bool(allc[chosen]['score'][0])})
 model=p.AutoModelForSequenceClassification.from_pretrained(src,local_files_only=True).to('cuda');again=evaluate(model);assert all(again[k]['predictions']==allc[chosen]['panels'][k]['predictions'] for k in panels)
 for path,h in frozen.items():assert p.digest(path)==h
 save('completed',{'seconds':time.perf_counter()-started,'reload_verified':True,'final_opened':False,'production_changes':False});print(json.dumps({'selected':chosen,'score':allc[chosen]['score']}),flush=True)
if __name__=='__main__':
 try:main()
 except Exception:
  if R.exists():save('error',{'traceback':traceback.format_exc()})
  raise
