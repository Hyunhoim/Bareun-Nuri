import importlib.util,json,time,random,unicodedata,argparse
from pathlib import Path
spec=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
torch=p.torch;root=Path('.runtime/klue-cycle2-v3');prior=Path('.runtime/klue-scale-v1')
def read(base,n):return json.loads((base/(n+'.json')).read_text(encoding='utf8'))
def save(base,n,v):(base/(n+'.json')).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def norm(rows):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rows]
def verify():
 for f,h in read(root,'manifest')['hashes'].items():assert p.digest(root/f)==h
def train(name):
 verify();out=root/name;out.mkdir(exist_ok=False);torch.set_num_threads(8);random.seed(42);torch.manual_seed(42);torch.cuda.manual_seed_all(42);assert torch.cuda.is_available()
 source='.runtime/klue-base' if name=='B' else '.runtime/klue-refinement-v1/model';tok=p.AutoTokenizer.from_pretrained(source,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True,num_labels=4).to('cuda')
 save(out,'contract',{'source':source,'code_sha':p.digest(__file__),'data_hashes':read(root,'manifest')['hashes'],'max_epochs':3,'seed':42,'lr':2e-5,'nfc':True})
 tr=norm(read(root,'train'));va=norm(read(root,'validation'));ti,tt=p.encoded(tok,tr);vi,vt=p.encoded(tok,va);opt=torch.optim.AdamW(model.parameters(),lr=2e-5,weight_decay=.01);best=(-1,-1);stale=0;history=[];start=time.perf_counter()
 for epoch in range(3):
  model.train();ids=list(range(len(tr)));random.Random(42+epoch).shuffle(ids);losses=[]
  for i in range(0,len(ids),8):
   assert time.perf_counter()-start<1800;ix=ids[i:i+8];opt.zero_grad(set_to_none=True);o=model(**p.batches(tok,ti,ix,'cuda'),labels=torch.tensor([tr[j]['label'] for j in ix],device='cuda'));assert torch.isfinite(o.loss);o.loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(o.loss.item())
  pred,_=p.predict(model,tok,vi,8,'cuda');m=p.metrics([r['label'] for r in va],pred);row={'epoch':epoch+1,'loss':sum(losses)/len(losses),'validation':m,'seconds':time.perf_counter()-start};history.append(row);save(out,'history',history);key=(m['macro4_f1'],m['ad_f1'])
  if key>best:
   best=key;stale=0;model.save_pretrained(out/'model');tok.save_pretrained(out/'model');save(out,'selection',row);save(out,'validation-predictions',[{'id':r['id'],'prediction':y} for r,y in zip(va,pred,strict=True)])
  else:stale+=1
  print(json.dumps({'model':name,**row}),flush=True)
  if stale>=2 or m['macro4_f1']==1:break
 save(out,'completed',{'seconds':time.perf_counter()-start,'truncated_train':tt,'truncated_validation':vt,'epochs':len(history)})
def final():
 verify();torch.set_num_threads(8);choices=[]
 for f,h in read(root,'sealed-manifest')['hashes'].items():assert p.digest(root/f)==h
 for name in ['B','R']:
  assert (root/name/'completed.json').exists();s=read(root/name,'selection');choices.append((s['validation']['macro4_f1'],s['validation']['ad_f1'],name=='B',name))
 chosen=max(choices)[3];folder=root/chosen/'model'
 assert max(choices)[0]>=.85 and max(choices)[1]>=.9,'Validation gate failed; final remains sealed'
 with (root/'final-started.json').open('x') as f:json.dump({'selected':chosen,'time':time.time(),'selection':'validation only'},f)
 files=[*folder.glob('*'),*Path('.runtime/klue-refinement-v1/model').glob('*'),Path(__file__),Path('local-benchmark/klue-cycle2-data.py'),Path('local-benchmark/klue-cycle2-final-data.py'),Path('docs/klue-cycle2-plan.md'),root/'manifest.json',root/'sealed-manifest.json'];freeze={str(f):p.digest(f) for f in files if f.is_file()};save(root,'frozen',freeze)
 rows=norm(read(root,'sealed-inputs'));outputs={};result={'selected':chosen}
 for name,source in [('baseline',Path('.runtime/klue-refinement-v1/model')),('candidate',folder)]:
  tok=p.AutoTokenizer.from_pretrained(source,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True);inp,tr=p.encoded(tok,rows);warm,_=p.encoded(tok,norm(read(root,'validation')[:8]));p.predict(model,tok,warm);pred,sec=p.predict(model,tok,inp);outputs[name]=pred;save(root,'final-'+name+'-predictions',[{'id':r['id'],'prediction':y} for r,y in zip(rows,pred,strict=True)]);result[name]={'seconds':sec,'truncated':tr};del model;print(json.dumps({'predictions_saved':name,'rows':len(rows),'seconds':sec}),flush=True)
 gold=read(root,'sealed-labels');assert [r['id'] for r in rows]==[r['id'] for r in gold];labels=[r['label'] for r in gold]
 for name,pred in outputs.items():result[name]['metrics']=p.metrics(labels,pred)
 a=result['baseline']['metrics'];b=result['candidate']['metrics'];unknown=sum(y==3 for y in labels);normal=sum(y in [1,2] for y in labels)
 result['final_gate']=b['ad_f1']>=.9 and b['ad_f1']-a['ad_f1']>=.05 and b['recall']>=.9 and b['macro4_f1']>=.85 and b['uncertain_correct']/unknown>=.8 and b['fp']/normal<=.1
 result['regressions']={};model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True)
 for file,suffix in [('corrected-regression','regression'),('legacy-dom-regression','legacy-dom')]:
  reg=norm(read(prior,file));inp,tr=p.encoded(tok,reg);pred,sec=p.predict(model,tok,inp);save(root,suffix+'-predictions',[{'id':r['id'],'prediction':y} for r,y in zip(reg,pred,strict=True)]);m=p.metrics([None if r['is_ad'] is None else 0 if r['is_ad'] else 2 for r in reg],pred);base=read(prior,'baseline-'+suffix+'-result')['metrics'];result['regressions'][suffix]={'baseline':base,'candidate':m,'seconds':sec,'truncated':tr}
 result['regression_gate']=all(x['candidate']['ad_f1']>=x['baseline']['ad_f1']-.02 for x in result['regressions'].values());result['passed']=result['final_gate'] and result['regression_gate'];assert all(p.digest(f)==h for f,h in freeze.items());save(root,'result',result);save(root,'completed',{'completed':True,'passed':result['passed']});print(json.dumps(result),flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['B','R','final']);a=parser.parse_args();final() if a.mode=='final' else train(a.mode)
