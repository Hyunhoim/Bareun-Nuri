"""Input ablations and meaning-preserving header changes, not new final evaluation."""
import importlib.util,json,time,re
from pathlib import Path
s=importlib.util.spec_from_file_location('n',Path(__file__).with_name('nuri12-train.py'));n=importlib.util.module_from_spec(s);s.loader.exec_module(n)
p=n.p;R=Path('.runtime/nuri-1.2-shortcut-v1')
MAPPING={'선택 요소:':'검사 중인 요소:', '선택한':'검사하는', '같은 게시글:':'대상과 동일 작성자의 글:', '다른 작성자의 댓글:':'별개 작성자가 남긴 댓글:', '다음 댓글:':'별도 댓글:', '앞 댓글(다른 작성자):':'이전의 별개 작성자 댓글:', '이후 별도 댓글:':'다른 댓글:', '대상과 같은 작성 영역 시작':'대상 작성자의 영역 시작','대상 작성 영역 끝':'대상 작성자의 영역 종료','별도 게시물:':'다른 작성자의 게시물:', '별도 답글:':'다른 작성자의 답글:', '이전 글(다른 작성자):':'다른 작성자의 이전 글:', '상위 글 본문:':'대상이 속한 글 본문:', '아래는 다른 작성자의 글':'이하 별개 작성자 영역', '앞 문맥:':'대상의 앞부분:', '뒤 문맥:':'대상의 뒷부분:', '같은 작성자의 앞 문장:':'동일 작성자의 이전 문장:', '다른 댓글:':'별개 댓글:'}
def save(name,x):(R/(name+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def transform(rows,mode):
 out=[];changed=[]
 for r in rows:
  target=r['input']['target'];context=r['input']['context']
  if mode=='target_only':context=''
  if mode=='context_only':target=''
  if mode in ['scope_paraphrase','scope_erased']:
   lines=[]
   for line in context.split('\n'):
    for a,b in MAPPING.items():
     if line.startswith(a):line=(b if mode=='scope_paraphrase' else '')+line[len(a):];break
    lines.append(line)
   context='\n'.join(lines)
  value={'target':target,'context':context};changed.append(value!=r['input'] or mode=='wrapper_paraphrase');out.append({**r,'input':value})
 return out,changed
def main():
 R.mkdir(exist_ok=False);p.torch.set_num_threads(8);assert p.torch.cuda.is_available()
 panels={'new40':n.norm(n.read('local-benchmark/a-ft-new-data.json')['development']),'broad120':n.norm(n.read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':n.norm(n.read('.runtime/klue-retention-v1/development.json'))}
 train=n.norm(n.read(n.D/'train.json'));sample=[r for r in train if (lambda g:g%50 in {g//50%10,(g//50+5)%10})(int(r['id'].split('-')[1]))];assert len(sample)==400;panels['training400']=sample
 tok=p.AutoTokenizer.from_pretrained(n.BASE,local_files_only=True);modes=['full','target_only','context_only','scope_paraphrase','wrapper_paraphrase','scope_erased'];inputs={};changes={}
 for name,rows in panels.items():
  for mode in modes:
   rs,changed=transform(rows,mode);encoded,tr=p.encoded(tok,rs)
   if mode=='wrapper_paraphrase':
    text=['검사할 문구: '+r['input']['target']+'\n주변 내용: '+r['input']['context'] for r in rs];z=tok(text,truncation=True,max_length=512,return_token_type_ids=False);encoded=[{k:v[i] for k,v in z.items()} for i in range(len(rs))]
   inputs[name,mode]=encoded;changes[name,mode]=changed
 save('contract',{'sample_ids':[r['id'] for r in sample],'mapping':MAPPING,'sealed_opened':False,'ablation_metrics_not_gold_valid':True,'source_files':{str(f):p.digest(f) for f in [n.D/'train.json',Path(__file__),Path('docs/nuri12-shortcut-plan.md')]}})
 allresults={}
 for arm,path in [('A',Path('.runtime/klue-cycle3-v1/frozen8/model')),('Nuri',n.R/'model'),('freeze8',Path('.runtime/nuri-1.2-freeze-v1/fresh_freeze8/model'))]:
  model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda');results={}
  for name,rows in panels.items():
   base=None;results[name]={}
   for mode in modes:
    ps,sec=p.predict(model,tok,inputs[name,mode],8,'cuda')
    if mode=='full':base=ps
    ch=changes[name,mode];diff=sum(a!=b for a,b in zip(base,ps));cd=sum(a!=b and c for a,b,c in zip(base,ps,ch));item={'n':len(rows),'transformed_rows':sum(ch),'prediction_changes':diff,'changed_input_prediction_changes':cd,'changed_input_change_rate':cd/sum(ch) if any(ch) else None,'predicted_ad':ps.count(0),'seconds':sec,'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rows,ps)]}
    if mode in ['full','scope_paraphrase','wrapper_paraphrase']:item['metrics']=p.metrics([r['label'] for r in rows],ps)
    results[name][mode]=item
   print(json.dumps({'arm':arm,'panel':name,'changes':{k:v['prediction_changes'] for k,v in results[name].items()}}),flush=True)
  allresults[arm]=results;save('results',allresults);del model;p.torch.cuda.empty_cache()
 save('completed',{'models':3,'conditions':6,'training_sample':400,'observed_development':204,'final_opened':False})
if __name__=='__main__':main()
