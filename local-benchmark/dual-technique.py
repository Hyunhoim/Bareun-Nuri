"""Two independent three-state technique heads. Isolated GPU research runner."""
import argparse,gc,importlib.util,json,random,statistics,subprocess,time
from pathlib import Path
s=importlib.util.spec_from_file_location('c',Path(__file__).with_name('canine-technique.py'));c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
p=c.p;torch=p.torch;R=Path('.runtime/dual-technique-v1');read=c.read;save=c.save
BASES={'klue':Path('.runtime/klue-base'),'kc':Path('.runtime/encoder-comparison-v1/kcelectra/pretrained')}
def load(split):
 a=read(R/f'{split}-inputs.json');b=read(R/f'{split}-gold.json');assert [r['id'] for r in a]==[r['id'] for r in b]
 return a,b
def verify():
 for f,h in read(R/'manifest.json')['files'].items():assert p.digest(R/f)==h,f
 assert p.digest(Path('docs/dual-technique-plan.md'))==read(R/'manifest.json')['plan_sha256']
def encoded(tok,rows):return c.encode(tok,rows,'klue_uts',c.mapping())
def metric(gold,pred):
 result={}
 for j,name in enumerate(['JAMO','HOMOGLYPH']):result[name]=c.t.metric([r[j] for r in gold],[r[j] for r in pred])
 result['positive_macro_f1']=statistics.mean(result[n]['strict_f1'] for n in ['JAMO','HOMOGLYPH'])
 result['min_f1']=min(result[n]['strict_f1'] for n in ['JAMO','HOMOGLYPH'])
 result['normal_false']=sum(result[n]['normal_false'] for n in ['JAMO','HOMOGLYPH'])
 result['uncertain_false']=sum(result[n]['uncertain_false'] for n in ['JAMO','HOMOGLYPH'])
 result['exact_state_accuracy']=sum(a==b for a,b in zip(gold,pred,strict=True))/len(gold)
 result['rows']=len(gold)
 return result
def rank(m):return (m['positive_macro_f1'],m['min_f1'],-m['normal_false']-m['uncertain_false'],m['exact_state_accuracy'])
def predict(model,tok,enc,device='cpu'):
 model.eval();ps=[];start=time.perf_counter()
 with torch.inference_mode():
  for i in range(0,len(enc),8):
   out=model(**p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),device)).logits
   ps.extend(out.reshape(-1,2,3).argmax(-1).cpu().tolist())
 return ps,time.perf_counter()-start
def train(arm,stage):
 verify();torch.set_num_threads(8);assert torch.cuda.is_available();torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42)
 name=arm+'-'+stage;out=R/name;out.mkdir(exist_ok=False);tr,tg=load('base');dev,dg=load('dev')
 if stage!='base':
  assert read(R/'stage1-selection.json')['arm']==arm
  ex,eg=load('extra');tr+=ex;tg+=eg
 if stage=='continue':
  src=R/(arm+'-base/model');assert p.digest(src/'model.safetensors')==read(R/(arm+'-base/frozen.json'))['model_sha256']
 else:src=BASES[arm]
 tok=p.AutoTokenizer.from_pretrained(src,local_files_only=True)
 model=p.AutoModelForSequenceClassification.from_pretrained(src,local_files_only=True,num_labels=6,id2label={i:n for i,n in enumerate(['J_present','J_absent','J_uncertain','H_present','H_absent','H_uncertain'])},label2id={n:i for i,n in enumerate(['J_present','J_absent','J_uncertain','H_present','H_absent','H_uncertain'])}).to('cuda')
 ti,tl=encoded(tok,tr);di,dl=encoded(tok,dev);assert max(tl+dl)<=512,(max(tl),max(dl))
 lr=1e-5 if stage=='continue' else 2e-5;epochs=2 if stage=='continue' else 3
 save(out/'started.json',{'source':str(src),'source_weights_sha256':p.digest(next(iter(src.glob('*.safetensors')),src/'pytorch_model.bin')),'train':len(tr),'dev':len(dev),'learning_rate':lr,'epochs':epochs,'max_length':max(tl+dl),'params':sum(v.numel() for v in model.parameters()),'gpu':torch.cuda.get_device_name(0),'script_sha256':p.digest(Path(__file__)),'unicode_sha256':read(c.ROOT/'sources.json')['unicode_sha256'],'final_opened':False})
 opt=torch.optim.AdamW(model.parameters(),lr=lr,weight_decay=.01);start=time.perf_counter();best=None;history=[]
 for epoch in range(1,epochs+1):
  model.train();ix=list(range(len(tr)));random.Random(41+epoch).shuffle(ix);losses=[]
  for i in range(0,len(ix),8):
   assert time.perf_counter()-start<1800,'Training safety limit';ids=ix[i:i+8];opt.zero_grad(set_to_none=True)
   logits=model(**p.batches(tok,ti,ids,'cuda')).logits.reshape(-1,2,3)
   labels=torch.tensor([tg[j]['labels'] for j in ids],device='cuda')
   loss=torch.nn.functional.cross_entropy(logits.reshape(-1,3),labels.reshape(-1));assert torch.isfinite(loss)
   loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(loss.item())
   if i%320==0:print(json.dumps({'arm':name,'epoch':epoch,'seen':i+len(ids),'seconds':round(time.perf_counter()-start,1)}),flush=True)
  pred,secs=predict(model,tok,di,'cuda');m=metric([r['labels'] for r in dg],pred);rec={'epoch':epoch,'loss':statistics.mean(losses),'development':m,'seconds':time.perf_counter()-start};history.append(rec);save(out/'history.json',history)
  if best is None or rank(m)>best:
   best=rank(m);model.save_pretrained(out/'model',safe_serialization=True);tok.save_pretrained(out/'model');save(out/'selection.json',rec);save(out/'dev-predictions.json',[{'id':r['id'],'labels':v} for r,v in zip(dev,pred,strict=True)])
  print(json.dumps({'arm':name,'epoch':epoch,'metric':m}),flush=True)
 save(out/'frozen.json',{'model_sha256':p.digest(out/'model/model.safetensors'),'training_seconds':time.perf_counter()-start,'updates':epochs*((len(tr)+7)//8),'production_adoption':False,'final_opened':False})
def choose(stage):
 verify()
 if stage=='stage1':names=['klue-base','kc-base'];file=R/'stage1-selection.json'
 else:
  arm=read(R/'stage1-selection.json')['arm'];names=[arm+'-base',arm+'-continue',arm+'-joint'];file=R/'candidate-selection.json'
 assert not file.exists(),'Selection already fixed'
 metrics={name:read(R/name/'selection.json')['development'] for name in names}
 chosen=max(names,key=lambda n:rank(metrics[n]));value={'candidate':chosen,'arm':chosen.split('-')[0],'metrics':metrics,'eligible':metrics[chosen]['min_f1']>=.8,'reason':'fixed development rank, no final or regression selection','sha256':read(R/chosen/'frozen.json')['model_sha256']}
 save(file,value);print(json.dumps(value),flush=True)
def check():
 verify();assert metric([[0,1],[1,0]],[[0,1],[1,0]])['positive_macro_f1']==1
 assert metric([[0,1],[1,0]],[[1,1],[1,1]])['positive_macro_f1']==0
 groups={};texts={}
 for split in ['base','extra','dev','final']:
  # Seal audit only; training never calls this on final.
  rows,g=load(split);groups[split]={r['group_id'] for r in rows};texts[split]={r['input']['target']+'\n'+r['input']['context'] for r in rows}
  for r in rows:assert r['raw_text'][r['start']:r['end']]==r['token']
 for a in groups:
  for b in groups:
   if a!=b:assert not groups[a]&groups[b] and not texts[a]&texts[b]
 rows,_=load('base');r=rows[0];fake={**r,'id':'other','group_id':'changed','labels':[2,2]}
 assert c.adapted([r],'klue_uts',c.mapping())==c.adapted([fake],'klue_uts',c.mapping())
 save(R/'selfcheck.json',{'passed':True,'raw_spans':True,'label_id_invariance':True,'disjoint_groups':True,'final_predictions':0});print('PASS seals, spans, scoring, label noninterference and group splits')
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('action',choices=['check','train','choose']);ap.add_argument('--arm',choices=list(BASES));ap.add_argument('--stage',default='base');a=ap.parse_args()
 if a.action=='train':train(a.arm,a.stage)
 elif a.action=='choose':choose(a.stage)
 else:check()
