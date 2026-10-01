"""A paired-context CE vs paired-context margin, fixed schedule and held-out gate."""
import importlib.util,json,time,random
from pathlib import Path
s=importlib.util.spec_from_file_location('ft',Path(__file__).with_name('a-finetune.py'));ft=importlib.util.module_from_spec(s);s.loader.exec_module(ft)
p=ft.p;R=Path('.runtime/a-finetune-v3');PREV=ft.R
def save(n,x):(R/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 assert ft.read('.runtime/a-finetune-v2/selection.json')['arm'] is None
 R.mkdir(exist_ok=False);torch=p.torch;torch.set_num_threads(8);total_start=time.perf_counter();freeze=ft.read(PREV/'frozen.json')
 for f,h in freeze.items():assert p.digest(f)==h
 freeze.update({str(f):p.digest(f) for f in [Path(__file__),Path('docs/a-finetune-round3-plan.md'),Path('local-benchmark/a-ft-context-pairs.json'),PREV/'schedule.json']});save('frozen',freeze)
 pairs=ft.norm(ft.read('local-benchmark/a-ft-context-pairs.json'));groups={}
 for r in pairs:groups.setdefault(r['group'],[]).append(r)
 for rs in groups.values():assert len(rs)==4 and {r['label'] for r in rs}==set(range(4)) and len({r['input']['target'] for r in rs})==1
 data=ft.read('local-benchmark/a-ft-new-data.json');panels={'new':ft.norm(data['development']),'broad':ft.norm(ft.read('.runtime/klue-broad-development-v1/rows.json')),'ownership':ft.norm(ft.read('.runtime/klue-retention-v1/development.json'))}
 evals=[r for rs in panels.values() for r in rs]+ft.norm(ft.read('.runtime/klue-input-audit-v2/corrected-inputs.json'));assert not {r['input']['target'] for r in pairs}&{r['input']['target'] for r in evals}
 schedule=ft.read(PREV/'schedule.json');order=list(groups);random.Random(42).shuffle(order)
 for step in range(1,96,2):schedule[step*8:step*8+4]=sorted(groups[order[(step//2)%len(order)]],key=lambda r:r['label'])
 save('schedule',schedule);base=ft.read(PREV/'baseline.json');save('baseline',base);tok=p.AutoTokenizer.from_pretrained(ft.SRC,local_files_only=True);ti,tr=p.encoded(tok,schedule);enc={k:p.encoded(tok,rs)[0] for k,rs in panels.items()};summaries={}
 save('contract',{'steps':96,'batch':8,'lr':2e-6,'seed':42,'pair_groups':len(groups),'pairs':len(pairs),'training_truncated':tr,'margin':1,'margin_weight':.2})
 for arm in ['paired_ce','paired_margin']:
  torch.manual_seed(42);model=p.AutoModelForSequenceClassification.from_pretrained(ft.SRC,local_files_only=True).to('cpu')
  for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:8]]:
   for v in module.parameters():v.requires_grad=False
  params=[v for v in model.parameters() if v.requires_grad];opt=torch.optim.AdamW(params,lr=2e-6,weight_decay=.01);start=time.perf_counter();best=None;history=[]
  for step in range(96):
   assert time.perf_counter()-start<1200 and time.perf_counter()-total_start<3600
   model.train();ix=list(range(step*8,step*8+8));opt.zero_grad(set_to_none=True);o=model(**p.batches(tok,ti,ix,'cpu'),labels=torch.tensor([schedule[i]['label'] for i in ix]));loss=o.loss
   if arm=='paired_margin' and step%2:
    odds=o.logits[:4,0]-torch.logsumexp(o.logits[:4,1:],dim=-1);loss=loss+.2*torch.relu(1-odds[0]+odds[1:]).mean()
   assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(params,1);opt.step()
   if (step+1)%32==0:
    results=ft.evaluate(model,tok,panels,enc);key=ft.score(results,base);record={'step':step+1,'score':key,'panels':results,'seconds_including_validation':time.perf_counter()-start};history.append(record);save(arm+'-history',history)
    if best is None or key>best:
     best=key;model.save_pretrained(R/arm/'model');tok.save_pretrained(R/arm/'model');summaries[arm]=record;save('candidates',summaries)
    print(json.dumps({'arm':arm,'step':step+1,'score':key,'F1':{k:v['metrics']['ad_f1'] for k,v in results.items()}}),flush=True)
  del model
 eligible=[a for a,v in summaries.items() if v['score'][0]];selected=max(eligible,key=lambda a:(tuple(summaries[a]['score']),-summaries[a]['step'])) if eligible else None
 save('selection',{'arm':selected,'model_hash':p.digest(R/selected/'model/model.safetensors') if selected else None,'confirmation_opened':False})
 for f,h in freeze.items():assert p.digest(f)==h
 save('completed',{'complete':True,'selected':selected});print(json.dumps({'selected':selected}),flush=True)
if __name__=='__main__':main()
