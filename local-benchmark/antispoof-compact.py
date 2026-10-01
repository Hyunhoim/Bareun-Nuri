"""One lossless evidence-format intervention on frozen weights; no training/API."""
import importlib.util,json,statistics,time,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('t',Path(__file__).with_name('antispoof-typed.py'));t=importlib.util.module_from_spec(s);s.loader.exec_module(t)
a=t.a;R=Path('.runtime/antispoof-compact-v1')

def evidence(token,m):
 old=json.loads(t.evidence(token,m).split(': ',1)[1]);new=dict(old)
 for k in ['자모관련대응','기타문자대응']:
  new[k]=[[x[0],x[1],x[3]] for x in old[k]]
  assert [[i,c,f'U+{ord(c):04X}',v,' '.join(f'U+{ord(z):04X}' for z in v)] for i,c,v in new[k]]==old[k]
 return '\nUnicode 문자 대응(위장 확정 아님): '+json.dumps(new,ensure_ascii=False,separators=(',',':'))

def encode(tok,rows,fn,m):
 texts=['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context']+fn(r['token'],m) for r in rows]
 enc=tok(texts,truncation=False,return_token_type_ids=False)
 return [{k:v[i] for k,v in enc.items()} for i in range(len(rows))],[len(v) for v in enc['input_ids']]

def main():
 assert not (R/'lengths.json').exists(),'Preserve previous diagnostics'
 tok=a.p.AutoTokenizer.from_pretrained(t.R/'scope/model',local_files_only=True);m=a.d.c.mapping();panels=a.panels();lengths={};encs={}
 for name,rows in [('live',a.read(R/'live-inputs.json'))]+[(n,r) for n,(r,g) in panels.items()]:
  parts={}
  for arm,fn in [('typed',t.evidence),('compact',evidence)]:
   enc,lens=encode(tok,rows,fn,m);parts[arm]={'mean':statistics.mean(lens),'max':max(lens),'over512':sum(v>512 for v in lens),'lengths':lens};encs[name,arm]=(enc,lens)
  parts['rows']=[{'id':r['id'],'base_tokens':len(tok('판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context'])['input_ids']),'typed':parts['typed']['lengths'][i],'compact':parts['compact']['lengths'][i]} for i,r in enumerate(rows)];lengths[name]=parts
 a.save(R/'lengths.json',lengths);print(json.dumps({n:{k:{x:v[x] for x in ['mean','max','over512']} for k,v in d.items() if k!='rows'} for n,d in lengths.items()}),flush=True)
 model=a.p.AutoModelForSequenceClassification.from_pretrained(t.R/'scope/model',local_files_only=True).to('cuda').eval();a.torch.set_num_threads(8);result={};passed=True
 for name,(rows,gold) in panels.items():
  out={};preds={}
  for arm in ['typed','compact']:
   enc,lens=encs[name,arm];valid=[i for i,n in enumerate(lens) if n<=512 and not rows[i].get('collection_truncated')];p=a.predict(model,tok,[enc[i] for i in valid]);by=dict(zip(valid,p,strict=True));preds[arm]=[by.get(i,[2,2]) for i in range(len(rows))];out[arm]=a.d.metric([g['labels'] for g in gold],preds[arm]);a.save(R/(name+'-'+arm+'.json'),preds[arm])
  lost=sum(g['labels'][j]==0 and b[j]==0 and c[j]!=0 for g,b,c in zip(gold,preds['typed'],preds['compact'],strict=True) for j in [0,1]);ok=lost==0 and out['compact']['positive_macro_f1']>=out['typed']['positive_macro_f1'] and out['compact']['normal_false']+out['compact']['uncertain_false']<=out['typed']['normal_false']+out['typed']['uncertain_false'];passed &= ok
  result[name]={'metrics':out,'lost_positive':lost,'pass':ok};print(json.dumps({name:result[name]}),flush=True)
 pins=a.read(a.R/'operating-before.json');assert all(a.p.digest(Path(f))==h for f,h in pins.items())
 a.save(R/'summary.json',{'pass':passed,'panels':result,'training':0,'api':0,'final860_access':False,'source_model_sha256':a.p.digest(t.R/'scope/model/model.safetensors'),'script_sha256':a.p.digest(Path(__file__)),'plan_sha256':a.p.digest(Path('docs/antispoof-compact-plan.md'))})
def train():
 assert (R/'summary.json').exists() and not a.read(R/'summary.json')['pass']
 def encoded(tok,rows):return encode(tok,rows,evidence,a.d.c.mapping())
 a.d.encoded=encoded
 a.save(R/'corrected-training-manifest.json',{'plan_sha256':a.p.digest(Path('docs/antispoof-compact-training-plan.md')),'script_sha256':a.p.digest(Path(__file__)),'training_inputs_sha256':a.p.digest(Path('.runtime/antispoof-sparse-v1/train-inputs.json')),'evaluation_training':False,'previous_matched_run_invalid':True})
 a.run('scope',out_root=R,extra_pairs=list(zip(a.read(Path('.runtime/antispoof-sparse-v1/train-inputs.json')),a.read(Path('.runtime/antispoof-sparse-v1/train-gold.json')),strict=True)))
if __name__=='__main__':train() if '--train' in sys.argv else main()
