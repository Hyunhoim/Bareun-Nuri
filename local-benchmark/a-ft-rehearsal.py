"""A domain contrast training with 7/8 rehearsal: CE versus stronger old-row KD."""
import importlib.util,json,time,random
from pathlib import Path
s=importlib.util.spec_from_file_location('ft',Path(__file__).with_name('a-finetune.py'));ft=importlib.util.module_from_spec(s);s.loader.exec_module(ft)
p=ft.p;R=Path('.runtime/a-finetune-rehearsal-v1')
def save(n,x):(R/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 assert not ft.read('.runtime/a-finetune-calibration-v1/evaluation/completed.json')['regression_gate']
 R.mkdir(exist_ok=False);torch=p.torch;torch.set_num_threads(8);start_all=time.perf_counter();frozen=ft.read(ft.R/'frozen.json')
 for f,h in frozen.items():assert p.digest(f)==h
 frozen.update({str(f):p.digest(f) for f in [Path(__file__),Path('docs/a-finetune-rehearsal-plan.md'),Path('local-benchmark/a-ft-domain-train.json')]});save('frozen',frozen)
 domain=ft.norm(ft.read('local-benchmark/a-ft-domain-train.json'));old=ft.norm(ft.read('.runtime/klue-cycle3-v1/train.json'));data=ft.read('local-benchmark/a-ft-new-data.json');panels={'new':ft.norm(data['development']),'broad':ft.norm(ft.read('.runtime/klue-broad-development-v1/rows.json')),'ownership':ft.norm(ft.read('.runtime/klue-retention-v1/development.json'))}
 evals=[r for rs in panels.values() for r in rs]+ft.norm(ft.read('.runtime/klue-input-audit-v2/corrected-inputs.json'));assert not {r['input']['target'] for r in domain}&{r['input']['target'] for r in evals}
 rng=random.Random(42);order=list(range(len(domain)));rng.shuffle(order);schedule=[]
 for step in range(128):schedule.extend([domain[order[step%len(order)]]]+[rng.choice(old) for _ in range(7)])
 save('schedule',schedule);base=ft.read(ft.R/'baseline.json');save('baseline',base);tok=p.AutoTokenizer.from_pretrained(ft.SRC,local_files_only=True);ti,tr=p.encoded(tok,schedule);enc={k:p.encoded(tok,rs)[0] for k,rs in panels.items()};teacher=[]
 model=p.AutoModelForSequenceClassification.from_pretrained(ft.SRC,local_files_only=True);model.eval()
 with torch.inference_mode():
  for step in range(128):teacher.append(model(**p.batches(tok,ti,list(range(step*8+1,step*8+8)),'cpu')).logits.cpu())
 torch.save(torch.stack(teacher),R/'teacher-logits.pt');del model;summaries={};save('contract',{'steps':128,'batch':8,'new':1,'rehearsal':7,'lr':2e-6,'seed':42,'KL_weight':2,'T':2,'training_truncated':tr})
 for arm in ['rehearsal_ce','rehearsal_kd']:
  torch.manual_seed(42);model=p.AutoModelForSequenceClassification.from_pretrained(ft.SRC,local_files_only=True)
  for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:8]]:
   for v in module.parameters():v.requires_grad=False
  params=[v for v in model.parameters() if v.requires_grad];opt=torch.optim.AdamW(params,lr=2e-6,weight_decay=.01);start=time.perf_counter();best=None;history=[]
  for step in range(128):
   assert time.perf_counter()-start<1200 and time.perf_counter()-start_all<3600
   model.train();ix=list(range(step*8,step*8+8));opt.zero_grad(set_to_none=True);o=model(**p.batches(tok,ti,ix,'cpu'),labels=torch.tensor([schedule[i]['label'] for i in ix]));loss=o.loss
   if arm=='rehearsal_kd':loss=loss+2*4*torch.nn.functional.kl_div(torch.log_softmax(o.logits[1:]/2,-1),torch.softmax(teacher[step]/2,-1),reduction='batchmean')
   assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(params,1);opt.step()
   if (step+1)%32==0:
    results=ft.evaluate(model,tok,panels,enc);key=ft.score(results,base);record={'step':step+1,'score':key,'panels':results,'seconds_including_validation':time.perf_counter()-start};history.append(record);save(arm+'-history',history)
    if best is None or key>best:
     best=key;model.save_pretrained(R/arm/'model');tok.save_pretrained(R/arm/'model');summaries[arm]=record;save('candidates',summaries)
    print(json.dumps({'arm':arm,'step':step+1,'score':key,'F1':{k:v['metrics']['ad_f1'] for k,v in results.items()}}),flush=True)
  del model
 eligible=[a for a,v in summaries.items() if v['score'][0]];chosen=max(eligible,key=lambda a:(tuple(summaries[a]['score']),-summaries[a]['step'])) if eligible else None
 save('selection',{'arm':chosen,'model_hash':p.digest(R/chosen/'model/model.safetensors') if chosen else None,'confirmation_opened':False})
 for f,h in frozen.items():assert p.digest(f)==h
 save('completed',{'complete':True,'selected':chosen});print(json.dumps({'selected':chosen}),flush=True)
if __name__=='__main__':main()
