"""Paired, fixed-budget fine-tuning from A; sealed confirmation stays unopened."""
import importlib.util,json,random,time,unicodedata,hashlib
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
R=Path('.runtime/a-finetune-v1');SRC=Path('.runtime/klue-cycle3-v1/frozen8/model')
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def save(n,x):(R/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def norm(rs):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rs]
def evaluate(model,tok,panels,enc):
 return {k:ev(model,tok,rs,enc[k]) for k,rs in panels.items()}
def ev(model,tok,rows,enc):
 ps,sec=p.predict(model,tok,enc,8,'cpu');return {'metrics':p.metrics([r['label'] for r in rows],ps),'seconds':sec,'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rows,ps,strict=True)]}
def score(results,base):
 m={k:v['metrics'] for k,v in results.items()};b={k:v['metrics'] for k,v in base.items()};avg=sum(v['ad_f1'] for v in m.values())/len(m)
 gate=m['new']['ad_f1']>b['new']['ad_f1'] and avg>sum(v['ad_f1'] for v in b.values())/len(b) and all(m[k]['ad_f1']>=b[k]['ad_f1']-.02 for k in ['broad','ownership']) and m['new']['recall']>=b['new']['recall']-.05 and m['new']['uncertain_as_ad']<=b['new']['uncertain_as_ad']
 return (int(gate),avg,min(v['ad_f1'] for v in m.values()))
def main():
 R.mkdir(exist_ok=False);started=time.perf_counter();torch=p.torch;torch.set_num_threads(8)
 data=read('local-benchmark/a-ft-new-data.json');new=norm(data['train']);old=norm(read('.runtime/klue-cycle3-v1/train.json'))
 panels={'new':norm(data['development']),'broad':norm(read('.runtime/klue-broad-development-v1/rows.json')),'ownership':norm(read('.runtime/klue-retention-v1/development.json'))}
 frozen={str(f):p.digest(f) for f in [*SRC.glob('*'),Path(__file__),Path('local-benchmark/klue-pilot.py'),Path('docs/a-finetune-plan.md'),Path('local-benchmark/a-ft-new-data.json'),Path('local-benchmark/a-ft-confirmation-private.json'),Path('.runtime/klue-cycle3-v1/train.json'),Path('.runtime/klue-broad-development-v1/rows.json'),Path('.runtime/klue-retention-v1/development.json'),Path('.runtime/klue-input-audit-v2/corrected-inputs.json'),Path('.runtime/a-generalization-v1/results.json'),Path('test-set-contest-v1/data/private/gold.json')] if f.is_file()};save('frozen',frozen)
 assert len(frozen)>5
 assert not {r['group'] for r in new}&{r['group'] for r in panels['new']}
 key=lambda r:json.dumps(r['input'],ensure_ascii=False,sort_keys=True)
 evalrows=[*panels['new'],*panels['broad'],*panels['ownership'],*norm(read('.runtime/klue-input-audit-v2/corrected-inputs.json'))]
 overlaps={key(r) for r in new}&{key(r) for r in evalrows};save('exact-input-overlap',{'count':len(overlaps)});assert not overlaps
 tok=p.AutoTokenizer.from_pretrained(SRC,local_files_only=True);enc={k:p.encoded(tok,rs)[0] for k,rs in panels.items()}
 model=p.AutoModelForSequenceClassification.from_pretrained(SRC,local_files_only=True).to('cpu');base=evaluate(model,tok,panels,enc);save('baseline',base)
 rng=random.Random(42);bylabel={y:[r for r in new if r['label']==y] for y in range(4)};assert all(bylabel.values());schedule=[]
 for step in range(96):schedule.extend([rng.choice(bylabel[y]) for y in range(4)]+[rng.choice(old) for _ in range(4)])
 save('schedule',schedule);ti,tr=p.encoded(tok,schedule);teacher=[];model.eval()
 with torch.inference_mode():
  for step in range(96):
   logits=model(**p.batches(tok,ti,list(range(step*8+4,step*8+8)),'cpu')).logits
   teacher.append(logits.cpu())
 torch.save(torch.stack(teacher),R/'teacher-logits.pt');del model
 save('contract',{'steps':96,'batch':8,'lr':2e-6,'seed':42,'T':2,'KL_weight':.5,'training_truncated':tr,'new_rows':len(new),'old_pool':len(old),'device':'cpu','threads':8})
 summaries={}
 for arm,lower in [('ce',8),('distill',8),('last_layer',11)]:
  torch.manual_seed(42);model=p.AutoModelForSequenceClassification.from_pretrained(SRC,local_files_only=True).to('cpu')
  for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:lower]]:
   for v in module.parameters():v.requires_grad=False
  params=[v for v in model.parameters() if v.requires_grad];opt=torch.optim.AdamW(params,lr=2e-6,weight_decay=.01);start=time.perf_counter();best=None;history=[]
  for step in range(96):
   assert time.perf_counter()-start<1200 and time.perf_counter()-started<5400
   model.train();ix=list(range(step*8,step*8+8));opt.zero_grad(set_to_none=True)
   o=model(**p.batches(tok,ti,ix,'cpu'),labels=torch.tensor([schedule[i]['label'] for i in ix]));loss=o.loss
   if arm=='distill':loss=loss+.5*4*torch.nn.functional.kl_div(torch.log_softmax(o.logits[4:]/2,-1),torch.softmax(teacher[step]/2,-1),reduction='batchmean')
   assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(params,1);opt.step()
   if (step+1)%32==0:
    results=evaluate(model,tok,panels,enc);key=score(results,base);record={'step':step+1,'score':key,'panels':results,'seconds_including_validation':time.perf_counter()-start};history.append(record);save(arm+'-history',history)
    if best is None or key>best:
     best=key;model.save_pretrained(R/arm/'model');tok.save_pretrained(R/arm/'model');summaries[arm]=record;save('candidates',summaries)
    print(json.dumps({'arm':arm,'step':step+1,'score':key,'F1':{k:v['metrics']['ad_f1'] for k,v in results.items()}}),flush=True)
  del model
 eligible=[a for a,v in summaries.items() if v['score'][0]]
 selected=max(eligible,key=lambda a:(tuple(summaries[a]['score']),-summaries[a]['step'])) if eligible else None
 save('selection',{'arm':selected,'reason':'predeclared development gates and mean/minimum F1','confirmation_opened':False,'model_hash':p.digest(R/selected/'model/model.safetensors') if selected else None})
 for f,h in frozen.items():assert p.digest(f)==h
 save('completed',{'complete':True,'selected':selected,'production_changes':0});print(json.dumps({'selected':selected}),flush=True)
if __name__=='__main__':main()
