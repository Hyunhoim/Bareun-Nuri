import importlib.util,json,random,time,unicodedata,argparse
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
torch=p.torch;root=Path('.runtime/klue-cycle3-v1')
def read(n):return json.loads((root/(n+'.json')).read_text(encoding='utf8'))
def save(out,n,x):(out/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def norm(rows):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rows]
def main(name):
 for f,h in read('manifest')['hashes'].items():assert p.digest(root/f)==h
 out=root/name;out.mkdir(exist_ok=False);torch.set_num_threads(8);random.seed(42);torch.manual_seed(42);torch.cuda.manual_seed_all(42);assert torch.cuda.is_available()
 tok=p.AutoTokenizer.from_pretrained('.runtime/klue-base',local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained('.runtime/klue-base',local_files_only=True,num_labels=4).to('cuda')
 if name=='frozen8':
  assert len(model.roberta.encoder.layer)==12
  for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:8]]:
   for v in module.parameters():v.requires_grad=False
 save(out,'contract',{'variant':name,'code_sha':p.digest(__file__),'data':read('manifest'),'trainable_parameters':sum(v.numel() for v in model.parameters() if v.requires_grad),'lr':1e-5,'seed':42,'epochs':3})
 tr=norm(read('train'));ti,tt=p.encoded(tok,tr);panels={k:norm(v) for k,v in read('development').items()};encoded={k:p.encoded(tok,v)[0] for k,v in panels.items()};opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=1e-5,weight_decay=.01);history=[];best=(-1,-1,-1);start=time.perf_counter()
 for epoch in range(3):
  model.train();ids=list(range(len(tr)));random.Random(42+epoch).shuffle(ids);losses=[]
  for i in range(0,len(ids),8):
   assert time.perf_counter()-start<1800;ix=ids[i:i+8];opt.zero_grad(set_to_none=True);o=model(**p.batches(tok,ti,ix,'cuda'),labels=torch.tensor([tr[j]['label'] for j in ix],device='cuda'));assert torch.isfinite(o.loss);o.loss.backward();torch.nn.utils.clip_grad_norm_([v for v in model.parameters() if v.requires_grad],1);opt.step();losses.append(o.loss.item())
  metrics={};predictions={};unknown=[]
  for k,rows in panels.items():
   pred,_=p.predict(model,tok,encoded[k],8,'cuda');metrics[k]=p.metrics([r['label'] for r in rows],pred);predictions[k]=[{'id':r['id'],'prediction':y} for r,y in zip(rows,pred,strict=True)]
   n=sum(r['label']==3 for r in rows)
   if n:unknown.append(metrics[k]['uncertain_correct']/n)
  fs=[m['ad_f1'] for m in metrics.values()];gate=min(fs)>=.8 and min(unknown)>=.8;key=(int(gate),min(fs),sum(fs)/len(fs));row={'epoch':epoch+1,'train_loss':sum(losses)/len(losses),'minimum_f1':min(fs),'mean_f1':sum(fs)/len(fs),'minimum_uncertain_accuracy':min(unknown),'development_gate':gate,'panels':metrics,'seconds':time.perf_counter()-start};history.append(row);save(out,'history',history)
  if key>best:
   best=key;model.save_pretrained(out/'model');tok.save_pretrained(out/'model');save(out,'selection',row);save(out,'development-predictions',predictions)
  print(json.dumps({'variant':name,**{k:v for k,v in row.items() if k!='panels'},'panel_f1':{k:v['ad_f1'] for k,v in metrics.items()}}),flush=True)
 save(out,'completed',{'seconds':time.perf_counter()-start,'training_truncated':tt})
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('variant',choices=['full','frozen8']);a=parser.parse_args();main(a.variant)
