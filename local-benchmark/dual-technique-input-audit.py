"""Information ablations, not alternative production verdicts or new evaluations."""
import importlib.util,json,copy,hashlib
from pathlib import Path
s=importlib.util.spec_from_file_location('d',Path(__file__).with_name('dual-technique.py'));d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
p=d.p;torch=d.torch;R=d.R;OUT=R/'input-audit'
def main():
 OUT.mkdir(exist_ok=False);rows=d.read(R/'followup/dev-inputs.json');gold=d.read(R/'followup/dev-gold.json');assert [r['id'] for r in rows]==[g['id'] for g in gold];path=R/'kc-density-role/model';assert p.digest(path/'model.safetensors')==d.read(R/'calibration-selection.json')['sha256'];torch.set_num_threads(8);tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda');model.eval();summary={};full=None
 for mode in ['full','no_unicode','no_side_context','glyph_only','no_glyph']:
  adapted=copy.deepcopy(rows)
  for r in adapted:
   if mode=='no_side_context':r['input']['context']=''
   elif mode=='glyph_only':r['input']={'target':'[표기]'+r['token']+'[/표기]','context':''}
   elif mode=='no_glyph':r['input']['target']=r['input']['target'].replace('[표기]'+r['token']+'[/표기]','[대상 생략]');r['token']=''
  enc,lens=d.c.encode(tok,adapted,'existing' if mode in ['no_unicode','no_glyph'] else 'klue_uts',d.c.mapping());assert max(lens)<=512;probs=[]
  with torch.inference_mode():
   for i in range(0,len(enc),8):probs.extend(model(**p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cuda')).logits.reshape(-1,2,3).softmax(-1).cpu().tolist())
  ps=[[max(range(3),key=lambda i:v[j][i]) for j in range(2)] for v in probs]
  for v,q in zip(ps,probs,strict=True):
   if q[1][0]>=.2:v[1]=0
  if full is None:full=ps
  stats={}
  for role,index in [('offer',0),('education',1),('identifier',2),('insufficient',3)]:
   ids=list(range(index,len(rows),4));assert len(ids)==75
   stats[role]={'rows':len(ids),'H_present':sum(ps[i][1]==0 for i in ids),'H_absent':sum(ps[i][1]==1 for i in ids),'H_uncertain':sum(ps[i][1]==2 for i in ids),'same_as_full':sum(ps[i]==full[i] for i in ids),'original_label_agreement_not_intervention_accuracy':sum(ps[i]==gold[i]['labels'] for i in ids)}
  summary[mode]=stats;d.save(OUT/(mode+'.json'),{'inputs':adapted,'probabilities':probs,'predictions':ps,'scope':'diagnostic interventions, original gold is not a valid unchanged task label after information removal'})
 d.save(OUT/'summary.json',summary);d.save(OUT/'audit.json',{'source_sha256':p.digest(R/'followup/dev-inputs.json'),'model_sha256':p.digest(path/'model.safetensors'),'plan_sha256':p.digest(Path('docs/dual-technique-input-audit-plan.md')),'final_used':False,'training':0,'api_calls':0});print(json.dumps(summary),flush=True)
if __name__=='__main__':main()
