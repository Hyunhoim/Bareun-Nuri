import importlib.util,json,time
from pathlib import Path
s=importlib.util.spec_from_file_location('f',Path(__file__).with_name('kcelectra-fusion.py'));f=importlib.util.module_from_spec(s);s.loader.exec_module(f);p=f.p;torch=p.torch
R=Path('.runtime/kcelectra-calibration-v1')
def save(n,x):(R/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
 R.mkdir(exist_ok=False);torch.set_num_threads(8);folder=f.R/'D_only/model';assert p.digest(folder/'model.safetensors')==f.read(f.R/'D_only/frozen.json')['sha256']
 tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cuda').eval()
 def scores(rs):
  enc,tr=p.encoded(tok,rs);assert tr==0;out=[]
  with torch.inference_mode():
   for i in range(0,len(enc),8):out.extend(model(**p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cuda')).logits.softmax(-1).cpu().tolist())
  return out
 def predict(sc,t):return [max(range(4),key=lambda i:r[i]) if t is None else 0 if r[0]>=t else max(range(1,4),key=lambda i:r[i]) for r in sc]
 panels={k:f.norm(v) for k,v in f.read('.runtime/klue-cycle3-v1/development.json').items()};panels.update({'D64':f.norm(f.read('.runtime/klue-audit-learning-v1/validation.json')),'broad120':f.norm(f.read('.runtime/klue-broad-development-v1/rows.json')),'ownership44':f.norm(f.read('.runtime/klue-retention-v1/development.json'))})
 sc={k:scores(rs) for k,rs in panels.items()};history=[];best=None;choice=None;base=None
 for threshold in [None,.01,.03,.05,.1,.2,.3,.4,.5]:
  result={k:{'metrics':p.metrics([r['label'] for r in rs],predict(sc[k],threshold))} for k,rs in panels.items()}
  if base is None:base=result
  valid=all(v['metrics']['uncertain_as_ad']<=base[k]['metrics']['uncertain_as_ad']+.1*sum(r['label']==3 for r in panels[k]) for k,v in result.items())
  rank=f.rank(result);rec={'threshold':threshold,'eligible':valid,'rank':rank,'panels':result};history.append(rec)
  if valid and (best is None or rank>best):best=rank;choice=rec
 save('development',history);save('selection',choice)
 # Regression does not influence the selected threshold.
 rows=f.norm(f.read('.runtime/klue-contest-v1/inputs.json'));ss=scores(rows);ps=predict(ss,choice['threshold']);save('predictions',[{'id':r['id'],'prediction':v,'scores':sc} for r,v,sc in zip(rows,ps,ss,strict=True)])
 gold={r['id']:r for r in f.read('test-set-contest-v1/data/private/gold.json')};gm=[gold[r['id']] for r in rows]
 metric=lambda ix:p.metrics([0 if gm[i]['is_violation'] else 2 for i in ix],[ps[i] for i in ix])
 out={'threshold':choice['threshold'],'overall':metric(range(len(rows))),'by_technique':{t:metric([i for i,g in enumerate(gm) if g['technique']==t]) for t in sorted({g['technique'] for g in gm})},'independent_final':False};save('result',out);print(json.dumps(out));save('completed',{'completed':True})
if __name__=='__main__':main()
