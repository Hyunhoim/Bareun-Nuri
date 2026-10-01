"""Controlled context-only vs small exact-codepoint side branch. Research only."""
import importlib.util,json,hashlib,random,time,gc
from pathlib import Path
s=importlib.util.spec_from_file_location('t',Path(__file__).with_name('antispoof-typed.py'));t=importlib.util.module_from_spec(s);s.loader.exec_module(t)
a=t.a;torch=a.torch;nn=torch.nn;R=Path('.runtime/antispoof-channel-v1');SOURCE=Path('agent/models/kcelectra-antispoof-v1')

def cp(n):
 v=[((n>>shift)&255)+1 for shift in [16,8,0]]
 assert sum((v[i]-1)<<shift for i,shift in enumerate([16,8,0]))==n
 return v

def prepare(tok,rows,m):
 text=tok(['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context'] for r in rows],truncation=False,return_token_type_ids=False)
 out=[]
 for i,r in enumerate(rows):
  token=r['token'];chars=[(cp(ord(ch)),[cp(ord(c)) for c in m.get(ch,ch)], [float(t.jamo(ch)),float(ch in m)]) for ch in token]
  protected=len(text['input_ids'][i])>512 or len(chars)>512 or not chars or bool(r.get('collection_truncated'))
  out.append({'text':{k:v[i] for k,v in text.items()},'chars':chars,'protected':protected})
 return out

def batch(tok,rows,device):
 assert all(not r['protected'] for r in rows)
 n=len(rows);length=max(len(r['chars']) for r in rows);width=max(len(c[1]) for r in rows for c in r['chars'])
 src=torch.zeros(n,length,3,dtype=torch.long);dst=torch.zeros(n,length,width,3,dtype=torch.long);flags=torch.zeros(n,length,2);mask=torch.zeros(n,length,dtype=torch.bool)
 for i,r in enumerate(rows):
  for j,(p,m,f) in enumerate(r['chars']):src[i,j]=torch.tensor(p);dst[i,j,:len(m)]=torch.tensor(m);flags[i,j]=torch.tensor(f);mask[i,j]=True
 text=tok.pad([r['text'] for r in rows],padding=True,return_tensors='pt')
 return {k:v.to(device) for k,v in text.items()},[v.to(device) for v in [src,dst,flags,mask]]

class Model(nn.Module):
 def __init__(self,enabled):
  super().__init__();self.base=a.p.AutoModelForSequenceClassification.from_pretrained(SOURCE,local_files_only=True);self.enabled=enabled
  self.byte=nn.Embedding(257,8,padding_idx=0);self.conv=nn.Conv1d(50,32,3,padding=1);self.head=nn.Linear(64,6);nn.init.zeros_(self.head.weight);nn.init.zeros_(self.head.bias)
 def forward(self,text,char):
  logits=self.base(**text).logits
  if not self.enabled:return logits
  src,dst,flags,mask=char;raw=self.byte(src).flatten(-2);mapped=self.byte(dst).flatten(-2);valid=dst[...,0].ne(0).unsqueeze(-1);mapped=(mapped*valid).sum(-2)/valid.sum(-2).clamp_min(1)
  z=self.conv(torch.cat([raw,mapped,flags],dim=-1).transpose(1,2)).transpose(1,2).tanh();mean=(z*mask.unsqueeze(-1)).sum(1)/mask.sum(1,keepdim=True);maximum=z.masked_fill(~mask.unsqueeze(-1),-1e9).max(1).values
  return logits+self.head(torch.cat([mean,maximum],dim=-1))

def predict(model,tok,rows):
 model.eval();result=[]
 with torch.inference_mode():
  for start in range(0,len(rows),8):
   chunk=rows[start:start+8];valid=[i for i,r in enumerate(chunk) if not r['protected']];found={}
   if valid:
    text,char=batch(tok,[chunk[i] for i in valid],'cuda');p=model(text,char).reshape(-1,2,3).softmax(-1);labels=p.argmax(-1);labels[:,1]=torch.where(p[:,1,0]>=.2,0,labels[:,1]);found=dict(zip(valid,labels.cpu().tolist(),strict=True))
   result += [found.get(i,[2,2]) for i in range(len(chunk))]
 return result

def main():
 R.mkdir(exist_ok=False);torch.set_num_threads(8);tok=a.p.AutoTokenizer.from_pretrained(SOURCE,local_files_only=True);m=a.d.c.mapping();rows=[];gold=[]
 for split in ['base','extra']:
  r,g=a.d.load(split);rows+=r;gold+=g
 rows+=a.read(a.d.R/'followup/train-inputs.json');gold+=a.read(a.d.R/'followup/train-gold.json');pairs=[(r,g) for r,g in zip(rows,gold,strict=True) if r['group_id']!='리본/silver'];pairs+=list(zip(a.read(Path('.runtime/antispoof-sparse-v1/train-inputs.json')),a.read(Path('.runtime/antispoof-sparse-v1/train-gold.json')),strict=True))
 digest=hashlib.sha256(json.dumps(pairs,ensure_ascii=False,sort_keys=True).encode()).hexdigest();assert len(pairs)==3035 and digest==a.read(Path('.runtime/antispoof-compact-v1/corrected-data-verification.json'))['sha256']
 train=prepare(tok,[r for r,g in pairs],m);assert all(not r['protected'] for r in train);panels={name:(prepare(tok,r,m),g) for name,(r,g) in a.panels().items()}
 a.save(R/'manifest.json',{'training_rows':len(pairs),'ordered_training_sha256':digest,'script_sha256':a.p.digest(Path(__file__)),'plan_sha256':a.p.digest(Path('docs/antispoof-channel-plan.md')),'source_sha256':a.p.digest(SOURCE/'model.safetensors'),'api':0,'evaluation_training':False})
 for arm in ['context','fused']:
  torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42);model=Model(arm=='fused').to('cuda');folder=R/arm;folder.mkdir();best=None;begin=time.perf_counter()
  side=[p for n,p in model.named_parameters() if not n.startswith('base.')];opt=torch.optim.AdamW([{'params':model.base.parameters(),'lr':1e-5},{'params':side,'lr':1e-3}],weight_decay=.01)
  model.eval();small=prepare(tok,[{'token':'ᄀｂ0','input':{'target':'[표기]ᄀｂ0[/표기]','context':'관찰'}},{'token':'a'*30,'input':{'target':'[표기]'+'a'*30+'[/표기]','context':'다른 자료'}}],m)
  with torch.no_grad():
   text,char=batch(tok,small[:1],'cuda');one=model(text,char);assert torch.allclose(one,model.base(**text).logits,atol=1e-5)
   nn.init.normal_(model.head.weight,std=.02);one=model(text,char);text,char=batch(tok,small,'cuda');two=model(text,char)[:1];assert torch.allclose(one,two,atol=2e-4), 'Padding changed output';nn.init.zeros_(model.head.weight)
  # Reset dropout RNG after checks so both conditions start with the same stream.
  torch.manual_seed(42);torch.cuda.manual_seed_all(42)
  for epoch in [1,2]:
   model.train();order=list(range(len(train)));random.Random(41+epoch).shuffle(order)
   for start in range(0,len(order),8):
    assert time.perf_counter()-begin<1800;ix=order[start:start+8];text,char=batch(tok,[train[i] for i in ix],'cuda');opt.zero_grad(set_to_none=True);logits=model(text,char).reshape(-1,3);y=torch.tensor([pairs[i][1]['labels'] for i in ix],device='cuda').reshape(-1);loss=nn.functional.cross_entropy(logits,y);assert torch.isfinite(loss);loss.backward();nn.utils.clip_grad_norm_(model.parameters(),1);opt.step()
    if start%1024==0:print(arm,epoch,start,round(time.perf_counter()-begin,1),flush=True)
   ep=folder/f'epoch{epoch}';ep.mkdir();metrics={}
   for name,(data,gold) in panels.items():
    pred=predict(model,tok,data);a.save(ep/(name+'-predictions.json'),pred);metrics[name]=a.d.metric([g['labels'] for g in gold],pred)
   score=(metrics['old']['positive_macro_f1']+metrics['role']['HOMOGLYPH']['strict_f1']+metrics['scope']['positive_macro_f1'])/3;key=(score,min(metrics[n]['min_f1'] for n in ['old','scope']),-sum(metrics[n]['normal_false']+metrics[n]['uncertain_false'] for n in metrics));a.save(ep/'metrics.json',metrics)
   if best is None or key>best:best=key;torch.save(model.state_dict(),folder/'model.pt');a.save(folder/'selection.json',{'epoch':epoch,'score':score,'metrics':metrics})
   print(arm,epoch,score,flush=True)
  a.save(folder/'completion.json',{'seconds':time.perf_counter()-begin,'model_sha256':a.p.digest(folder/'model.pt'),'padding_check':True,'zero_branch_check':True});del model,opt;gc.collect();torch.cuda.empty_cache()
 pins=a.read(a.R/'operating-before.json');assert all(a.p.digest(Path(f))==h for f,h in pins.items());a.save(R/'completion.json',{'status':'completed','api':0,'operating_unchanged':True,'final860_access':False})
if __name__=='__main__':main()
