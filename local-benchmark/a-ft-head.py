"""Frozen A representations; only its four-way output projection is trained."""
import importlib.util,json,random,time,copy
from pathlib import Path
s=importlib.util.spec_from_file_location('ft',Path(__file__).with_name('a-finetune.py'));ft=importlib.util.module_from_spec(s);s.loader.exec_module(ft)
p=ft.p;R=Path('.runtime/a-finetune-head-v1')
def save(n,x):(R/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 R.mkdir(exist_ok=False);torch=p.torch;torch.set_num_threads(8);started=time.perf_counter();frozen=ft.read(ft.R/'frozen.json')
 for f,h in frozen.items():assert p.digest(f)==h
 for f in [Path(__file__),Path('docs/a-finetune-head-plan.md'),Path('local-benchmark/a-ft-context-pairs.json'),Path('local-benchmark/a-ft-domain-train.json')]:frozen[str(f)]=p.digest(f)
 save('frozen',frozen);data=ft.read('local-benchmark/a-ft-new-data.json');new=ft.norm(data['train']+ft.read('local-benchmark/a-ft-context-pairs.json')+ft.read('local-benchmark/a-ft-domain-train.json'));rng=random.Random(42);old=rng.sample(ft.norm(ft.read('.runtime/klue-cycle3-v1/train.json')),1024)
 panels={'new':ft.norm(data['development']),'broad':ft.norm(ft.read('.runtime/klue-broad-development-v1/rows.json')),'ownership':ft.norm(ft.read('.runtime/klue-retention-v1/development.json'))};base=ft.read(ft.R/'baseline.json');save('baseline',base)
 tok=p.AutoTokenizer.from_pretrained(ft.SRC,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(ft.SRC,local_files_only=True);model.eval()
 for v in model.parameters():v.requires_grad=False
 def features(rows):
  enc,tr=p.encoded(tok,rows);xs=[]
  with torch.no_grad():
   for i in range(0,len(enc),8):
    batch=p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cpu');h=model.roberta(**batch).last_hidden_state[:,0,:];x=torch.tanh(model.classifier.dense(h));z=model.classifier.out_proj(x)
    if i==0:assert torch.allclose(z,model(**batch).logits,atol=1e-5)
    xs.append(x)
  return torch.cat(xs),tr
 nx,nt=features(new);ox,ot=features(old);px={k:features(rs)[0] for k,rs in panels.items()};teacher=model.classifier.out_proj(ox).detach();initial=copy.deepcopy(model.classifier.out_proj.state_dict());frozen_weights={k:v.clone() for k,v in model.state_dict().items() if not k.startswith('classifier.out_proj.')}
 by={y:[i for i,r in enumerate(new) if r['label']==y] for y in range(4)};schedule=[([rng.choice(by[y]) for y in range(4)],[rng.randrange(len(old)) for _ in range(28)]) for _ in range(256)];save('schedule',{'new_ids':[r['id'] for r in new],'old_ids':[r['id'] for r in old],'indices':schedule});save('contract',{'new':len(new),'old':len(old),'trainable':3076,'truncated':[nt,ot]});summaries={}
 for weight in [1,4]:
  arm='head_kd'+str(weight);torch.manual_seed(42);head=model.classifier.out_proj;head.load_state_dict(initial)
  for v in head.parameters():v.requires_grad=True
  opt=torch.optim.AdamW(head.parameters(),lr=1e-4,weight_decay=.01);best=None;history=[]
  for step,(ni,oi) in enumerate(schedule,1):
   opt.zero_grad(set_to_none=True);loss=torch.nn.functional.cross_entropy(head(nx[ni]),torch.tensor([new[i]['label'] for i in ni]))+weight*4*torch.nn.functional.kl_div(torch.log_softmax(head(ox[oi])/2,-1),torch.softmax(teacher[oi]/2,-1),reduction='batchmean');assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(head.parameters(),1);opt.step()
   if step in [64,128,256]:
    results={}
    with torch.no_grad():
     for k,rs in panels.items():
      ps=head(px[k]).argmax(-1).tolist();results[k]={'metrics':p.metrics([r['label'] for r in rs],ps),'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rs,ps)]}
    key=ft.score(results,base);record={'step':step,'score':key,'panels':results};history.append(record);save(arm+'-history',history)
    if best is None or key>best:
     best=key;model.save_pretrained(R/arm/'model');tok.save_pretrained(R/arm/'model');summaries[arm]=record;save('candidates',summaries)
    print(json.dumps({'arm':arm,'step':step,'score':key,'F1':{k:v['metrics']['ad_f1'] for k,v in results.items()}}),flush=True)
  assert all(torch.equal(model.state_dict()[k],v) for k,v in frozen_weights.items())
 eligible=[a for a,v in summaries.items() if v['score'][0]];chosen=max(eligible,key=lambda a:(tuple(summaries[a]['score']),-summaries[a]['step'])) if eligible else None
 save('selection',{'arm':chosen,'model_hash':p.digest(R/chosen/'model/model.safetensors') if chosen else None,'confirmation_opened':False})
 if chosen:
  del frozen_weights,model
  check=p.AutoModelForSequenceClassification.from_pretrained(R/chosen/'model',local_files_only=True);actual=ft.evaluate(check,tok,panels,{k:p.encoded(tok,rs)[0] for k,rs in panels.items()});assert all(actual[k]['predictions']==summaries[chosen]['panels'][k]['predictions'] for k in panels)
 for f,h in frozen.items():assert p.digest(f)==h
 save('completed',{'selected':chosen,'frozen_weights_equal':True,'seconds':time.perf_counter()-started});print(json.dumps({'selected':chosen}),flush=True)
if __name__=='__main__':main()
