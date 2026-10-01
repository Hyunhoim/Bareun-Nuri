"""Fixed-budget rehearsal-ratio diagnostic; no test-driven checkpoint selection."""
import importlib.util,json,random,time,unicodedata
from pathlib import Path
s=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
root=Path('.runtime/klue-retention-v1');out=root/'run';source=Path('.runtime/klue-cycle3-v1/frozen8/model')
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def save(n,x):(out/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def norm(rows):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rows]
def main():
 out.mkdir(exist_ok=False);torch=p.torch;torch.set_num_threads(8);device='cuda' if torch.cuda.is_available() else 'cpu'
 for f,h in read(root/'manifest.json')['hashes'].items():assert p.digest(root/f)==h
 freeze={str(f):p.digest(f) for f in [*source.glob('*'),Path(__file__),Path('local-benchmark/klue-retention-data.cjs'),Path('local-benchmark/klue-retention-pairs.json'),Path('docs/klue-retention-plan.md'),root/'manifest.json'] if f.is_file()};save('frozen',freeze)
 tr=norm(read(root/'train.json'));va=norm(read(root/'development.json'));old=norm(read('.runtime/klue-cycle3-v1/train.json'))
 assert not {r['input']['target'] for r in tr+old}&{r['input']['target'] for r in va}
 tok=p.AutoTokenizer.from_pretrained(source,local_files_only=True);ti,tt=p.encoded(tok,tr);oi,ot=p.encoded(tok,old);vi,vt=p.encoded(tok,va);assert tt==vt==0
 model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True).to(device);base,bt=p.predict(model,tok,vi,8,device);del model
 results={'A':{'metrics':p.metrics([r['label'] for r in va],base),'predictions':base,'development_seconds':bt}};save('development-results',results)
 rng=random.Random(42);schedule=[{'new':[rng.randrange(len(tr)) for _ in range(4)],'old':[rng.randrange(len(old)) for _ in range(6)]} for _ in range(64)];save('schedule',schedule)
 save('contract',{'device':device,'steps':64,'lr':2e-6,'batch':8,'new_counts':{'B':4,'C':2},'seed':42,'training_truncated':tt,'development_truncated':vt,'old_training_truncated':ot,'new_rows':len(tr),'development_rows':len(va),'source':str(source),'rehearsal_sha256':p.digest('.runtime/klue-cycle3-v1/train.json')})
 for name,n in [('B',4),('C',2)]:
  torch.manual_seed(42);model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True).to(device)
  for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:8]]:
   for v in module.parameters():v.requires_grad=False
  opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=2e-6,weight_decay=.01);model.train();start=time.perf_counter();losses=[]
  for step,draw in enumerate(schedule):
   assert time.perf_counter()-start<1200
   ni=draw['new'][:n];ri=draw['old'][:8-n];items=[ti[i] for i in ni]+[oi[i] for i in ri];labels=[tr[i]['label'] for i in ni]+[old[i]['label'] for i in ri]
   opt.zero_grad(set_to_none=True);batch=tok.pad(items,padding=True,return_tensors='pt').to(device);o=model(**batch,labels=torch.tensor(labels,device=device));assert torch.isfinite(o.loss);o.loss.backward();torch.nn.utils.clip_grad_norm_([v for v in model.parameters() if v.requires_grad],1);opt.step();losses.append(o.loss.item())
   if (step+1)%16==0:print(json.dumps({'arm':name,'step':step+1,'seconds':time.perf_counter()-start}),flush=True)
  duration=time.perf_counter()-start;pred,secs=p.predict(model,tok,vi,8,device);results[name]={'metrics':p.metrics([r['label'] for r in va],pred),'predictions':pred,'training_seconds':duration,'development_seconds':secs,'mean_loss':sum(losses)/len(losses)}
  model.save_pretrained(out/name);tok.save_pretrained(out/name);del model;save('development-results',results);print(json.dumps({'arm':name,**results[name]['metrics']}),flush=True)
 selected=max(results,key=lambda k:(results[k]['metrics']['ad_f1'],results[k]['metrics']['macro4_f1'],k=='A',k=='B'));save('selection',{'arm':selected,'reason':'development ad F1, macro4, prefer A then B','final_evaluation':False})
 result={'selected':selected,'development':results,'production_adoption':False}
 if selected!='A':
  model=p.AutoModelForSequenceClassification.from_pretrained(out/selected,local_files_only=True).to('cpu');rows=norm(read('.runtime/klue-input-audit-v2/corrected-inputs.json'));encoded,rt=p.encoded(tok,rows);p.predict(model,tok,vi[:8],8,'cpu')
  save('regression-started',{'selected':selected,'model_sha256':p.digest(out/selected/'model.safetensors'),'input_sha256':p.digest('.runtime/klue-input-audit-v2/corrected-inputs.json')});start=time.perf_counter();ps=[];secs=0
  for i in range(0,len(rows),128):
   assert time.perf_counter()-start<600;chunk,t=p.predict(model,tok,encoded[i:i+128],8,'cpu');ps.extend(chunk);secs+=t
  save('regression-predictions',[{'id':r['id'],'prediction':v} for r,v in zip(rows,ps,strict=True)]);save('regression-timing',{'seconds':secs,'truncated':rt})
  gold={g['id']:g for g in read('test-set-contest-v1/data/private/gold.json')};prior={r['id']:r['prediction'] for r in read('.runtime/klue-contest-v1/candidate-predictions.json')};ys=[0 if gold[r['id']]['is_violation'] else 2 for r in rows];bp=[prior[r['id']] for r in rows]
  before=p.metrics(ys,bp);after=p.metrics(ys,ps);changes={'lost_tp':[],'gained_tp':[],'fixed_fp':[],'new_fp':[]}
  for r,y,x,z in zip(rows,ys,bp,ps,strict=True):
   if (x==0)==(z==0):continue
   changes[('lost_tp' if x==0 else 'gained_tp') if y==0 else ('fixed_fp' if x==0 else 'new_fp')].append(r['id'])
  save('changes',changes);result.update({'before':before,'after':after,'changes':{k:len(v) for k,v in changes.items()},'regression_seconds':secs,'diagnostic_gain':after['ad_f1']>before['ad_f1']})
 for f,h in freeze.items():assert p.digest(f)==h
 save('result',result);save('completed',{'complete':True});print(json.dumps({k:v for k,v in result.items() if k!='development'}),flush=True)
if __name__=='__main__':main()
