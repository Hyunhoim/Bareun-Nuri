"""Check learned training roles before proposing more epochs or consistency loss."""
import importlib.util,json
from pathlib import Path
s=importlib.util.spec_from_file_location('d',Path(__file__).with_name('dual-technique.py'));d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
p=d.p;torch=d.torch;R=d.R
def main():
 out=R/'input-audit/training-roles.json';assert not out.exists();rows=d.read(R/'followup/train-inputs.json');gold=d.read(R/'followup/train-gold.json');exclude=set(d.read(R/'kc-density-role/started.json')['excluded_observed_families']);pairs=[(r,g,i%4) for i,(r,g) in enumerate(zip(rows,gold,strict=True)) if r['group_id'] not in exclude];rows=[r for r,g,k in pairs];gold=[g for r,g,k in pairs];roles=[k for r,g,k in pairs];torch.set_num_threads(8);path=R/'kc-density-role/model';tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda');model.eval();enc,lens=d.encoded(tok,rows);assert max(lens)<=512;probs=[]
 with torch.inference_mode():
  for i in range(0,len(enc),8):probs.extend(model(**p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cuda')).logits.reshape(-1,2,3).softmax(-1).cpu().tolist())
 ps=[[max(range(3),key=lambda k:v[j][k]) for j in range(2)] for v in probs]
 stats={}
 for k,name in enumerate(['offer','education','identifier','insufficient']):
  ix=[i for i,v in enumerate(roles) if v==k];stats[name]={'rows':len(ix),'argmax_correct':sum(ps[i]==gold[i]['labels'] for i in ix),'present':sum(ps[i][1]==0 for i in ix),'mean_gold_probability':sum(probs[i][1][gold[i]['labels'][1]] for i in ix)/len(ix)}
 discrepancies=[abs(probs[i][1][0]-probs[i+1][1][0]) for i in range(0,len(rows),4)];d.save(out,{'roles':stats,'mean_offer_education_probability_gap':sum(discrepancies)/len(discrepancies),'ids':[r['id'] for r in rows],'probabilities':probs,'labels':ps,'scope':'training diagnosis, not evaluation','model_sha256':p.digest(path/'model.safetensors')});print(json.dumps({'roles':stats,'mean_gap':sum(discrepancies)/len(discrepancies)}),flush=True)
if __name__=='__main__':main()
