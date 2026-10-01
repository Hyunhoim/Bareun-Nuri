"""Fixed development-only bias grid, A and tuned model compared fairly."""
import importlib.util,json,time
from pathlib import Path
s=importlib.util.spec_from_file_location('ft',Path(__file__).with_name('a-finetune.py'));ft=importlib.util.module_from_spec(s);s.loader.exec_module(ft)
p=ft.p;R=Path('.runtime/a-finetune-calibration-v1')
def save(n,x):(R/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def logits(model,tok,encoded):
 model.eval();out=[];start=time.perf_counter()
 with p.torch.inference_mode():
  for i in range(0,len(encoded),8):out.extend(model(**p.batches(tok,encoded,list(range(i,min(i+8,len(encoded)))),'cpu')).logits.tolist())
 return out,time.perf_counter()-start
def auc(ys,z):
 pos=[v[0]-max(v[1:]) for y,v in zip(ys,z) if y==0];neg=[v[0]-max(v[1:]) for y,v in zip(ys,z) if y in [1,2]]
 return sum(1 if a>b else .5 if a==b else 0 for a in pos for b in neg)/(len(pos)*len(neg))
def main():
 R.mkdir(exist_ok=False);p.torch.set_num_threads(8);start=time.perf_counter();frozen=ft.read('.runtime/a-finetune-v4/frozen.json')
 for f,h in frozen.items():assert p.digest(f)==h
 frozen.update({str(f):p.digest(f) for f in [Path(__file__),Path('docs/a-finetune-calibration-plan.md'),Path('.runtime/a-finetune-v4/blend50/model/model.safetensors')]});save('frozen',frozen)
 data=ft.read('local-benchmark/a-ft-new-data.json');panels={'new':ft.norm(data['development']),'broad':ft.norm(ft.read('.runtime/klue-broad-development-v1/rows.json')),'ownership':ft.norm(ft.read('.runtime/klue-retention-v1/development.json'))};base=ft.read(ft.R/'baseline.json');save('baseline',base)
 tok=p.AutoTokenizer.from_pretrained(ft.SRC,local_files_only=True);enc={k:p.encoded(tok,rs)[0] for k,rs in panels.items()};results={};rank={};sources={'A':ft.SRC,'blend50':Path('.runtime/a-finetune-v4/blend50/model')}
 for name,src in sources.items():
  model=p.AutoModelForSequenceClassification.from_pretrained(src,local_files_only=True);raw={k:logits(model,tok,e)[0] for k,e in enc.items()};save(name+'-logits',raw);rank[name]={k:auc([r['label'] for r in panels[k]],z) for k,z in raw.items()}
  for bias in [0,.5,1,2]:
   rs={}
   for k,z in raw.items():
    ps=[max(range(4),key=lambda j:v[j]+(bias if j==0 else 0)) for v in z];rs[k]={'metrics':p.metrics([r['label'] for r in panels[k]],ps),'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(panels[k],ps,strict=True)]}
   key=ft.score(rs,base);arm=name+'-bias'+str(bias).replace('.','_');results[arm]={'step':0,'parent':name,'ad_bias':bias,'score':key,'panels':rs};print(json.dumps({'arm':arm,'score':key,'F1':{k:v['metrics']['ad_f1'] for k,v in rs.items()}}),flush=True)
  del model
 save('candidates',results);save('ranking',rank);eligible=[a for a,v in results.items() if v['score'][0]];chosen=max(eligible,key=lambda a:(tuple(results[a]['score']),-results[a]['ad_bias'],results[a]['parent']=='A')) if eligible else None
 if chosen:
  model=p.AutoModelForSequenceClassification.from_pretrained(sources[results[chosen]['parent']],local_files_only=True);model.save_pretrained(R/chosen/'model');tok.save_pretrained(R/chosen/'model')
 save('selection',{'arm':chosen,'ad_bias':results[chosen]['ad_bias'] if chosen else None,'model_hash':p.digest(R/chosen/'model/model.safetensors') if chosen else None,'confirmation_opened':False})
 for f,h in frozen.items():assert p.digest(f)==h
 assert time.perf_counter()-start<1200
 save('completed',{'complete':True,'selected':chosen,'training':0});print(json.dumps({'selected':chosen,'ranking':rank}),flush=True)
if __name__=='__main__':main()
