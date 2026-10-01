"""A input-only controlled comparisons. No evaluation text is used for training."""
import importlib.util,json,subprocess,unicodedata,collections
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
def read(f):return json.loads(Path(f).read_text(encoding='utf8'))
def main():
 root=Path('.runtime/a-generalization-v1');root.mkdir(exist_ok=False)
 def save(n,x):(root/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
 source=Path('.runtime/klue-cycle3-v1/frozen8/model');p.torch.set_num_threads(8)
 gold={r['id']:r for r in read('test-set-contest-v1/data/private/gold.json')};prior={r['id']:r['prediction'] for r in read('.runtime/klue-contest-v1/candidate-predictions.json')}
 panels={k:read(v) for k,v in {'regression':'.runtime/klue-input-audit-v2/corrected-inputs.json','broad':'.runtime/klue-broad-development-v1/rows.json','ownership':'.runtime/klue-retention-v1/development.json'}.items()}
 freeze={str(f):p.digest(f) for f in [*source.glob('*'),Path(__file__),Path('local-benchmark/a-reading.cjs'),Path('docs/a-generalization-plan.md'),Path('test-set-contest-v1/data/private/gold.json')] if f.is_file()};save('frozen',freeze)
 errors=[]
 for r in panels['regression']:
  g=gold[r['id']];pred=prior[r['id']]
  if (pred==0)!=g['is_violation']:errors.append({**g,'input':r['input'],'prediction':pred,'error':'FN' if g['is_violation'] else 'FP'})
 save('errors',errors);save('error-summary',{t:{e:dict(collections.Counter(r['scenario_family'] for r in errors if r['technique']==t and r['error']==e)) for e in ['FN','FP']} for t in ['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN']})
 tok=p.AutoTokenizer.from_pretrained(source,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True).to('cpu');results={}
 for panel,orig in panels.items():
  orig=[{**r,'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()}} for r in orig];ys=[(0 if gold[r['id']]['is_violation'] else 2) if panel=='regression' else r['label'] for r in orig];results[panel]={}
  proc=subprocess.run(['node','-e',"const fs=require('fs'),{reading}=require('./local-benchmark/a-reading.cjs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8')).map(reading)))"],input=json.dumps([r['input']['target'] for r in orig],ensure_ascii=False),capture_output=True,text=True,encoding='utf8',check=True);readings=json.loads(proc.stdout)
  for mode in ['baseline','no_page_title','jamo_reading']:
   rows=[]
   for r,rd in zip(orig,readings,strict=True):
    inp=dict(r['input'])
    if mode=='no_page_title':inp['context']='\n'.join(inp['context'].split('\n')[1:])
    if mode=='jamo_reading':inp['target']=rd
    rows.append({**r,'input':inp})
   save(panel+'-'+mode+'-inputs',rows);encoded,tr=p.encoded(tok,rows);pred,sec=p.predict(model,tok,encoded,8,'cpu')
   if panel=='regression' and mode=='baseline':assert pred==[prior[r['id']] for r in orig]
   base=pred if mode=='baseline' else [x['prediction'] for x in results[panel]['baseline']['predictions']]
   changes={k:[] for k in ['lost_tp','gained_tp','fixed_fp','new_fp']}
   for r,y,a,b in zip(rows,ys,base,pred,strict=True):
    if y==3 or (a==0)==(b==0):continue
    changes[('lost_tp' if a==0 else 'gained_tp') if y==0 else ('fixed_fp' if a==0 else 'new_fp')].append(r['id'])
   result={'metrics':p.metrics(ys,pred),'seconds':sec,'truncated':tr,'changed_inputs':sum(a['input']!=b['input'] for a,b in zip(orig,rows)),'changes':changes,'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rows,pred,strict=True)]}
   if panel=='regression':result['techniques']={t:p.metrics([y for r,y in zip(rows,ys) if gold[r['id']]['technique']==t],[v for r,v in zip(rows,pred) if gold[r['id']]['technique']==t]) for t in ['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN']}
   results[panel][mode]=result;save('results',results);print(json.dumps({'panel':panel,'mode':mode,'metrics':result['metrics'],'changed':result['changed_inputs']}),flush=True)
 for f,h in freeze.items():assert p.digest(f)==h
 save('completed',{'complete':True,'training':0,'production_changes':0})
if __name__=='__main__':main()
