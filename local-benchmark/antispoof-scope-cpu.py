"""Matched CPU latency and order checks on development only."""
import importlib.util,time,statistics,gc
from pathlib import Path
s=importlib.util.spec_from_file_location('a',Path(__file__).with_name('antispoof-scope.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
p=a.p;torch=a.torch

def main(out_root=None, candidate_encode=None):
 out_root=Path(out_root) if out_root else a.R
 rows=a.read(a.R/'dev-inputs.json');result={};torch.set_num_threads(8)
 for arm,path in [('baseline',Path('agent/models/kcelectra-antispoof-v1')),('scope',out_root/'scope/model')]:
  encode=candidate_encode if arm=='scope' and candidate_encode else a.d.encoded
  model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cpu').eval();tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True)
  def predict(enc):
   out=[]
   with torch.inference_mode():
    for i in range(0,len(enc),8):
     probs=model(**p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),'cpu')).logits.reshape(-1,2,3).softmax(-1);ps=probs.argmax(-1);ps[:,1]=torch.where(probs[:,1,0]>=.2,0,ps[:,1]);out+=ps.tolist()
   return out
  enc,_=encode(tok,rows[:8]);predict(enc);times=[];first=None
  for repeat in range(3):
   order=list(range(len(rows)));order=order[::-1] if repeat==1 else order
   start=time.perf_counter();enc,lens=encode(tok,[rows[i] for i in order]);assert max(lens)<=512
   ps=predict(enc);times.append(time.perf_counter()-start);found=dict(zip(order,ps,strict=True));ordered=[found[i] for i in range(len(rows))]
   if first is None:first=ordered
   else:assert first==ordered,'CPU order changed predictions'
  gpu=a.read(a.R/'baseline/scope-predictions.json') if arm=='baseline' else a.read(out_root/'scope'/f"epoch{a.read(out_root/'scope/selection.json')['epoch']}"/'scope-predictions.json')
  assert first==gpu,'CPU/GPU predictions differ'
  result[arm]={'rows':len(rows),'seconds':times,'median_seconds':statistics.median(times),'cpu_gpu_equal':True,'order_equal':True,'model_sha256':p.digest(path/'model.safetensors')}
  del model;gc.collect()
 a.save(out_root/'cpu.json',result);print(result,flush=True)

if __name__=='__main__':main()
