"""Bounded density/role data intervention; old regression words never trained."""
import argparse,gc,importlib.util,json,random,statistics,time,hashlib
from pathlib import Path
s=importlib.util.spec_from_file_location('d',Path(__file__).with_name('dual-technique.py'));d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
s=importlib.util.spec_from_file_location('data',Path(__file__).with_name('dual-technique-data.py'));data=importlib.util.module_from_spec(s);s.loader.exec_module(data)
p=d.p;torch=d.torch;R=d.R;F=R/'followup';save=d.save;read=d.read
NUM=dict(zip('oeaisbt','0341587'));CYR=dict(zip('aceopxyis','асеорхуіѕ'))
FRAMES={
 'train': [('이번 모집글 제목을 {x}로 적었습니다. 입장 신청은 제게 연락하세요.','같은 글의 본문은 사설 베팅장 이용자를 모집하는 내용입니다.',0),('글자 모양을 바꿔 적은 예시가 {x}입니다. 낯설게 보여도 단어를 읽는 연습을 합니다.','수업자료의 표현을 그대로 옮긴 글입니다.',0),('사설방 연결키는 {x}입니다. 이 값은 시스템에서 발급한 식별값이라 숫자나 글자를 바꾸면 조회가 안 됩니다.','담당자가 원래 키 값을 전달한 요소입니다.',1),('게시물에서 {x}라는 표기를 발견했는데 단어를 바꿔 쓴 것인지 고유 이름인지 확인할 문장이 남아 있지 않습니다.','대상 표기의 용도를 확인할 원자료가 없습니다.',2)],
 'dev': [('행사 이름은 {x}입니다. 사설방 신규 이용자 접수 중이니 메시지 주십시오.','모집자가 적은 홍보 문장.',0),('칠판의 {x}는 같은 단어를 다른 모양의 문자로 써 본 것입니다.','학생의 문자 표현 실습 기록.',0),('담당자에게 {x} 식별번호를 알려 주면 등록된 항목이 나옵니다. 번호를 다른 글자로 고치면 다른 항목이 됩니다.','조회에 필요한 원래 식별번호를 옮긴 글.',1),('남은 자료로는 {x}가 별명인지 우회해서 쓴 말인지 구별할 수 없네요.','그 앞뒤 내용은 확보하지 못했습니다.',2)],
 'final': [('지금 {x} 행사 열었습니다. 사설 사이트 참여 원하시면 입장비부터 보내 주세요.','글 작성자의 가입 안내.',0),('수업 중 {x}처럼 비슷하게 생긴 문자로 바꿔도 읽을 수 있는지 살펴봤어요.','학습 활동의 기록.',0),('고객 관리 항목의 원래 키는 {x}입니다. 대소문자와 숫자가 구별되는 키라 한 자리도 고치지 않고 옮겼습니다.','시스템 조회용 식별값의 전달.',1),('누가 {x}라고만 적어 두었는데 어떤 용도로 정한 이름인지 자료가 없어서 설명을 못 하겠습니다.','이 문자열 외에는 작성 경위를 알 수 없습니다.',2)]}
def mutations(word):
 out=[]
 for table in [NUM,CYR]:
  sites=[i for i,ch in enumerate(word) if ch.lower() in table]
  for i in sites:
   x=word[:i]+table[word[i].lower()]+word[i+1:]
   if x not in out:out.append(x)
 # Even coverage of positions and scripts; cap size without choosing by model failures.
 return out[:4]+out[-4:] if len(out)>8 else out
def prepare():
 F.mkdir(exist_ok=False);manifest={'files':{},'same_author_synthetic':True,'final_opened':False,'plan_hash':p.digest(Path('docs/dual-technique-followup-plan.md'))}
 forbidden=set()
 for folder in ['.runtime/technique-specialist-data-v3','.runtime/hangul-technique-v1']:
  for f in Path(folder).glob('*inputs.json'):forbidden.update(r['token'] for r in read(f))
 for split,groups in [('train',data.GROUPS['base']+data.GROUPS['extra']),('dev',data.GROUPS['dev']),('final',data.GROUPS['final'])]:
  rows=[];gold=[]
  for k,e in groups:
   for index,token in enumerate(dict.fromkeys(mutations(e))):
    # Include upper/title variants, not just a fixed lowercase surface.
    token=token.upper() if index%3==1 else token.title() if index%3==2 else token
    assert token not in forbidden
    for template,context,h in FRAMES[split]:
     target=template.format(x=token);start=target.index(token);marked=target[:start]+'[표기]'+token+'[/표기]'+target[start+len(token):];rid=hashlib.sha256((marked+context).encode()).hexdigest()[:20]
     rows.append({'id':rid,'token':token,'group_id':k+'/'+e,'raw_text':target,'start':start,'end':start+len(token),'input':{'target':marked,'context':context}})
     gold.append({'id':rid,'labels':[1,h],'kind':['sparse_substitution','literal_identifier','insufficient_context'][h],'group_id':k+'/'+e,'source':'synthetic_author'})
  assert len({r['id'] for r in rows})==len(rows)
  for suffix,rs in [('inputs',rows),('gold',gold)]:save(F/f'{split}-{suffix}.json',rs);manifest['files'][f'{split}-{suffix}.json']=p.digest(F/f'{split}-{suffix}.json')
  manifest[split]={'rows':len(rows),'groups':len(groups)}
 save(F/'manifest.json',manifest);print(json.dumps(manifest),flush=True)
def verify():
 for f,h in read(F/'manifest.json')['files'].items():assert p.digest(F/f)==h
 assert p.digest(Path('docs/dual-technique-followup-plan.md'))==read(F/'manifest.json')['plan_hash']
def density():
 rows=[];gold=[]
 for k,e in data.GROUPS['dev']:
  dense=data.changed(e,NUM);sparse=mutations(e)[0]
  for template,context in data.TEMPLATES['dev']:
   for kind,token in [('dense',dense),('sparse',sparse)]:
    target=template.format(x='[표기]'+token+'[/표기]');rows.append({'id':str(len(rows)),'token':token,'input':{'target':target,'context':context}});gold.append({'kind':kind,'family':e})
 path=R/'kc-continue/model';torch.set_num_threads(8);tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda');enc,lens=d.encoded(tok,rows);assert max(lens)<=512;ps,_=d.predict(model,tok,enc,'cuda')
 result={kind:{'positive':sum(v[1]==0 for g,v in zip(gold,ps,strict=True) if g['kind']==kind),'total':sum(g['kind']==kind for g in gold)} for kind in ['dense','sparse']}
 save(F/'density-diagnostic.json',{'result':result,'inputs':rows,'metadata':gold,'predictions':ps,'scope':'same novel development words and contexts, only digit substitution density varies'});print(json.dumps(result),flush=True)
def train():
 verify();out=R/'kc-density-role';out.mkdir(exist_ok=False);torch.set_num_threads(8);assert torch.cuda.is_available();torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42)
 tr,tg=d.load('base');a,b=d.load('extra');tr+=a;tg+=b;tr+=read(F/'train-inputs.json');tg+=read(F/'train-gold.json')
 observed=set()
 for folder in ['.runtime/digit-generalization-data-v1','.runtime/technique-specialist-data-v3']:
  for file in Path(folder).glob('*-gold.json'):
   for row in read(file):observed.add(row.get('family',row.get('group_id','')).casefold())
 excluded=sorted({r['group_id'] for r in tr if any(x.casefold() in observed for x in r['group_id'].split('/'))})
 paired=[(r,g) for r,g in zip(tr,tg,strict=True) if r['group_id'] not in excluded];tr=[r for r,g in paired];tg=[g for r,g in paired]
 dev,dg=d.load('dev');new=read(F/'dev-inputs.json');ng=read(F/'dev-gold.json');path=R/'kc-continue/model'
 tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda');ti,tl=d.encoded(tok,tr);di,dl=d.encoded(tok,dev);ni,nl=d.encoded(tok,new);assert max(tl+dl+nl)<=512
 save(out/'started.json',{'source_hash':p.digest(path/'model.safetensors'),'train_rows':len(tr),'generated_new_rows':len(read(F/'train-inputs.json')),'excluded_observed_families':excluded,'inherited_initial_training_overlap_not_erased':True,'lr':1e-5,'epochs':2,'seed':42,'script_hash':p.digest(Path(__file__)),'manifest':read(F/'manifest.json')})
 opt=torch.optim.AdamW(model.parameters(),lr=1e-5,weight_decay=.01);best=None;history=[];start=time.perf_counter()
 for epoch in range(1,3):
  model.train();ix=list(range(len(tr)));random.Random(41+epoch).shuffle(ix);losses=[]
  for i in range(0,len(ix),8):
   assert time.perf_counter()-start<1800;ids=ix[i:i+8];opt.zero_grad(set_to_none=True);logits=model(**p.batches(tok,ti,ids,'cuda')).logits.reshape(-1,3);labels=torch.tensor([tg[j]['labels'] for j in ids],device='cuda').reshape(-1);loss=torch.nn.functional.cross_entropy(logits,labels);assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(loss.item())
   if i%640==0:print(json.dumps({'epoch':epoch,'seen':i+8,'seconds':time.perf_counter()-start}),flush=True)
  ps,_=d.predict(model,tok,di,'cuda');ns,_=d.predict(model,tok,ni,'cuda');m=d.metric([g['labels'] for g in dg],ps);n=d.metric([g['labels'] for g in ng],ns)
  # The added panel has no J positives. Rank its H task; do not count undefined J F1 as failure.
  key=((m['positive_macro_f1']+n['HOMOGLYPH']['strict_f1'])/2,min(m['min_f1'],n['HOMOGLYPH']['strict_f1']),-m['normal_false']-m['uncertain_false']-n['normal_false']-n['uncertain_false'])
  rec={'epoch':epoch,'base_dev':m,'contrast_dev':n,'rank':key,'loss':statistics.mean(losses),'seconds':time.perf_counter()-start};history.append(rec);save(out/'history.json',history)
  if best is None or key>best:
   best=key;model.save_pretrained(out/'model',safe_serialization=True);tok.save_pretrained(out/'model');save(out/'selection.json',rec);save(out/'dev-predictions.json',[{'id':r['id'],'labels':v} for r,v in zip(dev,ps,strict=True)]);save(out/'contrast-dev-predictions.json',[{'id':r['id'],'labels':v} for r,v in zip(new,ns,strict=True)])
  print(json.dumps(rec),flush=True)
 save(out/'frozen.json',{'model_sha256':p.digest(out/'model/model.safetensors'),'training_seconds':time.perf_counter()-start,'final_opened':False,'production_adoption':False})
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('action',choices=['prepare','density','train']);a=ap.parse_args();globals()[a.action]()
