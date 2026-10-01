"""Second bounded hypothesis: ad-error cost, paired CE vs rehearsal distillation."""
import importlib.util,json,time
from pathlib import Path
s=importlib.util.spec_from_file_location('ft',Path(__file__).with_name('a-finetune.py'));ft=importlib.util.module_from_spec(s);s.loader.exec_module(ft)
p=ft.p;R=Path('.runtime/a-finetune-v2');PREV=ft.R
def save(n,x):(R/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 assert ft.read(PREV/'selection.json')['arm'] is None
 R.mkdir(exist_ok=False);torch=p.torch;torch.set_num_threads(8);start_all=time.perf_counter()
 freeze=ft.read(PREV/'frozen.json')
 for f,h in freeze.items():assert p.digest(f)==h
 freeze.update({str(f):p.digest(f) for f in [Path(__file__),Path('docs/a-finetune-round2-plan.md'),PREV/'schedule.json',PREV/'teacher-logits.pt']});save('frozen',freeze)
 data=ft.read('local-benchmark/a-ft-new-data.json');panels={'new':ft.norm(data['development']),'broad':ft.norm(ft.read('.runtime/klue-broad-development-v1/rows.json')),'ownership':ft.norm(ft.read('.runtime/klue-retention-v1/development.json'))}
 base=ft.read(PREV/'baseline.json');save('baseline',base);schedule=ft.read(PREV/'schedule.json');teacher=torch.load(PREV/'teacher-logits.pt',weights_only=True)
 tok=p.AutoTokenizer.from_pretrained(ft.SRC,local_files_only=True);ti,tr=p.encoded(tok,schedule);enc={k:p.encoded(tok,rs)[0] for k,rs in panels.items()};summaries={}
 save('contract',{'source':str(ft.SRC),'steps':96,'class_weights':[2,1,1,1],'lr':2e-6,'batch':8,'seed':42,'training_truncated':tr,'schedule_hash':p.digest(PREV/'schedule.json')})
 for arm in ['weighted_ce','weighted_distill']:
  torch.manual_seed(42);model=p.AutoModelForSequenceClassification.from_pretrained(ft.SRC,local_files_only=True).to('cpu')
  for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:8]]:
   for v in module.parameters():v.requires_grad=False
  params=[v for v in model.parameters() if v.requires_grad];opt=torch.optim.AdamW(params,lr=2e-6,weight_decay=.01);start=time.perf_counter();best=None;history=[]
  for step in range(96):
   assert time.perf_counter()-start<1200 and time.perf_counter()-start_all<3600
   model.train();ix=list(range(step*8,step*8+8));opt.zero_grad(set_to_none=True);o=model(**p.batches(tok,ti,ix,'cpu'))
   loss=torch.nn.functional.cross_entropy(o.logits,torch.tensor([schedule[i]['label'] for i in ix]),weight=torch.tensor([2.,1.,1.,1.]))
   if arm=='weighted_distill':loss=loss+.5*4*torch.nn.functional.kl_div(torch.log_softmax(o.logits[4:]/2,-1),torch.softmax(teacher[step]/2,-1),reduction='batchmean')
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
