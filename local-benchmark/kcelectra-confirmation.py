import importlib.util,json,time,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('f',Path(__file__).with_name('kcelectra-fusion.py'));f=importlib.util.module_from_spec(s);s.loader.exec_module(f);p=f.p;R=Path('.runtime/kcelectra-confirmation-v1');PRIVATE=Path('local-benchmark/a-ft-confirmation-private.json')
def save(n,x):(R/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 if sys.argv[-1]=='score':
  rows=f.read(PRIVATE);gold={r['group']:r['label'] for r in rows};report={}
  for name in ['K_full','A','D','hcx-forward','hcx-reverse']:
   pred=f.read(R/(name+'-predictions.json'));assert len(pred)==len(gold) and {r['id'] for r in pred}==set(gold);report[name]=p.metrics([gold[r['id']] for r in pred],[r['prediction'] for r in pred])
  save('result',report);save('evaluation-status',{'campaigns':1,'observed_now':True,'future_use':'regression only','human_reviewed':False});print(json.dumps(report));return
 R.mkdir(exist_ok=False);assert p.digest(PRIVATE)=='845edf63d26543c7901e532a7da5636eddb483d7fb7b765e3eece4807da755db'
 assert not list(Path('.runtime').glob('a-finetune*/evaluation/confirmation-started.json'))
 paths={'K_full':Path('.runtime/kcelectra-freeze-v1/full/model'),'A':Path('.runtime/klue-cycle3-v1/frozen8/model'),'D':Path('.runtime/klue-audit-learning-v1/run-cpu/model')}
 save('frozen',{'models':{n:p.digest(d/'model.safetensors') for n,d in paths.items()},'private_sha256':p.digest(PRIVATE),'plan_hash':p.digest(Path('docs/kcelectra-confirmation-plan.md'))})
 raw=f.read(PRIVATE);rows=f.norm([{'id':r['group'],'input':{'target':r['target'],'context':r['context']}} for r in raw]);assert len(rows)==48
 train=f.norm(f.read('.runtime/klue-cycle3-v1/train.json')+f.read('.runtime/klue-audit-learning-v1/train.json'));dev=[r for rs in f.read('.runtime/klue-cycle3-v1/development.json').values() for r in f.norm(rs)];key=lambda r:json.dumps(r['input'],ensure_ascii=False,sort_keys=True)
 assert not {key(r) for r in rows}&{key(r) for r in train+dev};assert not {r['input']['target'] for r in rows}&{r['input']['target'] for r in train+dev};save('inputs',rows);save('overlap',{'exact_input':0,'target':0,'rows':48});p.torch.set_num_threads(8)
 for name,folder in paths.items():
  start=time.perf_counter();tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True);load=time.perf_counter()-start;enc,tr=p.encoded(tok,rows);assert tr==0;p.predict(model,tok,enc[:8]);pred,sec=p.predict(model,tok,enc);save(name+'-predictions',[{'id':r['id'],'prediction':v} for r,v in zip(rows,pred,strict=True)]);save(name+'-timing',{'cpu_seconds':sec,'load_seconds':load,'truncated':tr});del model
 save('classifiers-completed',{'completed':True});print('Classifiers completed; gold scoring deferred until HCX predictions are saved')
if __name__=='__main__':main()
