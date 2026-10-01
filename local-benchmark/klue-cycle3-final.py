import importlib.util,json,time,unicodedata
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
root=Path('.runtime/klue-cycle3-v1');dom=root/'final-dom'
def read(base,n):return json.loads((base/(n+'.json')).read_text(encoding='utf8'))
def save(n,x):(root/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def norm(rows):return [{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in rows]
def main():
 for base in [root,dom]:
  for f,h in read(base,'manifest')['hashes'].items():assert p.digest(base/f)==h
 choices=[]
 for name in ['full','frozen8']:
  assert (root/name/'completed.json').exists();x=read(root/name,'selection');choices.append((x['development_gate'],x['minimum_f1'],x['mean_f1'],name))
 best=max(choices);assert best[0],'No qualifying development candidate; final stays sealed';chosen=best[3];folder=root/chosen/'model'
 files=[*folder.glob('*'),*Path('.runtime/klue-refinement-v1/model').glob('*'),Path(__file__),Path('local-benchmark/klue-cycle3.py'),Path('local-benchmark/klue-cycle3-data.py'),Path('local-benchmark/klue-cycle3-site.cjs'),Path('local-benchmark/klue-context.cjs'),Path('docs/klue-cycle3-plan.md'),root/'manifest.json',dom/'manifest.json'];freeze={str(f):p.digest(f) for f in files if f.is_file()};save('frozen',freeze)
 with (root/'final-started.json').open('x') as f:json.dump({'selected':chosen,'time':time.time(),'epoch':read(root/chosen,'selection')['epoch'],'freeze_hash':p.digest(root/'frozen.json')},f)
 p.torch.set_num_threads(8);rows=norm(read(dom,'inputs'));warmrows=norm(read(root,'development')['structure'][:8]);outputs={};result={'selected':chosen,'rows':len(rows)}
 for name,source in [('baseline',Path('.runtime/klue-refinement-v1/model')),('candidate',folder)]:
  tok=p.AutoTokenizer.from_pretrained(source,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True);inp,tr=p.encoded(tok,rows);warm,_=p.encoded(tok,warmrows);p.predict(model,tok,warm);pred,sec=p.predict(model,tok,inp);outputs[name]=pred;result[name]={'seconds':sec,'truncated':tr};save('final-'+name+'-predictions',[{'id':r['id'],'prediction':y} for r,y in zip(rows,pred,strict=True)]);del model
 gold=read(dom,'labels');assert [g['id'] for g in gold]==[r['id'] for r in rows];labels=[g['label'] for g in gold]
 for name,ps in outputs.items():result[name]['metrics']=p.metrics(labels,ps)
 a=result['baseline']['metrics'];b=result['candidate']['metrics'];uncertain=sum(y==3 for y in labels);normal=sum(y in [1,2] for y in labels);result['final_gate']=b['ad_f1']>=.9 and b['ad_f1']-a['ad_f1']>=.05 and b['recall']>=.9 and b['macro4_f1']>=.85 and b['uncertain_correct']/uncertain>=.8 and b['fp']/normal<=.1
 dev=read(root/chosen,'selection')['panels'];prior=Path('.runtime/klue-scale-v1');result['regressions']={}
 for panel,suffix in [('replica','regression'),('legacy','legacy-dom')]:
  baseline=read(prior,'baseline-'+suffix+'-result')['metrics'];result['regressions'][panel]={'baseline':baseline,'candidate':dev[panel]}
 result['regression_gate']=all(x['candidate']['ad_f1']>=x['baseline']['ad_f1']-.02 for x in result['regressions'].values());result['passed']=result['final_gate'] and result['regression_gate'];assert all(p.digest(f)==h for f,h in freeze.items());save('result',result);save('completed',{'completed':True,'passed':result['passed']});print(json.dumps(result),flush=True)
if __name__=='__main__':main()
