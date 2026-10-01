"""One bounded GPU run from pristine KLUE, observed development selection only."""
import importlib.util,json,random,time,unicodedata,traceback
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
R=Path('.runtime/nuri-1.2-v1');D=Path('local-benchmark/nuri-1.2');BASE=Path('.runtime/klue-base')
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def save(n,x):
 dest=R/(n+'.json');temp=R/(n+'.tmp');temp.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8');temp.replace(dest)
def norm(rs):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rs]
def main():
 assert p.torch.cuda.is_available(),'GPU unavailable';R.mkdir(exist_ok=False);torch=p.torch;torch.set_num_threads(8);random.seed(42);torch.manual_seed(42);torch.cuda.manual_seed_all(42)
 manifest=read(D/'manifest.json')
 for name,h in manifest['files'].items():assert p.digest(D/name)==h
 assert read(D/'audit.json')['truncated_rows']==0
 train=norm(read(D/'train.json'));panels={'new40':norm(read('local-benchmark/a-ft-new-data.json')['development']),'broad120':norm(read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':norm(read('.runtime/klue-retention-v1/development.json'))}
 key=lambda r:json.dumps(r['input'],ensure_ascii=False,sort_keys=True)
 tk={key(r) for r in train};tg={r['group'] for r in train};assert len(tk)==10000
 for rows in panels.values():
  assert not tk&{key(r) for r in rows};assert not tg&{r.get('group') for r in rows}
 files=[*BASE.glob('*'),D/'train.json',D/'manifest.json',Path('local-benchmark/a-ft-new-data.json'),Path('.runtime/klue-broad-development-v1/rows.json'),Path('.runtime/klue-retention-v1/development.json'),Path(__file__),Path('local-benchmark/klue-pilot.py'),Path('docs/nuri12-training-plan.md')]
 frozen={str(f):p.digest(f) for f in files if f.is_file()};save('frozen',frozen)
 tok=p.AutoTokenizer.from_pretrained(BASE,local_files_only=True);ti,tt=p.encoded(tok,train);enc={k:p.encoded(tok,rs)[0] for k,rs in panels.items()};assert tt==0
 def evaluate(model):
  out={}
  for k,rs in panels.items():
   ps,sec=p.predict(model,tok,enc[k],8,'cuda');out[k]={'metrics':p.metrics([r['label'] for r in rs],ps),'seconds':sec,'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rs,ps,strict=True)]}
  return out
 baseline=p.AutoModelForSequenceClassification.from_pretrained('.runtime/klue-cycle3-v1/frozen8/model',local_files_only=True).to('cuda');save('A-development',evaluate(baseline));del baseline;torch.cuda.empty_cache()
 model,loading=p.AutoModelForSequenceClassification.from_pretrained(BASE,local_files_only=True,num_labels=4,id2label=dict(enumerate(p.LABELS)),label2id={x:i for i,x in enumerate(p.LABELS)},output_loading_info=True)
 assert any('classifier' in k for k in loading['missing_keys']), 'Expected fresh classification head'
 model=model.to('cuda');save('initialization',{'base':str(BASE),'loading_info':loading,'trainable_parameters':sum(v.numel() for v in model.parameters() if v.requires_grad),'gpu':torch.cuda.get_device_name(0),'seed':42,'precision':'fp32','epochs':3,'batch':8,'lr':2e-5})
 opt=torch.optim.AdamW(model.parameters(),lr=2e-5,weight_decay=.01);start=time.perf_counter();best=None;history=[];stop=False
 for epoch in range(1,4):
  order=list(range(len(train)));random.Random(42+epoch).shuffle(order);model.train();losses=[]
  for step,i in enumerate(range(0,len(order),8),1):
   if time.perf_counter()-start>3600:stop=True;break
   ix=order[i:i+8];opt.zero_grad(set_to_none=True);out=model(**p.batches(tok,ti,ix,'cuda'),labels=torch.tensor([train[j]['label'] for j in ix],device='cuda'));assert torch.isfinite(out.loss);out.loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(out.loss.item())
   if step%50==0:
    progress={'epoch':epoch,'batch':step,'batches_per_epoch':1250,'mean_loss':sum(losses)/len(losses),'elapsed_seconds':time.perf_counter()-start,'peak_gpu_bytes':torch.cuda.max_memory_allocated()};save('progress',progress);print(json.dumps(progress),flush=True)
  if stop:break
  results=evaluate(model);score=(sum(v['metrics']['macro4_f1'] for v in results.values())/3,sum(v['metrics']['ad_f1'] for v in results.values())/3)
  row={'epoch':epoch,'train_loss':sum(losses)/len(losses),'score':score,'panels':results,'elapsed_seconds':time.perf_counter()-start};history.append(row);save('history',history)
  if best is None or score>best:
   best=score;model.save_pretrained(R/'model');tok.save_pretrained(R/'model');save('selection',{'epoch':epoch,'score':score,'model_hash':p.digest(R/'model/model.safetensors')})
  print(json.dumps({'epoch_complete':epoch,'score':score,'ad_f1':{k:v['metrics']['ad_f1'] for k,v in results.items()}}),flush=True)
 for f,h in frozen.items():assert p.digest(f)==h
 if best is not None:
  del model;torch.cuda.empty_cache();selected=p.AutoModelForSequenceClassification.from_pretrained(R/'model',local_files_only=True).to('cuda');again=evaluate(selected);chosen=history[read(R/'selection.json')['epoch']-1];assert all(again[k]['predictions']==chosen['panels'][k]['predictions'] for k in panels)
 save('completed',{'completed_epochs':len(history),'requested_epochs':3,'time_limit':stop,'seconds':time.perf_counter()-start,'checkpoint_reload_verified':best is not None,'final_evaluation_opened':False,'production_changed':False})
if __name__=='__main__':
 try:main()
 except Exception:
  if R.exists():save('error',{'traceback':traceback.format_exc()})
  raise
