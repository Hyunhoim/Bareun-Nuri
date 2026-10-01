"""Bounded paired freeze/continuation study; no final-set access."""
import importlib.util,json,time,random,traceback,hashlib
from pathlib import Path
s=importlib.util.spec_from_file_location('n',Path(__file__).with_name('nuri12-train.py'));n=importlib.util.module_from_spec(s);s.loader.exec_module(n)
p=n.p;torch=p.torch;R=Path('.runtime/nuri-1.2-freeze-v1')
def save(name,x):
 f=R/(name+'.json');tmp=f.with_suffix('.tmp');tmp.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8');tmp.replace(f)
def stats(results):
 m=[v['metrics'] for v in results.values()];tp=sum(v['tp'] for v in m);fp=sum(v['fp'] for v in m);fn=sum(v['fn'] for v in m)
 return {'ad_f1':2*tp/(2*tp+fp+fn),'recall':tp/(tp+fn),'macro4_mean':sum(v['macro4_f1'] for v in m)/3,'uncertain_as_ad':sum(v['uncertain_as_ad'] for v in m),'tp':tp,'fp':fp,'fn':fn}
def key(results,base,original):
 a,b,c=stats(results),stats(base),stats(original)
 improved=a['ad_f1']>=b['ad_f1']+.02 and a['macro4_mean']>=b['macro4_mean'] and a['recall']>=b['recall'] and a['uncertain_as_ad']<=b['uncertain_as_ad'] and all(results[k]['metrics']['ad_f1']>=base[k]['metrics']['ad_f1']-.02 for k in base)
 replaces=improved and a['ad_f1']>=c['ad_f1'] and a['macro4_mean']>=c['macro4_mean'] and a['recall']>=c['recall']-.02 and a['uncertain_as_ad']<=c['uncertain_as_ad']
 return (int(replaces),int(improved),a['ad_f1'],a['macro4_mean'])
def tensor_hash(model,names):
 h=hashlib.sha256()
 for name,value in model.named_parameters():
  if name in names:h.update(name.encode());h.update(value.detach().cpu().contiguous().numpy().tobytes())
 return h.hexdigest()
def main():
 assert torch.cuda.is_available();R.mkdir(exist_ok=False);torch.set_num_threads(8);start_all=time.perf_counter()
 frozen=n.read(n.R/'frozen.json')
 for f,h in frozen.items():assert p.digest(f)==h
 frozen.update({str(f):p.digest(f) for f in [Path(__file__),Path('docs/nuri12-freeze-plan.md'),n.R/'model/model.safetensors',n.R/'selection.json',n.R/'history.json',n.R/'A-development.json']});save('frozen',frozen)
 tr=n.norm(n.read(n.D/'train.json'));panels={'new40':n.norm(n.read('local-benchmark/a-ft-new-data.json')['development']),'broad120':n.norm(n.read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':n.norm(n.read('.runtime/klue-retention-v1/development.json'))}
 old=n.read(n.R/'history.json')[n.read(n.R/'selection.json')['epoch']-1]['panels'];original=n.read(n.R/'A-development.json');save('baselines',{'Nuri':stats(old),'A':stats(original)})
 tok=p.AutoTokenizer.from_pretrained(n.BASE,local_files_only=True);ti,tt=p.encoded(tok,tr);assert tt==0;enc={k:p.encoded(tok,rs)[0] for k,rs in panels.items()}
 def evaluate(model):
  result={}
  for k,rs in panels.items():
   pred,sec=p.predict(model,tok,enc[k],8,'cuda');result[k]={'metrics':p.metrics([r['label'] for r in rs],pred),'seconds':sec,'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rs,pred,strict=True)]}
  return result
 candidates={};initial_hashes={}
 for arm,source,lower,lr in [('continue_full',n.R/'model',0,5e-6),('continue_freeze8',n.R/'model',8,5e-6),('fresh_full',n.BASE,0,2e-5),('fresh_freeze8',n.BASE,8,2e-5)]:
  torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42)
  model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True,num_labels=4,id2label=dict(enumerate(p.LABELS)),label2id={x:i for i,x in enumerate(p.LABELS)}).to('cuda')
  for module in ([model.roberta.embeddings,*model.roberta.encoder.layer[:lower]] if lower else []):
   for v in module.parameters():v.requires_grad=False
  fixed={name for name,v in model.named_parameters() if not v.requires_grad};before=tensor_hash(model,fixed);initial=tensor_hash(model,{name for name,_ in model.named_parameters()});pair=arm.split('_')[0]
  if pair in initial_hashes:assert initial_hashes[pair]==initial
  else:initial_hashes[pair]=initial
  save(arm+'-contract',{'source':str(source),'initial_hash':initial,'frozen_hash':before,'frozen_tensors':len(fixed),'trainable':sum(v.numel() for v in model.parameters() if v.requires_grad),'lr':lr})
  opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=lr,weight_decay=.01);start=time.perf_counter();history=[];best=None
  for epoch in [1,2]:
   order=list(range(len(tr)));random.Random(42+epoch).shuffle(order);model.train();losses=[]
   for step,i in enumerate(range(0,len(order),8),1):
    assert time.perf_counter()-start<1200 and time.perf_counter()-start_all<4800,'Budget exhausted'
    ix=order[i:i+8];opt.zero_grad(set_to_none=True);out=model(**p.batches(tok,ti,ix,'cuda'),labels=torch.tensor([tr[j]['label'] for j in ix],device='cuda'));assert torch.isfinite(out.loss);out.loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(out.loss.item())
    if step%100==0:save('progress',{'arm':arm,'epoch':epoch,'step':step,'seconds':time.perf_counter()-start_all,'loss':sum(losses)/len(losses)})
    if step in [250,625,1250]:
     results=evaluate(model);score=key(results,old,original);record={'epoch':epoch,'step':step,'global_step':(epoch-1)*1250+step,'score':score,'summary':stats(results),'panels':results,'loss':sum(losses)/len(losses),'seconds':time.perf_counter()-start};history.append(record);save(arm+'-history',history)
     if best is None or score>best:
      best=score;model.save_pretrained(R/arm/'model');tok.save_pretrained(R/arm/'model');candidates[arm]=record;save('candidates',candidates)
     print(json.dumps({'arm':arm,'epoch':epoch,'step':step,'score':score,'summary':stats(results)}),flush=True);model.train()
  assert before==tensor_hash(model,fixed);save(arm+'-complete',{'frozen_equal':True,'seconds':time.perf_counter()-start});del model,opt;torch.cuda.empty_cache()
 chosen=max(candidates,key=lambda k:(tuple(candidates[k]['score']),-candidates[k]['global_step']));save('selection',{'arm':chosen,'model_hash':p.digest(R/chosen/'model/model.safetensors'),'score':candidates[chosen]['score'],'Nuri_improved':bool(candidates[chosen]['score'][1]),'A_development_gate':bool(candidates[chosen]['score'][0])})
 check=p.AutoModelForSequenceClassification.from_pretrained(R/chosen/'model',local_files_only=True).to('cuda');again=evaluate(check);assert all(again[k]['predictions']==candidates[chosen]['panels'][k]['predictions'] for k in panels)
 for f,h in frozen.items():assert p.digest(f)==h
 save('completed',{'seconds':time.perf_counter()-start_all,'reload_verified':True,'paired_initialization_verified':True,'final_opened':False,'production_changes':False});print(json.dumps({'selected':chosen,'score':candidates[chosen]['score']}),flush=True)
if __name__=='__main__':
 try:main()
 except Exception:
  if R.exists():save('error',{'traceback':traceback.format_exc()})
  raise
