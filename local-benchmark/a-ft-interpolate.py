"""Fixed A-to-tuned weight interpolation; one model at inference."""
import importlib.util,json,time
from pathlib import Path
s=importlib.util.spec_from_file_location('ft',Path(__file__).with_name('a-finetune.py'));ft=importlib.util.module_from_spec(s);s.loader.exec_module(ft)
p=ft.p;R=Path('.runtime/a-finetune-v4');PREV=Path('.runtime/a-finetune-v3')
def save(n,x):(R/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 assert ft.read(PREV/'selection.json')['arm'] is None
 R.mkdir(exist_ok=False);torch=p.torch;torch.set_num_threads(8);start=time.perf_counter()
 cs=ft.read(PREV/'candidates.json');parent=max(cs,key=lambda a:tuple(cs[a]['score'][1:]));parentpath=PREV/parent/'model';frozen=ft.read(PREV/'frozen.json')
 for f,h in frozen.items():assert p.digest(f)==h
 frozen.update({str(f):p.digest(f) for f in [Path(__file__),Path('docs/a-finetune-round4-plan.md'),parentpath/'model.safetensors']});save('frozen',frozen)
 original=p.AutoModelForSequenceClassification.from_pretrained(ft.SRC,local_files_only=True);other=p.AutoModelForSequenceClassification.from_pretrained(parentpath,local_files_only=True);a={k:v.clone() for k,v in original.state_dict().items()};b=other.state_dict();assert set(a)==set(b)
 tok=p.AutoTokenizer.from_pretrained(ft.SRC,local_files_only=True);data=ft.read('local-benchmark/a-ft-new-data.json');panels={'new':ft.norm(data['development']),'broad':ft.norm(ft.read('.runtime/klue-broad-development-v1/rows.json')),'ownership':ft.norm(ft.read('.runtime/klue-retention-v1/development.json'))};enc={k:p.encoded(tok,rs)[0] for k,rs in panels.items()};base=ft.read(ft.R/'baseline.json');save('baseline',base);results={}
 for alpha in [.25,.5]:
  assert time.perf_counter()-start<1200
  state={}
  for k,v in a.items():
   assert v.shape==b[k].shape and v.dtype==b[k].dtype
   if v.is_floating_point():state[k]=v+alpha*(b[k]-v)
   else:assert torch.equal(v,b[k]);state[k]=v
  original.load_state_dict(state);rs=ft.evaluate(original,tok,panels,enc);key=ft.score(rs,base);name='blend'+str(int(alpha*100));original.save_pretrained(R/name/'model');tok.save_pretrained(R/name/'model');results[name]={'step':0,'alpha':alpha,'parent':parent,'score':key,'panels':rs};save('candidates',results);print(json.dumps({'arm':name,'score':key,'F1':{k:v['metrics']['ad_f1'] for k,v in rs.items()}}),flush=True)
 eligible=[k for k,v in results.items() if v['score'][0]];chosen=max(eligible,key=lambda k:tuple(results[k]['score'])) if eligible else None
 save('selection',{'arm':chosen,'model_hash':p.digest(R/chosen/'model/model.safetensors') if chosen else None,'confirmation_opened':False})
 for f,h in frozen.items():assert p.digest(f)==h
 save('completed',{'complete':True,'selected':chosen,'training':0});print(json.dumps({'selected':chosen}),flush=True)
if __name__=='__main__':main()
