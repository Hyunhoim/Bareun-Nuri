"""One frozen ONNX / dynamic INT8 comparison, never an operating-model update."""
import argparse, collections, importlib.util, json, sys, time
from pathlib import Path
sys.path.insert(0,str(Path('.runtime/semantic-onnx-deps').resolve()))
s=importlib.util.spec_from_file_location('e',Path(__file__).with_name('semantic-encoder.py'))
e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
R=Path('.runtime/semantic-encoder-onnx-v1');REAL=Path('.runtime/semantic-encoder-real-v1')

def source(name):
    c=e.read(e.R/'research-candidates.json')['models'][name];f=Path(c['folder'])
    assert e.p.digest(f/'model.safetensors')==c['sha256']
    return f,c

def export(name):
    import onnx,onnxruntime as ort
    from onnxruntime.quantization import quantize_dynamic,QuantType
    from onnxruntime.quantization.shape_inference import quant_pre_process
    out=R/name;out.mkdir(parents=True,exist_ok=True);assert not (out/'export.json').exists();folder,c=source(name)
    e.torch.set_num_threads(8)
    tok=e.p.AutoTokenizer.from_pretrained(folder,local_files_only=True)
    model=e.p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True,attn_implementation='eager').eval()
    class Logits(e.torch.nn.Module):
        def __init__(self):super().__init__();self.model=model
        def forward(self,input_ids,attention_mask):return self.model(input_ids=input_ids,attention_mask=attention_mask).logits
    inputs=tok(['판정대상: 주민 상담 안내\n문맥: 공지입니다.'],return_tensors='pt',return_token_type_ids=False)
    start=time.perf_counter()
    with e.torch.inference_mode():
        e.torch.onnx.export(Logits(),(inputs['input_ids'],inputs['attention_mask']),str(out/'export.onnx'),
            input_names=['input_ids','attention_mask'],output_names=['logits'],opset_version=17,dynamo=False,
            dynamic_axes={'input_ids':{0:'batch',1:'sequence'},'attention_mask':{0:'batch',1:'sequence'},'logits':{0:'batch'}})
    onnx.checker.check_model(str(out/'export.onnx'))
    quant_pre_process(str(out/'export.onnx'),str(out/'fp32.onnx'),skip_optimization=True,skip_symbolic_shape=True)
    quantize_dynamic(str(out/'fp32.onnx'),str(out/'int8.onnx'),per_channel=True,weight_type=QuantType.QInt8,op_types_to_quantize=['MatMul'])
    counts={}
    for kind in ['fp32','int8']:
        m=onnx.load(str(out/(kind+'.onnx')));onnx.checker.check_model(m)
        counts[kind]=dict(collections.Counter(n.op_type for n in m.graph.node))
    assert counts['int8'].get('MatMulInteger',0)>0
    e.save(out/'export.json',dict(model=c,seconds=time.perf_counter()-start,versions=dict(torch=e.torch.__version__,onnx=onnx.__version__,ort=ort.__version__),
        files={p.name:dict(sha256=e.p.digest(p),bytes=p.stat().st_size) for p in out.glob('*.onnx')},operators=counts,
        script_sha256=e.p.digest(__file__),plan_sha256=e.p.digest('docs/semantic-encoder-onnx-plan.md')))
    e.log({'exported':name,'seconds':time.perf_counter()-start,'quantized_matmul':counts['int8']['MatMulInteger']})

def panels(name):
    _,dev,keys=e.rows();folder,_=source(name)
    base=e.read(folder.parent/'selected-cpu-probabilities.json')
    yield 'development',dev,keys,{r['id']:dict(p_ad=r['p_ad'],prediction=int(r['p_ad']>=.5)) for r in base}
    original=e.read('.runtime/slm-three/inputs.json');excluded=set(e.read(e.R/'regression/manifest.json')['excluded'])
    rows=[dict(id=r['panel']+'/'+r['id'],input=r['input']) for r in original if r['panel']+'/'+r['id'] not in excluded]
    labels=[dict(id=r['panel']+'/'+r['id'],label=None if r['label']==3 else int(r['label']==0)) for r in original if r['panel']+'/'+r['id'] not in excluded]
    base={r['id']:r for r in e.read(e.R/f'regression/{name}-predictions.json')}
    yield 'hcx-observed',rows,labels,base
    rows=e.read('.runtime/klue-contest-v1/inputs.json');gold={r['id']:r for r in e.read('test-set-contest-v1/data/private/gold.json')}
    base=e.read(e.R/f'retention/{name}-predictions.json');rows=[r for r in rows if r['id'] in base]
    yield 'retention',rows,[dict(id=r['id'],label=int(gold[r['id']]['is_violation'])) for r in rows],{k:dict(prediction=v) for k,v in base.items()}
    rows=e.read(REAL/'inputs.json');base={r['id']:{**r,'prediction':r['raw_prediction']} for r in e.read(REAL/name/'predictions.json')}
    yield 'real',rows,None,base

def infer(name,kind):
    import numpy as np,onnxruntime as ort,psutil
    dest=R/name/kind;dest.mkdir(exist_ok=False);folder,_=source(name);e.torch.set_num_threads(8)
    export=e.read(R/name/'export.json');model=R/name/(kind+'.onnx')
    assert e.p.digest(model)==export['files'][model.name]['sha256']
    tok=e.p.AutoTokenizer.from_pretrained(folder,local_files_only=True)
    options=ort.SessionOptions();options.intra_op_num_threads=8;options.inter_op_num_threads=1
    start=time.perf_counter();session=ort.InferenceSession(str(model),options,providers=['CPUExecutionProvider']);load=time.perf_counter()-start
    def run(enc):
        output=[];start=time.perf_counter()
        for i in range(0,len(enc),8):
            batch=dict(tok.pad(enc[i:i+8],padding=True,return_tensors='np'))
            logits=session.run(['logits'],batch)[0];assert logits.shape==(len(enc[i:i+8]),2) and np.isfinite(logits).all()
            shifted=logits-logits.max(axis=1,keepdims=True);ex=np.exp(shifted);output.extend((ex[:,1]/ex.sum(axis=1)).tolist())
        return output,time.perf_counter()-start
    # Dynamic shape and maximum length execution are checked before corpus inference.
    for n,length in [(1,2),(3,17),(8,512)]:
        ids=np.full((n,length),tok.pad_token_id,dtype=np.int64);ids[:,0]=tok.cls_token_id;ids[:,-1]=tok.sep_token_id
        y=session.run(None,{'input_ids':ids,'attention_mask':np.ones_like(ids)})[0]
        assert y.shape==(n,2) and np.isfinite(y).all()
    report={}
    for panel,rows,keys,base in panels(name):
        assert len(base)==len(rows) and len({r['id'] for r in rows})==len(rows)
        start=time.perf_counter();enc,lengths=e.encode(tok,rows,512);encoding=time.perf_counter()-start
        run(enc[:8]);probs,sec=run(enc);truncated=set(lengths['truncated_ids']);pred={r['id']:int(p>=.5) for r,p in zip(rows,probs,strict=True)}
        gold={} if keys is None else {k['id']:k['label'] for k in keys}
        changes=[r['id'] for r in rows if pred[r['id']]!=base[r['id']]['prediction']]
        drift=[abs(p-base[r['id']]['p_ad']) for r,p in zip(rows,probs,strict=True) if base[r['id']].get('p_ad') is not None]
        lost=[k for k,y in gold.items() if y==1 and base[k]['prediction']==1 and pred[k]!=1]
        newfp=[k for k,y in gold.items() if y==0 and base[k]['prediction']!=1 and pred[k]==1]
        outputs=[];guard_changes=0;confidence_changes=0
        for row,p in zip(rows,probs,strict=True):
            guard=(['token_limit'] if row['id'] in truncated else [])+(['collection_context_truncated'] if row.get('collection_truncated') else [])
            safe=None if guard else int(p>=.5);conf=None if guard or .2<p<.8 else int(p>=.5)
            if panel=='real':
                assert guard==base[row['id']]['guard'];guard_changes+=safe!=base[row['id']]['safe_prediction'];confidence_changes+=conf!=base[row['id']]['confidence_prediction']
            outputs.append(dict(id=row['id'],p_ad=p,prediction=int(p>=.5),safe_prediction=safe,confidence_prediction=conf,guard=guard))
        e.save(dest/(panel+'-predictions.json'),outputs)
        report[panel]=dict(rows=len(rows),seconds=sec,tokenization_seconds=encoding,changed_ids=changes,lost_tp=lost,new_fp=newfp,
            max_probability_delta=max(drift) if drift else None,mean_probability_delta=float(np.mean(drift)) if drift else None,
            safe_prediction_changes=guard_changes,confidence_changes=confidence_changes,metrics=None if keys is None else e.v.metrics(keys,pred),
            input_sha256=__import__('hashlib').sha256(json.dumps(rows,sort_keys=True,ensure_ascii=False).encode()).hexdigest())
        e.save(dest/'report.json',report);e.log({'model':name,'format':kind,'panel':panel,'seconds':sec,'changes':len(changes),'lost_tp':len(lost),'new_fp':len(newfp)})
    preserved=all(not p['changed_ids'] and (p['max_probability_delta'] is None or p['max_probability_delta']<=1e-4) for p in report.values()) if kind=='fp32' else all(not p['lost_tp'] and not p['new_fp'] for p in report.values()) and not report['real']['changed_ids']
    reference=e.read(REAL/name/'result.json')['inference_seconds'];ratio=report['real']['seconds']/reference
    e.save(dest/'completed.json',dict(model=name,format=kind,preservation_gate=preserved,speed_ratio_to_prior_pytorch=ratio,speed_gate=ratio<=.8,
        load_seconds=load,memory=psutil.Process().memory_info()._asdict(),model_sha256=e.p.digest(model),script_sha256=e.p.digest(__file__),
        providers=session.get_providers(),api_calls=0,operating_adoption=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('name',choices=['klue','kc','ko']);p.add_argument('action',choices=['export','fp32','int8']);a=p.parse_args()
    export(a.name) if a.action=='export' else infer(a.name,a.action)
