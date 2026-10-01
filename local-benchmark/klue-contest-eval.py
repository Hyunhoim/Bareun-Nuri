"""Single-use CPU comparison; targets/context only, labels opened after predictions."""
import importlib.util,json,time,unicodedata,collections
from pathlib import Path
s=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
ROOT=Path('.runtime/klue-contest-v1')
def read(n):return json.loads((ROOT/(n+'.json')).read_text(encoding='utf8'))
def save(n,x):(ROOT/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def normalize(rows):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rows]
def stats(gold,pred):
 tp=sum(r['is_violation'] and pred.get(r['id'])==0 for r in gold);fp=sum(not r['is_violation'] and pred.get(r['id'])==0 for r in gold);a=sum(r['is_violation'] for r in gold);n=len(gold)-a;fn=a-tp
 return dict(rows=len(gold),ads=a,normal=n,tp=tp,fp=fp,fn=fn,precision=tp/(tp+fp) if tp+fp else None,recall=tp/a if a else None,f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None,normal_fpr=fp/n if n else None,uncertain_ad=sum(r['is_violation'] and pred.get(r['id'])==3 for r in gold),uncertain_normal=sum(not r['is_violation'] and pred.get(r['id'])==3 for r in gold),uncollected=sum(r['id'] not in pred for r in gold))
def score():
 gold=json.loads(Path('test-set-contest-v1/data/private/gold.json').read_text(encoding='utf8'));coverage={r['id']:r for r in read('coverage')};result=read('timing');maps={}
 for name in ['baseline','candidate']:
  pred={r['id']:r['prediction'] for r in read(name+'-predictions')};maps[name]=pred
  result[name]['overall']=stats(gold,pred);result[name]['collected_only']=stats([r for r in gold if r['id'] in pred],pred)
  for key in ['technique','role','scenario_family']:
   result[name]['by_'+key]={k:stats([r for r in gold if r[key]==k],pred) for k in sorted({r[key] for r in gold})}
  result[name]['by_variant']={t+':'+str(v):stats([r for r in gold if r['technique']==t and r['variant']==v],pred) for t in sorted({r['technique'] for r in gold}) for v in range(5)}
  tp=fp=0;types={}
  for r in gold:
   c=coverage[r['id']];observed=[o['technique'] for o in c.get('observations',[]) if o['coverage']!='partial-text'];types[r['id']]=observed
   got=set(observed) if pred.get(r['id'])==0 else set();expected=set(r['expected_findings']);tp+=len(got&expected);fp+=len(got-expected)
  fn=1000-tp;result[name]['intent_plus_code_technique']={'tp':tp,'fp':fp,'fn':fn,'f1':2*tp/(2*tp+fp+fn),'note':'controlled locations only; not production HCX integration or crawl discovery evaluation'}
  groups=collections.defaultdict(list)
  for r in gold:groups[r['group_id']].append(r)
  result[name]['groups']={'ad_all_four_correct':sum(all(pred.get(r['id'])==0 for r in rs) for rs in groups.values() if rs[0]['is_violation']),'normal_all_four_nonad':sum(all(r['id'] in pred and pred[r['id']]!=0 for r in rs) for rs in groups.values() if not rs[0]['is_violation']),'binary_inconsistent':sum(len({None if r['id'] not in pred else pred[r['id']]==0 for r in rs})>1 for rs in groups.values())}
 result['code_technique']={t:{'collected':sum(coverage[r['id']]['collected'] for r in gold if r['technique']==t),'expected_type_observed':sum(t in types[r['id']] for r in gold if r['technique']==t)} for t in sorted({r['technique'] for r in gold})}
 a,b=maps['baseline'],maps['candidate'];changes={k:[] for k in ['lost_tp','gained_tp','fixed_fp','new_fp']}
 errors=[]
 for r in gold:
  x=a.get(r['id'])==0;y=b.get(r['id'])==0
  k=('lost_tp' if x and not y else 'gained_tp' if y and not x else None) if r['is_violation'] else ('fixed_fp' if x and not y else 'new_fp' if y and not x else None)
  if k:changes[k].append(r['id'])
  if y!=r['is_violation'] or not coverage[r['id']]['collected']:errors.append({**r,'baseline_prediction':a.get(r['id']),'candidate_prediction':b.get(r['id']),'collected':coverage[r['id']]['collected']})
 result['paired_change_counts']={k:len(v) for k,v in changes.items()};save('paired-changes',changes);save('candidate-errors',errors)
 am=result['baseline']['overall'];bm=result['candidate']['overall'];result['promising_gate']=bm['f1']-am['f1']>=.02 and bm['tp']>=am['tp'] and bm['fp']<=am['fp'];result['production_adoption']=False
 save('result',result);print(json.dumps(result,ensure_ascii=False),flush=True)
def main():
 for f,h in read('frozen').items():assert p.digest(f)==h,f
 for f,h in read('input-hashes').items():assert p.digest(ROOT/f)==h,f
 with (ROOT/'evaluation-started.json').open('x') as f:json.dump({'time':time.time(),'frozen_sha':p.digest(ROOT/'frozen.json')},f)
 p.torch.set_num_threads(8);rows=normalize(read('inputs'));assert all(set(r['input'])=={'target','context'} for r in rows)
 warm=normalize(json.loads(Path('.runtime/klue-cycle3-v1/development.json').read_text(encoding='utf8'))['structure'][:8]);timing={};start=time.perf_counter()
 for name,folder in [('baseline','.runtime/klue-refinement-v1/model'),('candidate','.runtime/klue-cycle3-v1/frozen8/model')]:
  mark=time.perf_counter();tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True);load=time.perf_counter()-mark
  mark=time.perf_counter();inputs,tr=p.encoded(tok,rows);encoding=time.perf_counter()-mark;warm_inputs,_=p.encoded(tok,warm);p.predict(model,tok,warm_inputs)
  result=[];secs=0
  with (ROOT/(name+'-predictions.jsonl')).open('x',encoding='utf8') as out:
   for i in range(0,len(inputs),128):
    assert time.perf_counter()-start<1800,'Inference safety cap';ps,sec=p.predict(model,tok,inputs[i:i+128]);secs+=sec
    chunk=[{'id':r['id'],'prediction':y} for r,y in zip(rows[i:i+128],ps,strict=True)];result.extend(chunk)
    for row in chunk:out.write(json.dumps(row)+'\n')
    out.flush();print(json.dumps({'model':name,'done':len(result),'total':len(rows),'inference_seconds':secs}),flush=True)
  save(name+'-predictions',result);timing[name]={'load_seconds':load,'encoding_seconds':encoding,'inference_seconds':secs,'truncated':tr,'cpu_threads':8,'batch':8,'predictions':len(result)};save('timing',timing);del model
 for f,h in read('frozen').items():assert p.digest(f)==h,f
 score();save('completed',{'completed':True,'time':time.time(),'evaluation_calls_per_model':1})
if __name__=='__main__':main()
