"""One fixed D continuation: nuisance-title augmentation, no eval training."""
import importlib.util,json,random,time,unicodedata
from pathlib import Path
s=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def norm(rows):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rows]
def main():
 root=Path('.runtime/d-generalization-v1/title-training');root.mkdir(exist_ok=False)
 def save(n,x):(root/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
 torch=p.torch;torch.set_num_threads(8);torch.manual_seed(42);rng=random.Random(42)
 src=Path('.runtime/klue-audit-learning-v1/run-cpu/model');tok=p.AutoTokenizer.from_pretrained(src,local_files_only=True)
 new=norm(read('.runtime/klue-audit-learning-v1/train.json'));old=norm(read('.runtime/klue-cycle3-v1/train.json'))
 panels={'regression':norm(read('.runtime/klue-input-audit-v2/corrected-inputs.json')),'broad':norm(read('.runtime/klue-broad-development-v1/rows.json')),'ownership':norm(read('.runtime/klue-retention-v1/development.json'))}
 # Audit exact input overlap before any updates; all evaluation remains diagnostic.
 train_targets={r['input']['target'] for r in new+old};overlap={k:sum(r['input']['target'] in train_targets for r in rows) for k,rows in panels.items()};save('overlap',overlap)
 assert not any(overlap.values()),overlap
 rows=[]
 for step in range(64):
  draw=[rng.choice(new) for _ in range(2)]+[rng.choice(old) for _ in range(6)]
  for i,r in enumerate(draw):
   inp=dict(r['input'])
   if i%2==0:
    lines=inp['context'].split('\n');assert ':' not in lines[0], 'First line is not a page title'
    inp['context']='\n'.join(([rng.choice(['게시글 보기','시민 참여','열린 게시판'])] if i%4==0 else [])+lines[1:])
   rows.append({**r,'input':inp})
 save('training-inputs',rows);encoded,tr=p.encoded(tok,rows)
 save('contract',{'source':str(src),'steps':64,'lr':2e-6,'seed':42,'batch':8,'new_per_batch':2,'old_per_batch':6,'truncated':tr,'eval_training':False,'independent_holdout':False})
 model=p.AutoModelForSequenceClassification.from_pretrained(src,local_files_only=True).to('cpu')
 for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:8]]:
  for v in module.parameters():v.requires_grad=False
 opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=2e-6,weight_decay=.01);model.train();start=time.perf_counter();losses=[]
 for step in range(64):
  assert time.perf_counter()-start<1200
  a=step*8;batch=tok.pad(encoded[a:a+8],padding=True,return_tensors='pt');opt.zero_grad(set_to_none=True)
  o=model(**batch,labels=torch.tensor([r['label'] for r in rows[a:a+8]]));assert torch.isfinite(o.loss)
  o.loss.backward();torch.nn.utils.clip_grad_norm_([v for v in model.parameters() if v.requires_grad],1);opt.step();losses.append(o.loss.item())
  if (step+1)%16==0:print(json.dumps({'step':step+1,'seconds':time.perf_counter()-start}),flush=True)
 save('training',{'seconds':time.perf_counter()-start,'loss_mean':sum(losses)/len(losses)});model.save_pretrained(root/'model');tok.save_pretrained(root/'model')
 gold={r['id']:r for r in read('test-set-contest-v1/data/private/gold.json')};results={}
 for k,rs in panels.items():
  inputs,tr=p.encoded(tok,rs);ps,sec=p.predict(model,tok,inputs,8,'cpu');ys=[(0 if gold[r['id']]['is_violation'] else 2) if k=='regression' else r['label'] for r in rs]
  results[k]={'metrics':p.metrics(ys,ps),'seconds':sec,'truncated':tr,'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rs,ps,strict=True)]};save('results',results);print(json.dumps({'panel':k,'metrics':results[k]['metrics']}),flush=True)
 save('completed',{'complete':True,'script_sha256':p.digest(__file__),'production_change':False})
if __name__=='__main__':main()
