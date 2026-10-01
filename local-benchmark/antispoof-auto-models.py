"""Frozen scope-model comparison on existing automatically extracted diagnostics."""
import importlib.util,json,subprocess,time,gc
from pathlib import Path
s=importlib.util.spec_from_file_location('a',Path(__file__).with_name('antispoof-scope.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
R=Path('.runtime/antispoof-auto-models-v1')
SOURCE=Path('.runtime/antispoof-auto-scope-1790707068068/results.json')
def main(out_root=R, candidate_path=None, candidate_encode=None):
 R=Path(out_root);R.mkdir(exist_ok=False);data=a.read(SOURCE)
 js="const fs=require('fs'),{queries}=require('./agent/src/core/antispoof.cjs');console.log(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[1])).candidates.flatMap(queries)));"
 rows=json.loads(subprocess.check_output(['node','-e',js,str(SOURCE)],encoding='utf8'));assert len(rows)==216
 a.save(R/'inputs.json',rows);a.torch.set_num_threads(8);summary={}
 for arm,folder in [('baseline',Path('agent/models/kcelectra-antispoof-v1')),('scope',Path(candidate_path) if candidate_path else a.R/'scope/model')]:
  tok=a.p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=a.p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cpu').eval()
  encode=candidate_encode if arm!='baseline' and candidate_encode else a.d.encoded
  enc,lens=encode(tok,rows);assert max(lens)<=512;out=[];start=time.perf_counter()
  with a.torch.inference_mode():
   for i in range(0,len(enc),8):
    probs=model(**a.p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cpu')).logits.reshape(-1,2,3).softmax(-1)
    labels=probs.argmax(-1);labels[:,1]=a.torch.where(probs[:,1,0]>=.2,0,labels[:,1]);out.extend(labels.tolist())
  if arm=='baseline':assert out==[p['labels'] for d in data['before'] for p in d['antispoof']['predictions']],'Batch grouping changed baseline decisions'
  met={}
  for mode in ['normal_neighbor','digit_neighbor']:
   ids=[i for i,r in enumerate(data['rows']) if r['context']==mode]
   met[mode]={'n':len(ids),'J_target_present':sum(out[2*i][0]==0 for i in ids),'H_wrong_jamo':sum(out[2*i][1]==0 for i in ids),'H_latin_present':sum(out[2*i+1][1]==0 for i in ids),'H_candidate_present':sum(out[2*i][1]==0 or out[2*i+1][1]==0 for i in ids),'H_latin_uncertain':sum(out[2*i+1][1]==2 for i in ids)}
  summary[arm]={'panels':met,'seconds':time.perf_counter()-start,'model_sha256':a.p.digest(folder/'model.safetensors')};a.save(R/(arm+'-predictions.json'),out);del model;gc.collect()
 pins=a.read(a.R/'operating-before.json');assert all(a.p.digest(Path(f))==h for f,h in pins.items())
 a.save(R/'summary.json',summary);a.save(R/'audit.json',{'source_sha256':a.p.digest(SOURCE),'script_sha256':a.p.digest(Path(__file__)),'training':0,'api':0,'independent_evaluation':False,'final860_access':False,'production_files_unchanged':len(pins)})
 print(json.dumps(summary,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
