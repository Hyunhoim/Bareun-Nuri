"""Frozen model comparison and one-use synthetic confirmation. No API calls."""
import argparse,gc,importlib.util,json,statistics,subprocess,time
from pathlib import Path
s=importlib.util.spec_from_file_location('d',Path(__file__).with_name('dual-technique.py'));d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
R=d.R;c=d.c;p=d.p;torch=d.torch;read=d.read;save=d.save
def selection_file():
 for f in ['calibrated-selection.json','followup-selection.json','candidate-selection.json']:
  if (R/f).exists():return R/f
def resolved(name):return 'kc-density-role' if name=='kc-density-role-calibrated' else name
def promoted_predict(model,tok,enc):
 threshold=read(R/'calibration-selection.json')['threshold'];assert threshold is not None;model.eval();out=[];start=time.perf_counter()
 with torch.inference_mode():
  for i in range(0,len(enc),8):
   probs=model(**p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cpu')).logits.reshape(-1,2,3).softmax(-1);ps=probs.argmax(-1);ps[:,1]=torch.where(probs[:,1,0]>=threshold,0,ps[:,1]);out.extend(ps.tolist())
 return out,time.perf_counter()-start
def code_predictions(rows):
 script="const fs=require('fs');const {observeTechniques}=require('./agent/src/core/techniques.cjs');const rows=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(rows.map(r=>{const o=observeTechniques({raw_text:r.token,location:'given-target',node_id:r.id,url:'http://localhost/'});return ['JAMO','HOMOGLYPH'].map(t=>o.observations.some(x=>x.technique===t)?0:o.unresolved.some(x=>x.technique===t)?2:1)})))"
 out=subprocess.run(['node','-e',script],input=json.dumps(rows,ensure_ascii=False),text=True,encoding='utf8',capture_output=True,check=True)
 return json.loads(out.stdout)
def evaluate_model(name,rows,repeats=1):
 torch.set_num_threads(8);start=time.perf_counter()
 if name=='code':
  ps=code_predictions(rows);return {'predictions':ps,'wall_seconds':[time.perf_counter()-start],'load_seconds':0,'protected':0}
 old=name in ['old_klue','old_uts'];path=c.model_path('existing' if name=='old_klue' else 'klue_uts') if old else R/resolved(name)/'model'
 frozen=c.t.OUT/'frozen.json' if name=='old_klue' else c.ROOT/'klue_uts/frozen.json' if name=='old_uts' else R/resolved(name)/'frozen.json'
 assert p.digest(path/'model.safetensors')==read(frozen)['model_sha256']
 tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cpu');loadsec=time.perf_counter()-start
 encfun=(lambda rs:c.encode(tok,rs,'existing' if name=='old_klue' else 'klue_uts',c.mapping())) if old else (lambda rs:d.encoded(tok,rs))
 fun=(lambda es:p.predict(model,tok,es)) if old else (lambda es:d.predict(model,tok,es))
 if name=='kc-density-role-calibrated':fun=lambda es:promoted_predict(model,tok,es)
 warm,lens=encfun(rows[:8]);fun([v for v,n in zip(warm,lens,strict=True) if n<=512]);walls=[];first=None;protect=0
 code=code_predictions(rows) if old else None
 for rep in range(repeats):
  order=list(range(len(rows))) if rep!=1 else list(reversed(range(len(rows))));start=time.perf_counter();enc,lens=encfun([rows[i] for i in order]);valid=[i for i,n in enumerate(lens) if n<=512 and not rows[order[i]].get('collection_truncated',False)];ps,_=fun([enc[i] for i in valid]);found={order[i]:v for i,v in zip(valid,ps,strict=True)};protect=len(rows)-len(valid)
  if old:out=[[code[i][0],found.get(i,2)] for i in range(len(rows))]
  else:out=[found.get(i,[2,2]) for i in range(len(rows))]
  walls.append(time.perf_counter()-start)
  if first is None:first=out
  else:assert first==out,'order changed decisions'
 del model;gc.collect();return {'predictions':first,'wall_seconds':walls,'median_wall_seconds':statistics.median(walls),'load_seconds':loadsec,'protected':protect,'note':'old models use code JAMO; raw classifier HOMOGLYPH; code time excluded from model wall'}
def scored(gold,ps):
 labels=[g['labels'] for g in gold];out=d.metric(labels,ps)
 out['by_kind']={kind:d.metric([g['labels'] for g in gold if g['kind']==kind],[v for g,v in zip(gold,ps,strict=True) if g['kind']==kind]) for kind in sorted({g['kind'] for g in gold})}
 return out
def development():
 d.verify();rows,gold=d.load('dev');names=['code','old_klue','old_uts','klue-base','kc-base'];selection=R/'stage1-selection.json'
 if selection.exists():
  arm=read(selection)['arm'];names += [arm+'-'+s for s in ['continue','joint'] if (R/(arm+'-'+s)/'frozen.json').exists()]
 for name in names:
  dest=R/'development-evaluation'/f'{name}.json'
  if dest.exists():continue
  r=evaluate_model(name,rows,3);r['ids']=[x['id'] for x in rows];r['metrics']=scored(gold,r['predictions']);save(dest,r)
  print(json.dumps({'name':name,'macro':r['metrics']['positive_macro_f1'],'J':r['metrics']['JAMO']['strict_f1'],'H':r['metrics']['HOMOGLYPH']['strict_f1'],'normal_false':r['metrics']['normal_false'],'uncertain_false':r['metrics']['uncertain_false'],'seconds':r.get('median_wall_seconds',r['wall_seconds'][0])}),flush=True)
def regressions():
 result={}
 for split in ['dev','final']:
  rows=read(c.DATA/f'{split}-inputs.json');gold=read(c.DATA/f'{split}-gold.json');result['old-'+split]=(rows,gold)
 for split in ['dev','evaluation']:
  rows=c.panels()['historical-'+split];g=read(Path('.runtime/digit-generalization-data-v1')/f'{split}-gold.json');gold=[{'id':r['node_id'],'label':c.LABELS.index(r['classification'])} for r in g];result['historical-'+split]=(rows,gold)
 result['hangul']=(read('.runtime/hangul-technique-v1/inputs.json'),read('.runtime/hangul-technique-v1/gold.json'))
 return result
def regression():
 chosen=read(selection_file())['candidate'];summary={}
 for name in ['code','old_klue','old_uts',chosen]:
  dest=R/'regression'/f'{name}.json'
  if dest.exists():summary[name]=read(dest);continue
  allres={}
  for panel,(rows,gold) in regressions().items():
   rec=evaluate_model(name,rows);ps=rec['predictions'];rec['ids']=[r['id'] for r in rows];rec['HOMOGLYPH']=c.t.metric([g['label'] for g in gold],[x[1] for x in ps])
   if panel in ['old-dev','old-final']:
    split=panel.removeprefix('old-');intent={r['node_id']:r['is_violation'] for r in read(Path('.runtime/technique-specialist-intent-v1')/f'{split}-decisions.json')};code={r['id']:r['label'] for r in read(Path('.runtime/technique-specialist-hcx-v1')/f'{split}-code.json')}
    true={g['id'] for g in gold if g['is_ad'] and g['label']==0};found={r['id'] for r,v in zip(rows,ps,strict=True) if intent[r['id']] and (v[1]==0 or code[r['id']]==0)}
    rec['stored_hcx_plus_homoglyph']=c.binary(true,found)
   if panel=='hangul':
    # Only source-labelled JAMO and plain boundary cases have unambiguous J ground truth.
    indices=[i for i,g in enumerate(gold) if g['panel']=='boundary' and g['kind'] in ['JAMO','plain']]
    rec['JAMO_boundary']=c.t.metric([0 if gold[i]['kind']=='JAMO' else 1 for i in indices],[ps[i][0] for i in indices])
   allres[panel]=rec
  save(dest,allres);summary[name]=allres;print('regression',name,flush=True)
 comparison={}
 for panel,(rows,gold) in regressions().items():
  base=summary['old_uts'][panel]['predictions'];new=summary[chosen][panel]['predictions']
  comparison[panel]={'old_uts_tp_lost':sum(g['label']==0 and b[1]==0 and n[1]!=0 for g,b,n in zip(gold,base,new,strict=True)),'old_uts_tp_recovered':sum(g['label']==0 and b[1]!=0 and n[1]==0 for g,b,n in zip(gold,base,new,strict=True)),'old_uts_h':summary['old_uts'][panel]['HOMOGLYPH'],'selected_h':summary[chosen][panel]['HOMOGLYPH']}
 save(R/f'regression-comparison-{chosen}.json',comparison);print(json.dumps(comparison),flush=True)
def final():
 d.verify();selection=read(selection_file());name=selection['candidate'];assert p.digest(R/resolved(name)/'model/model.safetensors')==selection['sha256']
 # Atomic start marker prevents a second confirmation even if execution is interrupted.
 with (R/'final-started.json').open('x',encoding='utf8') as f:json.dump({'candidate':name,'selection_sha256':p.digest(selection_file()),'time':time.time()},f)
 rows=read(R/'final-inputs.json');allres={}
 if (R/'followup-selection.json').exists():
  for file,h in read(R/'followup/manifest.json')['files'].items():assert p.digest(R/'followup'/file)==h
  rows+=read(R/'followup/final-inputs.json')
 assert len({r['id'] for r in rows})==len(rows)
 for arm in ['code','old_klue','old_uts',name]:
  rec=evaluate_model(arm,rows);rec['ids']=[r['id'] for r in rows];save(R/'confirmation'/f'{arm}-predictions.json',rec);allres[arm]=rec
 gold=read(R/'final-gold.json')
 if (R/'followup-selection.json').exists():gold+=read(R/'followup/final-gold.json')
 assert [g['id'] for g in gold]==[r['id'] for r in rows]
 metrics={arm:scored(gold,rec['predictions']) for arm,rec in allres.items()};save(R/'confirmation/results.json',metrics);save(R/'final-completed.json',{'candidate':name,'evaluation_count':1,'production_adoption':False,'synthetic_same_author':True})
 print(json.dumps({k:{a:v[a] for a in ['positive_macro_f1','normal_false','uncertain_false','exact_state_accuracy']} for k,v in metrics.items()}),flush=True)
def collected():
 name=read(selection_file())['candidate'];rows=read('.runtime/technique-collected-v1/inputs.json');result={}
 for arm in ['code','old_uts',name]:
  rec=evaluate_model(arm,rows);rec['ids']=[r['id'] for r in rows]
  rec['known_injected']=[{'id':r['id'],'token':r['token'],'prediction':v} for r,v in zip(rows,rec['predictions'],strict=True) if r.get('known_ad_label')==0 and 'HOMOGLYPH' in r.get('known_techniques',[])]
  rec['unlabelled_not_scored']=True;result[arm]=rec
 save(R/'collected.json',result);print(json.dumps({k:{'protected':v['protected'],'known':v['known_injected']} for k,v in result.items()}),flush=True)
def audit():
 d.verify();checks={};original=read(R/'production-before.json');checks['production_unchanged']=all(p.digest(Path(f))==h for f,h in original.items());assert checks['production_unchanged']
 selection=read(selection_file());checks['selection_hash']=p.digest(R/resolved(selection['candidate'])/'model/model.safetensors')==selection['sha256'];assert checks['selection_hash']
 files=0
 for folder,split in [('development-evaluation','dev'),('confirmation','final')]:
  rows,gold=d.load(split)
  if split=='final' and (R/'followup-selection.json').exists():rows+=read(R/'followup/final-inputs.json');gold+=read(R/'followup/final-gold.json')
  for f in (R/folder).glob('*.json'):
   rec=read(f)
   if 'predictions' not in rec:continue
   assert rec['ids']==[r['id'] for r in rows] and len(rec['predictions'])==len(gold);files+=1
   for j in range(2):
    positives={i for i,g in enumerate(gold) if g['labels'][j]==0};found={i for i,v in enumerate(rec['predictions']) if v[j]==0}
    tp=len(positives&found);fp=len(found-positives);fn=len(positives-found);f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0
    assert abs(f1-scored(gold,rec['predictions'])[['JAMO','HOMOGLYPH'][j]]['strict_f1'])<1e-12
 checks['prediction_files_checked']=files;checks['final_count']=int((R/'final-completed.json').exists());checks['api_calls']=0
 save(R/'audit.json',checks);print(json.dumps(checks),flush=True)
def choose_followup():
 assert not (R/'followup-selection.json').exists();names=['kc-continue','kc-density-role'];rows=read(R/'followup/dev-inputs.json');gold=read(R/'followup/dev-gold.json');metrics={}
 # GPU inference is for selection only, not a CPU speed comparison.
 torch.set_num_threads(8)
 for name in names:
  path=R/name/'model';assert p.digest(path/'model.safetensors')==read(R/name/'frozen.json')['model_sha256'];tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda');enc,lens=d.encoded(tok,rows);assert max(lens)<=512;ps,_=d.predict(model,tok,enc,'cuda');m=scored(gold,ps);base=read(R/name/'selection.json');b=base['development'] if name=='kc-continue' else base['base_dev'];key=((b['positive_macro_f1']+m['HOMOGLYPH']['strict_f1'])/2,min(b['min_f1'],m['HOMOGLYPH']['strict_f1']),-b['normal_false']-b['uncertain_false']-m['normal_false']-m['uncertain_false']);metrics[name]={'base':b,'contrast':m,'rank':key};save(R/'followup'/f'{name}-development.json',{'metrics':m,'predictions':ps,'ids':[r['id'] for r in rows]});del model;gc.collect();torch.cuda.empty_cache()
 chosen=max(names,key=lambda name:metrics[name]['rank']);save(R/'followup-selection.json',{'candidate':chosen,'metrics':metrics,'sha256':read(R/chosen/'frozen.json')['model_sha256'],'reason':'expanded development only; final unopened; regressions not used to switch winner'})
 print(json.dumps({'candidate':chosen,'ranks':{n:v['rank'] for n,v in metrics.items()}}),flush=True)
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('action',choices=['development','regression','final','collected','audit','choose_followup']);a=ap.parse_args();globals()[a.action]()
