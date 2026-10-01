"""Target-pooled Electra diagnostic; same rows/updates as scope augmentation."""
import argparse,importlib.util,random,time
from pathlib import Path
from types import SimpleNamespace
s=importlib.util.spec_from_file_location('a',Path(__file__).with_name('antispoof-scope.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
p=a.p;torch=a.torch;read=a.read;save=a.save;R=Path('.runtime/antispoof-span-v1')

def encoded(tok,rows):
 adapted=a.d.c.adapted(rows,'klue_uts',a.d.c.mapping())
 texts=['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context'] for r in adapted]
 full=tok(texts,truncation=False,return_token_type_ids=False,return_offsets_mapping=True)
 out=[]
 for index,(text,row) in enumerate(zip(texts,rows,strict=True)):
  assert text.count('[표기]')==text.count('[/표기]')==1,'Ambiguous target markers'
  start=text.index('[표기]')+len('[표기]');end=text.index('[/표기]');assert text[start:end]==row['token']
  mask=[]
  for left,right in full['offset_mapping'][index]:
   overlaps=right>left and left<end and right>start
   assert not overlaps or start<=left<right<=end,'Subword crosses target boundary'
   mask.append(int(overlaps))
  assert sum(mask)>0 and len(mask)==len(full['input_ids'][index])
  out.append({**{k:v[index] for k,v in full.items() if k!='offset_mapping'},'target_mask':mask})
 return out,[len(r['input_ids']) for r in out]

def batch(tok,enc,ids,device):
 values=tok.pad([{k:v for k,v in enc[i].items() if k!='target_mask'} for i in ids],padding=True,return_tensors='pt').to(device)
 size=values['input_ids'].shape[1]
 values['target_mask']=torch.tensor([enc[i]['target_mask']+[0]*(size-len(enc[i]['target_mask'])) for i in ids],device=device)
 assert (values['target_mask']<=values['attention_mask']).all()
 return values

class TargetModel(torch.nn.Module):
 def __init__(self,core):super().__init__();self.core=core
 def forward(self,input_ids,attention_mask,target_mask):
  h=self.core.electra(input_ids=input_ids,attention_mask=attention_mask).last_hidden_state
  weights=target_mask.unsqueeze(-1).to(h.dtype);assert (weights.sum(1)>0).all()
  pooled=(h*weights).sum(1)/weights.sum(1)
  return SimpleNamespace(logits=self.core.classifier(pooled.unsqueeze(1)))

def predict(model,tok,enc,device='cuda'):
 model.eval();out=[]
 with torch.inference_mode():
  for i in range(0,len(enc),8):
   probs=model(**batch(tok,enc,list(range(i,min(i+8,len(enc)))),device)).logits.reshape(-1,2,3).softmax(-1);ps=probs.argmax(-1);ps[:,1]=torch.where(probs[:,1,0]>=.2,0,ps[:,1]);out+=ps.cpu().tolist()
 return out

def check(tok):
 rows=read(a.R/'dev-inputs.json');enc,lens=encoded(tok,rows);old,_=a.d.encoded(tok,rows)
 assert [{k:v for k,v in r.items() if k!='target_mask'} for r in enc]==old
 fake=[{**rows[0],'id':'changed','group_id':'fake','labels':[2,2]}]
 assert encoded(tok,fake)[0][0]==enc[0]
 for target in ['plain text','[표기]x[/표기] [표기]y[/표기]']:
  try:encoded(tok,[{**rows[0],'input':{'target':target,'context':''}}])
  except AssertionError:pass
  else:raise AssertionError('Invalid markers accepted')
 save(R/'selfcheck.json',{'rows':len(rows),'original_inputs_equal':True,'label_id_invariance':True,'invalid_markers_rejected':True,'max_tokens':max(lens)})

def evaluate(model,tok,panels,out):
 metrics={}
 for name,(enc,gold) in panels.items():
  ps=predict(model,tok,enc);m=a.d.metric([g['labels'] for g in gold],ps)
  m['outside_H_false']=sum(g['kind']=='jamo_outside_H' and v[1]==0 for g,v in zip(gold,ps,strict=True))
  save(out/(name+'-predictions.json'),ps);metrics[name]=m
 metrics['score']=(metrics['old']['positive_macro_f1']+metrics['role']['HOMOGLYPH']['strict_f1']+metrics['scope']['positive_macro_f1'])/3
 save(out/'metrics.json',metrics);return metrics

def train():
 R.mkdir(exist_ok=False);source=Path('agent/models/kcelectra-antispoof-v1')
 assert p.digest(source/'model.safetensors')==read(source/'manifest.json')['files']['model.safetensors']
 for f,h in read(a.R/'manifest.json')['files'].items():assert p.digest(a.R/f)==h
 torch.set_num_threads(8);assert torch.cuda.is_available();torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42)
 tok=p.AutoTokenizer.from_pretrained(source,local_files_only=True);check(tok)
 model=TargetModel(p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True)).to('cuda')
 rows=[];gold=[]
 for split in ['base','extra']:
  x,y=a.d.load(split);rows+=x;gold+=y
 rows+=read(a.d.R/'followup/train-inputs.json');gold+=read(a.d.R/'followup/train-gold.json')
 pairs=[(r,g) for r,g in zip(rows,gold,strict=True) if r['group_id']!='리본/silver']
 pairs+=list(zip(read(a.R/'train-inputs.json'),read(a.R/'train-gold.json'),strict=True));assert len(pairs)==3035
 enc,lens=encoded(tok,[r for r,g in pairs]);assert max(lens)<=512;labels=[g['labels'] for r,g in pairs];panels={}
 for name,(rs,gs) in a.panels().items():
  es,ls=encoded(tok,rs);assert max(ls)<=512;panels[name]=(es,gs)
 save(R/'started.json',{'source_sha256':p.digest(source/'model.safetensors'),'rows':len(pairs),'seed':42,'lr':1e-5,'epochs':2,'pooling':'target-mean','H_threshold':.2,'plan_sha256':p.digest(Path('docs/antispoof-span-plan.md')),'script_sha256':p.digest(Path(__file__))})
 opt=torch.optim.AdamW(model.parameters(),lr=1e-5,weight_decay=.01);begin=time.perf_counter();best=None
 for epoch in [1,2]:
  model.train();ix=list(range(len(enc)));random.Random(41+epoch).shuffle(ix)
  for i in range(0,len(ix),8):
   assert time.perf_counter()-begin<1800;ids=ix[i:i+8];opt.zero_grad(set_to_none=True)
   logits=model(**batch(tok,enc,ids,'cuda')).logits.reshape(-1,3);ys=torch.tensor([labels[j] for j in ids],device='cuda').reshape(-1)
   loss=torch.nn.functional.cross_entropy(logits,ys);assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step()
   if i%1024==0:print('span',epoch,i,round(time.perf_counter()-begin,1),flush=True)
  out=R/f'epoch{epoch}';out.mkdir();metrics=evaluate(model,tok,panels,out)
  key=(metrics['score'],min(metrics[n]['min_f1'] for n in ['old','scope']),-sum(metrics[n]['normal_false']+metrics[n]['uncertain_false'] for n in ['old','role','scope']))
  if best is None or key>best:
   best=key;model.core.save_pretrained(R/'model',safe_serialization=True);tok.save_pretrained(R/'model');save(R/'selection.json',{'epoch':epoch,'metrics':metrics,'pooling':'target-mean'})
  print('span',epoch,metrics['score'],'outside_H_false',metrics['scope']['outside_H_false'],flush=True)
 save(R/'frozen.json',{'sha256':p.digest(R/'model/model.safetensors'),'pooling':'target-mean','seconds':time.perf_counter()-begin})

if __name__=='__main__':train()
