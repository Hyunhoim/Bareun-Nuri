"""Bounded same-data encoder experiment. No operating modules are modified."""
import importlib.util,json,random,time,traceback,gc,unicodedata
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
from huggingface_hub import HfApi,snapshot_download
R=Path('.runtime/encoder-comparison-v1');torch=p.torch
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def save(f,x):
 f=R/f;f.parent.mkdir(parents=True,exist_ok=True);tmp=f.with_suffix('.tmp');tmp.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8');tmp.replace(f)
def norm(rs):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rs]
def main():
 R.mkdir(exist_ok=False);assert torch.cuda.is_available();torch.set_num_threads(8)
 allrows=norm(read('local-benchmark/nuri-1.2/train.json'));groups=sorted({r['group'] for r in allrows});random.Random(42).shuffle(groups);chosen=set(groups[:200]);train=[r for r in allrows if r['group'] in chosen];assert len(train)==2000
 panels={'new40':norm(read('local-benchmark/a-ft-new-data.json')['development']),'broad120':norm(read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':norm(read('.runtime/klue-retention-v1/development.json'))}
 key=lambda r:json.dumps(r['input'],ensure_ascii=False,sort_keys=True)
 for rows in panels.values():assert not {key(r) for r in train}&{key(r) for r in rows}
 save(Path('train.json'),train);save(Path('panels.json'),panels)
 save(Path('manifest.json'),{'train_sha256':p.digest(R/'train.json'),'panels_sha256':p.digest(R/'panels.json'),'plan_sha256':p.digest(Path('docs/encoder-comparison-plan.md')),'torch':torch.__version__,'gpu':torch.cuda.get_device_name(0)})
 bases={'base':Path('.runtime/klue-base')}
 for name,repo in [('kcelectra','beomi/KcELECTRA-base-v2022'),('large','klue/roberta-large')]:
  info=HfApi().model_info(repo);save(Path(name)/'source.json',{'repo':repo,'revision':info.sha})
  print(json.dumps({'download':name,'revision':info.sha}),flush=True)
  folder=R/name/'pretrained';snapshot_download(repo,revision=info.sha,local_dir=folder,allow_patterns=['config.json','model.safetensors','pytorch_model.bin','tokenizer*','vocab.txt','special_tokens_map.json']);bases[name]=folder
 for name,base in bases.items():
  torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42);torch.cuda.reset_peak_memory_stats();start=time.perf_counter()
  tok=p.AutoTokenizer.from_pretrained(base,local_files_only=True);ti,tt=p.encoded(tok,train);encoded={k:p.encoded(tok,rs) for k,rs in panels.items()}
  model=p.AutoModelForSequenceClassification.from_pretrained(base,local_files_only=True,num_labels=4,id2label=dict(enumerate(p.LABELS)),label2id={v:i for i,v in enumerate(p.LABELS)}).to('cuda')
  model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False})
  opt=torch.optim.AdamW(model.parameters(),lr=2e-5,weight_decay=.01);best=None;history=[]
  save(Path(name)/'initial.json',{'parameters':sum(x.numel() for x in model.parameters()),'train_truncated':tt,'dev_truncated':{k:v[1] for k,v in encoded.items()}})
  for epoch in range(1,4):
   order=list(range(len(train)));random.Random(42+epoch).shuffle(order);model.train();losses=[]
   for i in range(0,len(order),8):
    assert time.perf_counter()-start<2400,'40 minute training safety limit';batch=order[i:i+8];opt.zero_grad(set_to_none=True)
    for j in batch:
     with torch.autocast('cuda',dtype=torch.bfloat16):out=model(**p.batches(tok,ti,[j],'cuda'),labels=torch.tensor([train[j]['label']],device='cuda'));loss=out.loss/len(batch)
     assert torch.isfinite(loss);loss.backward();losses.append(out.loss.item())
    torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step()
    if i%400==0:print(json.dumps({'model':name,'epoch':epoch,'seen':i+8,'seconds':time.perf_counter()-start}),flush=True)
   results={}
   for k,rs in panels.items():
    ps,sec=p.predict(model,tok,encoded[k][0],8,'cuda');results[k]={'metrics':p.metrics([r['label'] for r in rs],ps),'predictions':ps,'seconds':sec}
   rank=(sum(x['metrics']['macro4_f1'] for x in results.values())/3,sum(x['metrics']['ad_f1'] for x in results.values())/3)
   record={'epoch':epoch,'rank':rank,'panels':results,'loss':sum(losses)/len(losses)};history.append(record);save(Path(name)/'history.json',history)
   if best is None or rank>best:
    best=rank;model.save_pretrained(R/name/'model');tok.save_pretrained(R/name/'model');save(Path(name)/'selection.json',record)
   print(json.dumps({'model':name,'epoch_complete':epoch,'rank':rank}),flush=True)
  save(Path(name)/'frozen.json',{'sha256':p.digest(R/name/'model/model.safetensors'),'training_seconds':time.perf_counter()-start,'gpu_peak_bytes':torch.cuda.max_memory_allocated()})
  del model,opt,out,loss;gc.collect();torch.cuda.empty_cache()
 # Only after every checkpoint is selected do we open the observed regression.
 rows=norm(read('.runtime/klue-contest-v1/inputs.json'));gold=read('test-set-contest-v1/data/private/gold.json');gm={r['id']:r for r in gold}
 for name,folder in [(n,R/n/'model') for n in bases]+[('A',Path('.runtime/klue-cycle3-v1/frozen8/model'))]:
  start=time.perf_counter();tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cpu');load=time.perf_counter()-start
  start=time.perf_counter();enc,tr=p.encoded(tok,rows);encoding=time.perf_counter()-start;p.predict(model,tok,enc[:8]);pred,sec=p.predict(model,tok,enc)
  save(Path(name)/'regression-predictions.json',[{'id':r['id'],'prediction':v} for r,v in zip(rows,pred,strict=True)])
  def metric(indices):return p.metrics([0 if gm[rows[i]['id']]['is_violation'] else 2 for i in indices],[pred[i] for i in indices])
  result={'overall':metric(range(len(rows))),'by_technique':{t:metric([i for i,r in enumerate(rows) if gm[r['id']]['technique']==t]) for t in sorted({r['technique'] for r in gold})},'cpu_seconds':sec,'load_seconds':load,'encoding_seconds':encoding,'truncated':tr,'rows':len(rows)}
  save(Path(name)/'regression.json',result);print(json.dumps({'cpu_model':name,**result}),flush=True);del model;gc.collect()
 save(Path('completed.json'),{'completed':True,'production_changed':False,'new_final_evaluation':False})
if __name__=='__main__':
 try:main()
 except Exception:
  if R.exists():save(Path('error.json'),{'traceback':traceback.format_exc()})
  raise
