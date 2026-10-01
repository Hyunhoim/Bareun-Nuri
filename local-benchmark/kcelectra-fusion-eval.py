"""Frozen-candidate evaluation on observed panels; never selects on regression."""
import importlib.util,json,time,gc
from pathlib import Path
s=importlib.util.spec_from_file_location('f',Path(__file__).with_name('kcelectra-fusion.py'));f=importlib.util.module_from_spec(s);s.loader.exec_module(f);p=f.p;R=f.R
def main():
 assert f.read(R/'training-completed.json')['completed'];assert not (R/'evaluation-started.json').exists();f.save('evaluation-started',{'time':time.time()});p.torch.set_num_threads(8)
 rows=f.norm(f.read('.runtime/klue-contest-v1/inputs.json'));gold={r['id']:r for r in f.read('test-set-contest-v1/data/private/gold.json')}
 panels={'D64':f.norm(f.read('.runtime/klue-audit-learning-v1/validation.json')),'broad120':f.norm(f.read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':f.norm(f.read('.runtime/klue-retention-v1/development.json'))}
 names={n:R/n/'model' for n in ['A_replay','K_base','D_only','mix50','mix12']};names.update({'A':Path('.runtime/klue-cycle3-v1/frozen8/model'),'D':Path('.runtime/klue-audit-learning-v1/run-cpu/model')});summary={}
 for name,folder in names.items():
  if name not in ['A','D']:assert p.digest(folder/'model.safetensors')==f.read(R/name/'frozen.json')['sha256']
  start=time.perf_counter();tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cpu');load=time.perf_counter()-start
  enc,tr=p.encoded(tok,rows);p.predict(model,tok,enc[:8]);pred,sec=p.predict(model,tok,enc);mapping={r['id']:v for r,v in zip(rows,pred,strict=True)};assert len(mapping)==len(gold)
  f.save(name+'/regression-predictions',[{'id':r['id'],'prediction':v} for r,v in zip(rows,pred,strict=True)])
  def metric(ids):return p.metrics([0 if gold[i]['is_violation'] else 2 for i in ids],[mapping[i] for i in ids])
  result={'overall':metric(list(mapping)),'by_technique':{t:metric([i for i in mapping if gold[i]['technique']==t]) for t in sorted({g['technique'] for g in gold.values()})},'cpu_seconds':sec,'load_seconds':load,'truncated':tr,'panels':{}}
  for k,rs in panels.items():
   es,cut=p.encoded(tok,rs);ps,secs=p.predict(model,tok,es);result['panels'][k]={'metrics':p.metrics([r['label'] for r in rs],ps),'truncated':cut,'predictions':ps}
  f.save(name+'/evaluation',result);summary[name]=result;print(json.dumps({'model':name,'overall':result['overall'],'seconds':sec,'panel_f1':{k:v['metrics']['ad_f1'] for k,v in result['panels'].items()}}),flush=True);del model;gc.collect()
 a=summary['A'];prior={r['id']:r['prediction'] for r in f.read(R/'A/regression-predictions.json')}
 for name,result in summary.items():
  candidate={r['id']:r['prediction'] for r in f.read(R/name/'regression-predictions.json')};changes={k:[] for k in ['lost_tp','gained_tp','fixed_fp','new_fp']}
  for i,g in gold.items():
   x,y=prior[i]==0,candidate[i]==0;k=('lost_tp' if x and not y else 'gained_tp' if y and not x else None) if g['is_violation'] else ('fixed_fp' if x and not y else 'new_fp' if y and not x else None)
   if k:changes[k].append(i)
  result['changes']={k:len(v) for k,v in changes.items()};f.save(name+'/changes',changes)
  m,b=result['overall'],a['overall'];result['promising']=(m['ad_f1']>=b['ad_f1']+.01 or (m['ad_f1']>=b['ad_f1'] and m['fp']<=b['fp']*.8 and m['recall']>=b['recall']-.01)) and min(v['metrics']['ad_f1'] for v in result['panels'].values())>min(v['metrics']['ad_f1'] for v in a['panels'].values()) and all(v['ad_f1']>=a['by_technique'][k]['ad_f1']-.02 for k,v in result['by_technique'].items())
 f.save('summary',summary);f.save('evaluation-completed',{'completed':True,'independent_final':False,'operating_change':False})
if __name__=='__main__':main()
