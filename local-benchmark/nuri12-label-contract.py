"""One controlled freeze8/250-step run changing only the victim label contract."""
import importlib.util,json,random,time
from pathlib import Path
s=importlib.util.spec_from_file_location('f',Path(__file__).with_name('nuri12-freeze.py'));f=importlib.util.module_from_spec(s);s.loader.exec_module(f)
n=f.n;p=f.p;torch=f.torch;R=Path('.runtime/nuri-1.2-label-contract-v1')
def save(k,x):(R/(k+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 R.mkdir(exist_ok=False);torch.set_num_threads(8);assert torch.cuda.is_available();tr=n.norm(n.read(n.D/'train.json'));meta={r['id']:r for r in n.read(n.D/'provenance.json')};old=n.norm(n.read(n.D/'train.json'));changed=[]
 for r in tr:
  if meta[r['id']]['template_family']=='victim_request':assert r['label']==1;r['label']=2;changed.append(r['id'])
 assert len(changed)==1000;assert all(a['input']==b['input'] and a['group']==b['group'] for a,b in zip(old,tr,strict=True));save('train',tr);save('label-diff',{'count':1000,'ids':changed,'from':1,'to':2,'input_changed':0,'human_reviewed':False,'reason':'Victim inquiries belong to ordinary class under pre-existing development/review contract; generated family metadata only, no evaluation-based relabel.'})
 panels={'new40':n.norm(n.read('local-benchmark/a-ft-new-data.json')['development']),'broad120':n.norm(n.read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':n.norm(n.read('.runtime/klue-retention-v1/development.json'))}
 tok=p.AutoTokenizer.from_pretrained(n.BASE,local_files_only=True);ti,tt=p.encoded(tok,tr);assert tt==0;enc={k:p.encoded(tok,rs)[0] for k,rs in panels.items()};torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42)
 model=p.AutoModelForSequenceClassification.from_pretrained(n.BASE,local_files_only=True,num_labels=4,id2label=dict(enumerate(p.LABELS)),label2id={x:i for i,x in enumerate(p.LABELS)}).to('cuda');assert f.tensor_hash(model,{k for k,_ in model.named_parameters()})==n.read(f.R/'fresh_freeze8-contract.json')['initial_hash']
 for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:8]]:
  for v in module.parameters():v.requires_grad=False
 fixed={k for k,v in model.named_parameters() if not v.requires_grad};before=f.tensor_hash(model,fixed);opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=2e-5,weight_decay=.01);order=list(range(len(tr)));random.Random(43).shuffle(order);model.train();started=time.perf_counter();losses=[]
 frozen={str(path):p.digest(path) for path in [Path(__file__),Path('docs/nuri12-shortcut-plan.md'),n.D/'train.json',n.D/'provenance.json',n.BASE/'model.safetensors',f.R/'fresh_freeze8/model/model.safetensors']};save('frozen',frozen)
 for step in range(250):
  ix=order[step*8:step*8+8];opt.zero_grad(set_to_none=True);out=model(**p.batches(tok,ti,ix,'cuda'),labels=torch.tensor([tr[j]['label'] for j in ix],device='cuda'));assert torch.isfinite(out.loss);out.loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(out.loss.item())
  if (step+1)%50==0:print(json.dumps({'step':step+1,'loss':sum(losses)/len(losses)}),flush=True)
 def evaluate(m):
  result={}
  for k,rs in panels.items():
   ps,sec=p.predict(m,tok,enc[k],8,'cuda');result[k]={'metrics':p.metrics([r['label'] for r in rs],ps),'seconds':sec,'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rs,ps)]}
  return result
 result=evaluate(model);save('development',result);save('summary',f.stats(result));assert f.tensor_hash(model,fixed)==before;model.save_pretrained(R/'model');tok.save_pretrained(R/'model');del model,opt;torch.cuda.empty_cache();model=p.AutoModelForSequenceClassification.from_pretrained(R/'model',local_files_only=True).to('cuda');again=evaluate(model);assert all(again[k]['predictions']==result[k]['predictions'] for k in result)
 for path,h in frozen.items():assert p.digest(path)==h
 save('completed',{'seconds':time.perf_counter()-started,'steps':250,'same_initialization':True,'frozen_layers_unchanged':True,'reload_verified':True,'final_opened':False,'human_reviewed_data_experiment':False,'model_sha256':p.digest(R/'model/model.safetensors')});print(json.dumps(f.stats(result)),flush=True)
if __name__=='__main__':main()
