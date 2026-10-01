"""Freeze validation-selected model before single-use paired final evaluation."""
import importlib.util,json,time,unicodedata
from pathlib import Path
spec=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
root=Path('.runtime/klue-scale-v1')
def read(n):return json.loads((root/(n+'.json')).read_text(encoding='utf8'))
def save(n,v):(root/(n+'.json')).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def normalized(rows):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rows]
def slices(rows,gold,pred):
 domains={'direct':{'direct','author-offer','ordinary','warning-target'},'ownership':{'short-link','neighbor-warning','metadata','metadata-value','ordinary-neighbor'},'quotation':{'quoted-offer','prevention','quoted-prevention','prevention-after','report'}}
 return {name:p.metrics([g for r,g in zip(rows,gold) if r['kind'] in kinds],[v for r,v in zip(rows,pred) if r['kind'] in kinds]) for name,kinds in domains.items()}
def main():
 manifest=read('data-manifest')
 for f,h in manifest['hashes'].items():assert p.digest(root/f)==h
 for f,h in read('challenge-manifest')['hashes'].items():assert p.digest(root/f)==h
 candidates=[]
 for size in [5000,10000,20000,50000]:
  folder=root/(str(size)+'-nfc')
  if not (folder/'completed.json').exists():
   assert size==50000 and (folder/'pruned.json').exists();bound=json.loads((root/'10000-nfc/selection.json').read_text())['validation'];assert bound['macro4_f1']==1 and bound['ad_f1']==1
  sel=json.loads((folder/'selection.json').read_text());candidates.append((sel['validation']['macro4_f1'],sel['validation']['ad_f1'],-size,size,sel))
 choice=max(candidates,key=lambda x:x[:3]);size=choice[3];selected=root/(str(size)+'-nfc')/'model';assert choice[0]>=.85 and choice[1]>=.9,'Validation gate failed; do not open final'
 with (root/'selection-frozen.json').open('x') as f:json.dump({'size':size,'validation':choice[4],'selection_only_validation':True},f)
 paths=[*selected.glob('*'),*Path('.runtime/klue-refinement-v1/model').glob('*'),Path(__file__),Path('local-benchmark/klue-scale.py'),Path('local-benchmark/klue-scale-data.py'),Path('local-benchmark/klue-scale-challenge.py'),Path('docs/klue-scale-plan.md'),root/'data-manifest.json',root/'challenge-manifest.json',root/'corrected-regression.json',root/'legacy-dom-regression.json'];freeze={str(f):p.digest(f) for f in paths if f.is_file()};save('final-freeze',freeze)
 p.torch.set_num_threads(8)
 with (root/'final-started.json').open('x') as f:json.dump({'started':time.time(),'frozen_sha':p.digest(root/'final-freeze.json')},f)
 main_rows=read('final-inputs');boundary=len(main_rows);rows=normalized(main_rows+read('challenge-inputs'));outputs={};info={}
 # Neither gold nor scores are opened until BOTH models' predictions are saved.
 for name,path in [('refined_baseline',Path('.runtime/klue-refinement-v1/model')),('selected',selected)]:
  tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True);inp,tr=p.encoded(tok,rows);warm,_=p.encoded(tok,normalized(read('validation')[:8]));p.predict(model,tok,warm);pred,sec=p.predict(model,tok,inp);outputs[name]=pred;info[name]={'seconds':sec,'truncated':tr};save('final-'+name+'-predictions',[{'id':r['id'],'prediction':y} for r,y in zip(rows,pred,strict=True)]);print(json.dumps({'stage':'predictions_saved','model':name,'rows':len(rows),'seconds':sec}),flush=True);del model
 gold=read('final-labels')+read('challenge-labels');assert [g['id'] for g in gold]==[r['id'] for r in rows];labels=[g['label'] for g in gold]
 for name,pred in outputs.items():info[name].update(metrics=p.metrics(labels[:boundary],pred[:boundary]),challenge_metrics=p.metrics(labels[boundary:],pred[boundary:]),overall_metrics=p.metrics(labels,pred),slices=slices(rows[:boundary],labels[:boundary],pred[:boundary]))
 a=info['refined_baseline']['metrics'];b=info['selected']['metrics'];passed=b['ad_f1']>=.9 and b['ad_f1']-a['ad_f1']>=.05 and b['recall']>=.9 and b['macro4_f1']>=.85 and all(x['ad_f1']>=.8 for x in info['selected']['slices'].values())
 info['lexical_criterion_passed']=passed;passed=passed and info['selected']['challenge_metrics']['ad_f1']>=.8
 info['criterion_passed']=passed;info['selected_size']=size;info['f1_delta']=b['ad_f1']-a['ad_f1'];info['lost_tp']=[r['id'] for r,y,a,b in zip(rows,labels,outputs['refined_baseline'],outputs['selected']) if y==0 and a==0 and b!=0];info['gained_tp']=[r['id'] for r,y,a,b in zip(rows,labels,outputs['refined_baseline'],outputs['selected']) if y==0 and a!=0 and b==0];save('final-result',info)
 # Observed regression only, after final selection. Never use it to choose model size.
 for name,path in [('baseline',Path('.runtime/klue-refinement-v1/model')),('selected',selected)]:
  model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True)
  for source,suffix in [('corrected-regression','regression'),('legacy-dom-regression','legacy-dom')]:
   reg=normalized(read(source));inp,tr=p.encoded(tok,reg);pred,sec=p.predict(model,tok,inp);save(name+'-'+suffix+'-predictions',[{'id':r['id'],'prediction':y} for r,y in zip(reg,pred,strict=True)]);save(name+'-'+suffix+'-result',{'metrics':p.metrics([None if r['is_ad'] is None else 0 if r['is_ad'] else 2 for r in reg],pred),'seconds':sec,'truncated':tr})
  del model
 assert all(p.digest(f)==h for f,h in freeze.items());save('final-completed',{'complete':True,'passed':passed});print(json.dumps(info),flush=True)
if __name__=='__main__':main()
