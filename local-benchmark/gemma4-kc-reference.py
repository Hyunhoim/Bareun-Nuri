"""Existing frozen Kc on the same observed 221 inputs; no training."""
import importlib.util,json,time
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
out=Path('.runtime/gemma4-cpu/kc-reference.json');assert not out.exists()
rows=json.loads(Path('.runtime/slm-three/inputs.json').read_text(encoding='utf8'));folder='.runtime/kcelectra-freeze-v1/full/model'
p.torch.set_num_threads(8);t=time.perf_counter();tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cpu');load=time.perf_counter()-t
t=time.perf_counter();enc,tr=p.encoded(tok,rows);encoding=time.perf_counter()-t;p.predict(model,tok,enc[:8]);pred,sec=p.predict(model,tok,enc)
out.write_text(json.dumps(dict(model=folder,model_hash=p.digest(Path(folder)/'model.safetensors'),input_hash=p.digest('.runtime/slm-three/inputs.json'),rows=[dict(id=r['id'],panel=r['panel'],prediction=y) for r,y in zip(rows,pred,strict=True)],seconds=sec,encoding_seconds=encoding,load_seconds=load,truncated=tr,threads=8,device='cpu',batch=8),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(seconds=sec,truncated=tr,n=len(pred))),flush=True)
