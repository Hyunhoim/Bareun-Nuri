import importlib.util,json,random,time,argparse,unicodedata
from pathlib import Path
spec=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
torch=p.torch;root=Path('.runtime/klue-scale-v1')
def read(n):return json.loads((root/(n+'.json')).read_text(encoding='utf8'))
def save(n,x):(root/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def correction():
 with (root/'correction-started.json').open('x') as f:json.dump({'started':time.time()},f)
 torch.set_num_threads(8);rows=read('corrected-regression');gold=[None if r['is_ad'] is None else 0 if r['is_ad'] else 2 for r in rows];result={}
 for name,path in [('pilot','.runtime/klue-pilot-v2/model'),('refined','.runtime/klue-refinement-v1/model')]:
  tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True);inp,tr=p.encoded(tok,rows);p.predict(model,tok,inp[:8]);pred,sec=p.predict(model,tok,inp);save('correction-'+name+'-predictions',[{'id':r['id'],'prediction':y} for r,y in zip(rows,pred,strict=True)]);result[name]={'metrics':p.metrics(gold,pred),'seconds':sec,'truncated':tr};del model
 save('correction-results',result);print(json.dumps(result),flush=True)
def normalized(rows):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rows]
def train(size,nfc=False):
 manifest=read('data-manifest')
 for f in ['train.json','validation.json']:assert p.digest(root/f)==manifest['hashes'][f]
 out=root/(str(size)+('-nfc' if nfc else ''));out.mkdir(exist_ok=False)
 (out/'run-contract.json').write_text(json.dumps({'size':size,'nfc':nfc,'code_sha':p.digest(__file__),'data_hashes':manifest['hashes'],'seed':42,'max_epochs':4}))
 torch.set_num_threads(8);random.seed(42);torch.manual_seed(42);torch.cuda.manual_seed_all(42);assert torch.cuda.is_available();torch.cuda.reset_peak_memory_stats()
 tok=p.AutoTokenizer.from_pretrained('.runtime/klue-base',local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained('.runtime/klue-base',local_files_only=True,num_labels=4).to('cuda')
 rows=read('train')[:size];val=read('validation')
 if nfc:rows=normalized(rows);val=normalized(val)
 ti,tt=p.encoded(tok,rows);vi,vt=p.encoded(tok,val);opt=torch.optim.AdamW(model.parameters(),lr=2e-5,weight_decay=.01);best=(-1,-1);stale=0;history=[];start=time.perf_counter()
 for epoch in range(4):
  model.train();ids=list(range(size));random.Random(42+epoch).shuffle(ids);losses=[]
  for i in range(0,size,8):
   assert time.perf_counter()-start<3600,'Training safety cap';batch=ids[i:i+8];opt.zero_grad(set_to_none=True);outcome=model(**p.batches(tok,ti,batch,'cuda'),labels=torch.tensor([rows[j]['label'] for j in batch],device='cuda'));assert torch.isfinite(outcome.loss);outcome.loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(outcome.loss.item())
  pred,sec=p.predict(model,tok,vi,8,'cuda');met=p.metrics([r['label'] for r in val],pred);row={'epoch':epoch+1,'train_loss':sum(losses)/len(losses),'validation':met,'elapsed_seconds':time.perf_counter()-start};history.append(row);(out/'history.json').write_text(json.dumps(history,indent=2));key=(met['macro4_f1'],met['ad_f1'])
  if key>best:
   best=key;stale=0;model.save_pretrained(out/'model');tok.save_pretrained(out/'model');(out/'selection.json').write_text(json.dumps(row,indent=2));(out/'validation-predictions.json').write_text(json.dumps([{'id':r['id'],'prediction':y} for r,y in zip(val,pred,strict=True)]))
  else:stale+=1
  print(json.dumps({'size':size,**row}),flush=True)
  # Exact maximum cannot improve; ties always retain the earlier checkpoint.
  if stale>=2 or met['macro4_f1']==1:break
 (out/'completed.json').write_text(json.dumps({'seconds':time.perf_counter()-start,'train_truncated':tt,'validation_truncated':vt,'gpu_peak_bytes':torch.cuda.max_memory_allocated(),'size':size}));del model;torch.cuda.empty_cache()
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('mode',choices=['correction','train']);a.add_argument('--size',type=int,choices=[5000,10000,20000,50000]);a.add_argument('--nfc',action='store_true');args=a.parse_args()
 if args.mode=='correction':correction()
 else:assert args.size;train(args.size,args.nfc)
