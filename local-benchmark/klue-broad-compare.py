"""Compare frozen classifiers on fixed development inputs; no training or selection."""
import importlib.util,json,time,unicodedata
from pathlib import Path
s=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
root=Path('.runtime/klue-broad-development-v1');out=root/'comparison-v1'
models={'A':'.runtime/klue-cycle3-v1/frozen8/model','D':'.runtime/klue-audit-learning-v1/run-cpu/model','B':'.runtime/klue-retention-v1/run/B','C':'.runtime/klue-retention-v1/run/C'}
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def save(n,x):(out/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 out.mkdir(exist_ok=False);p.torch.set_num_threads(8)
 for f,h in read(root/'summary.json')['hashes'].items():assert p.digest(root/f)==h
 for f,h in read(root/'sources-frozen.json').items():assert p.digest(f)==h
 rows=read(root/'rows.json');rows=[{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rows]
 freeze={str(f):p.digest(f) for m in models.values() for f in Path(m).glob('*') if f.is_file()};freeze[str(Path(__file__))]=p.digest(__file__);save('frozen',freeze)
 save('contract',{'models':models,'order':list(models),'cpu_threads':8,'batch':8,'input_sha256':p.digest(root/'rows.json'),'no_training':True,'no_production_adoption':True,'uncertain_excluded_from_binary_f1':True,'independent_final':False,'repeat_count':1,'time_cap_seconds_per_model':300})
 results={};groups=sorted({r['group'] for r in rows});baseline=None
 for name,path in models.items():
  tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);encoded,truncated=p.encoded(tok,rows);assert truncated==0
  model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cpu');p.predict(model,tok,encoded[:8],8,'cpu');start=time.perf_counter();ps,seconds=p.predict(model,tok,encoded,8,'cpu');assert time.perf_counter()-start<300;del model
  save(name+'-predictions',[{'id':r['id'],'prediction':v} for r,v in zip(rows,ps,strict=True)])
  result={'metrics':p.metrics([r['label'] for r in rows],ps),'seconds':seconds,'axes':{},'titles':{},'groups':[]}
  for key,field in [('axis','axes'),('title_index','titles')]:
   for value in sorted({r[key] for r in rows}):
    ix=[i for i,r in enumerate(rows) if r[key]==value];result[field][str(value)]=p.metrics([rows[i]['label'] for i in ix],[ps[i] for i in ix])
  for group in groups:
   ix=sorted([i for i,r in enumerate(rows) if r['group']==group],key=lambda i:rows[i]['title_index']);pred=[ps[i] for i in ix];assert len(ix)==3
   result['groups'].append({'group':group,'label':rows[ix[0]]['label'],'axis':rows[ix[0]]['axis'],'predictions':pred,'ad_changed':len({v==0 for v in pred})>1,'class_changed':len(set(pred))>1})
  result['title_ad_changed_groups']=sum(g['ad_changed'] for g in result['groups']);result['title_class_changed_groups']=sum(g['class_changed'] for g in result['groups']);result['all_titles_correct_ad_groups']=sum(g['label']==0 and all(v==0 for v in g['predictions']) for g in result['groups']);result['any_title_false_ad_normal_groups']=sum(g['label'] in [1,2] and any(v==0 for v in g['predictions']) for g in result['groups'])
  if baseline is None:baseline=ps
  result['vs_A']={k:[] for k in ['lost_tp','gained_tp','fixed_fp','new_fp']}
  for r,a,b in zip(rows,baseline,ps,strict=True):
   if r['label']==3 or (a==0)==(b==0):continue
   k=('lost_tp' if a==0 else 'gained_tp') if r['label']==0 else ('fixed_fp' if a==0 else 'new_fp');result['vs_A'][k].append(r['id'])
  results[name]=result;save('results',results);print(json.dumps({'model':name,'metrics':result['metrics'],'title_ad_changed_groups':result['title_ad_changed_groups'],'vs_A':{k:len(v) for k,v in result['vs_A'].items()},'seconds':seconds}),flush=True)
 for f,h in freeze.items():assert p.digest(f)==h
 save('completed',{'complete':True,'models':4,'inputs_per_model':len(rows),'extra_paid_api':0})
if __name__=='__main__':main()
