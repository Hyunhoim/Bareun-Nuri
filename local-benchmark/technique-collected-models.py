"""Frozen models on saved collector inputs; never derive gold from model output."""
import importlib.util,json,time
from pathlib import Path
s=importlib.util.spec_from_file_location('t',Path(__file__).with_name('technique-specialist-train.py'));t=importlib.util.module_from_spec(s);s.loader.exec_module(t);p=t.p
ROOT=Path('.runtime/technique-collected-v1')
def main():
    assert not (ROOT/'models.json').exists();rows=t.read(ROOT/'inputs.json');p.torch.set_num_threads(8);result={}
    for name,folder in [('first','.runtime/technique-specialist-model-v1'),('role','.runtime/technique-role-model-v1')]:
        start=time.perf_counter();assert p.digest(Path(folder)/'model/model.safetensors')==t.read(Path(folder)/'frozen.json')['model_sha256'];tok=p.AutoTokenizer.from_pretrained(folder+'/model',local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(folder+'/model',local_files_only=True).to('cpu');load=time.perf_counter()-start
        inp,trunc=p.encoded(tok,rows);lengths=[len(x) for x in tok(['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context'] for r in rows],truncation=False)['input_ids']];pred,secs=p.predict(model,tok,inp,device='cpu');result[name]={'load_seconds':load,'cpu_seconds':secs,'truncated':trunc,'rows':[{'id':r['id'],'label':v if n<=512 and not r['collection_truncated'] else 2,'raw_label':v,'tokens':n,'protected':n>512 or r['collection_truncated']} for r,v,n in zip(rows,pred,lengths)]};del model
    result['agreement']={'rows':[{'id':a['id'],'label':a['label'] if a['label']==b['label'] else 2} for a,b in zip(result['first']['rows'],result['role']['rows'])]}
    (ROOT/'models.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({k:{'substitution':sum(x['label']==0 for x in v['rows']),'literal':sum(x['label']==1 for x in v['rows']),'uncertain':sum(x['label']==2 for x in v['rows']),'cpu_seconds':v.get('cpu_seconds')} for k,v in result.items()}))
if __name__=='__main__':main()
