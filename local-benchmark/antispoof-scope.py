"""Matched-update data intervention. Reuses frozen experiment preprocessing."""
import argparse, hashlib, importlib.util, random, time, gc
from pathlib import Path
s=importlib.util.spec_from_file_location('d',Path(__file__).with_name('dual-technique.py'));d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
s=importlib.util.spec_from_file_location('data',Path(__file__).with_name('dual-technique-data.py'));data=importlib.util.module_from_spec(s);s.loader.exec_module(data)
p=d.p;torch=d.torch;R=Path('.runtime/antispoof-scope-v1');read=d.read;save=d.save
PAIRS={
 'train':list(zip(['민원','이웃','미담','지름길','시청','기록','비상','임시','비용','기준','지점','입구'],['amber','bridge','citadel','drizzle','elmwood','fountain','grove','horizon','ivory','kestrel','lattice','mintleaf'])),
 'dev':list(zip(['지문','미간','김치','이끼','시금석','비늘'],['basil','ceramic','estuary','granite','hibiscus','mullion']))}
FRAMES={
 'train':[('이 글에는 {body}라고 썼습니다. 사설방 이용은 작성자에게 연락하세요.','글쓴이의 가입 안내.'),('강의 자료의 {body} 부분을 읽으며 글자 모양을 비교했습니다.','학습 활동 안내.'),('접수 창에 {body} 문구가 보여 문의합니다.','이용자 질문.')],
 'dev':[('신규 참가자는 {body} 공지를 읽고 베팅 입장료를 보내면 됩니다.','게시자가 모집함.'),('도서관 수업 중 {body} 표현을 옮겨 놓고 문자의 형태를 관찰했다.','교사의 관찰 기록.'),('방문 전에 {body} 표시를 확인하려는데 담당 창구가 어디인가요?','주민 문의.') ]}

def prepare():
 R.mkdir(exist_ok=False)
 used={x for groups in data.GROUPS.values() for pair in groups for x in pair}
 for pairs in PAIRS.values():assert not used&{x for pair in pairs for x in pair}
 assert not set(sum((list(p) for p in PAIRS['train']),[]))&set(sum((list(p) for p in PAIRS['dev']),[]))
 for split,pairs in PAIRS.items():
  rows=[];gold=[]
  for k,e in pairs:
   j=data.decompose(k);digit=data.changed(e,dict(zip('oeaisbt','0341587')))
   for h,latin in [(1,e),(0,digit)]:
    for reverse in [False,True]:
     for template,context in FRAMES[split]:
      for focus in ['jamo','latin','both']:
       seq=[j,latin] if not reverse else [latin,j]
       if focus=='both':token=' '.join(seq);marked='[표기]'+token+'[/표기]';label=[0,h]
       else:
        token=j if focus=='jamo' else latin;marked=' '.join('[표기]'+v+'[/표기]' if v==token else v for v in seq);label=[0,1] if focus=='jamo' else [1,h]
       target=template.format(body=marked);raw=target.replace('[표기]','').replace('[/표기]','');start=raw.index(token);rid=hashlib.sha256((target+context).encode()).hexdigest()[:20]
       rows.append({'id':rid,'group_id':k+'/'+e,'token':token,'raw_text':raw,'start':start,'end':start+len(token),'input':{'target':target,'context':context}})
       gold.append({'id':rid,'labels':label,'kind':focus+('_outside_H' if focus=='jamo' and h==0 else ''),'group_id':k+'/'+e})
  assert len({r['id'] for r in rows})==len(rows)
  for r in rows:assert r['raw_text'][r['start']:r['end']]==r['token']
  save(R/f'{split}-inputs.json',rows);save(R/f'{split}-gold.json',gold)
 save(R/'manifest.json',{'files':{f.name:p.digest(f) for f in R.glob('*.json')},'same_author_synthetic':True,'plan_sha256':p.digest(Path('docs/antispoof-scope-plan.md'))})

def panels():
 return {'old':d.load('dev'),'role':(read(d.R/'followup/dev-inputs.json'),read(d.R/'followup/dev-gold.json')),'scope':(read(R/'dev-inputs.json'),read(R/'dev-gold.json'))}

def predict(model,tok,enc):
 model.eval();out=[]
 with torch.inference_mode():
  for i in range(0,len(enc),8):
   probs=model(**p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cuda')).logits.reshape(-1,2,3).softmax(-1);labels=probs.argmax(-1);labels[:,1]=torch.where(probs[:,1,0]>=.2,0,labels[:,1]);out+=labels.cpu().tolist()
 return out

def evaluate(model,tok,encoded,out):
 metrics={}
 for name,(enc,gold) in encoded.items():
  ps=predict(model,tok,enc);m=d.metric([g['labels'] for g in gold],ps)
  m['outside_H_false']=sum(g['kind']=='jamo_outside_H' and v[1]==0 for g,v in zip(gold,ps,strict=True))
  save(out/(name+'-predictions.json'),ps);metrics[name]=m
 values=[metrics['old']['positive_macro_f1'],metrics['role']['HOMOGLYPH']['strict_f1'],metrics['scope']['positive_macro_f1']]
 metrics['score']=sum(values)/3;save(out/'metrics.json',metrics);return metrics

def run(arm, out_root=None, extra_pairs=None):
 assert extra_pairs is None or arm=='scope','Explicit supplemental data requires the scope arm; control resamples base data'
 out=(Path(out_root) if out_root else R)/arm;out.mkdir(parents=True,exist_ok=False)
 for f,h in read(R/'manifest.json')['files'].items():assert p.digest(R/f)==h
 assert p.digest(Path('docs/antispoof-scope-plan.md'))==read(R/'manifest.json')['plan_sha256']
 source=Path('agent/models/kcelectra-antispoof-v1');assert p.digest(source/'model.safetensors')==read(source/'manifest.json')['files']['model.safetensors']
 torch.set_num_threads(8);assert torch.cuda.is_available();torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42)
 tok=p.AutoTokenizer.from_pretrained(source,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True).to('cuda')
 encoded={}
 for name,(rows,gold) in panels().items():
  enc,lens=d.encoded(tok,rows);assert max(lens)<=512;encoded[name]=(enc,gold)
 if arm=='baseline':evaluate(model,tok,encoded,out);return
 rows=[];gold=[]
 for split in ['base','extra']:
  a,b=d.load(split);rows+=a;gold+=b
 rows+=read(d.R/'followup/train-inputs.json');gold+=read(d.R/'followup/train-gold.json')
 pairs=[(r,g) for r,g in zip(rows,gold,strict=True) if r['group_id']!='리본/silver'];assert len(pairs)==2603
 extra=extra_pairs if extra_pairs is not None else list(zip(read(R/'train-inputs.json'),read(R/'train-gold.json'),strict=True))
 pairs+=extra if arm=='scope' else random.Random(42).choices(pairs,k=len(extra))
 save(out/'training-data-audit.json',{'arm':arm,'rows':len(pairs),'supplemental_used':arm=='scope','supplemental_rows':len(extra) if arm=='scope' else 0,'ordered_training_sha256':hashlib.sha256(d.json.dumps(pairs,ensure_ascii=False,sort_keys=True).encode()).hexdigest()})
 train=[r for r,g in pairs];labels=[g['labels'] for r,g in pairs];enc,lens=d.encoded(tok,train);assert max(lens)<=512
 save(out/'started.json',{'rows':len(train),'extra_rows':len(extra),'arm':arm,'source_sha256':p.digest(source/'model.safetensors'),'script_sha256':p.digest(Path(__file__)),'lr':1e-5,'epochs':2,'seed':42})
 opt=torch.optim.AdamW(model.parameters(),lr=1e-5,weight_decay=.01);begin=time.perf_counter();best=None
 for epoch in [1,2]:
  model.train();ix=list(range(len(train)));random.Random(41+epoch).shuffle(ix)
  for i in range(0,len(ix),8):
   assert time.perf_counter()-begin<1800
   ids=ix[i:i+8];opt.zero_grad(set_to_none=True);logits=model(**p.batches(tok,enc,ids,'cuda')).logits.reshape(-1,3);ys=torch.tensor([labels[j] for j in ids],device='cuda').reshape(-1)
   loss=torch.nn.functional.cross_entropy(logits,ys);assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step()
   if i%1024==0:print(arm,epoch,i,round(time.perf_counter()-begin,1),flush=True)
  folder=out/f'epoch{epoch}';folder.mkdir();metrics=evaluate(model,tok,encoded,folder)
  key=(metrics['score'],min(metrics[n]['min_f1'] for n in ['old','scope']),-sum(metrics[n]['normal_false']+metrics[n]['uncertain_false'] for n in ['old','role','scope']))
  if best is None or key>best:
   best=key;model.save_pretrained(out/'model',safe_serialization=True);tok.save_pretrained(out/'model');save(out/'selection.json',{'epoch':epoch,'metrics':metrics})
  print(arm,epoch,metrics['score'],'outside_H_false',metrics['scope']['outside_H_false'],flush=True)
 save(out/'frozen.json',{'sha256':p.digest(out/'model/model.safetensors'),'seconds':time.perf_counter()-begin})
 del model;gc.collect();torch.cuda.empty_cache()

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('action',choices=['prepare','baseline','control','scope']);a=ap.parse_args()
 prepare() if a.action=='prepare' else run(a.action)
