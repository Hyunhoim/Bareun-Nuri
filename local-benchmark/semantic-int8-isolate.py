"""Fixed weight-only rounding and batch isolation controls; no semantic labels."""
import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('trace',Path(__file__).with_name('semantic-int8-trace.py'));t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
np,onnx,ort=t.np,t.onnx,t.ort
ROOT=Path('.runtime/semantic-int8-isolate-v1')
def runtime(model):
    o=ort.SessionOptions();o.intra_op_num_threads=8;o.inter_op_num_threads=1;o.graph_optimization_level=ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    return ort.InferenceSession(model,o,providers=['CPUExecutionProvider'])
def main():
    ROOT.mkdir(exist_ok=False)
    prior=json.loads(Path('.runtime/semantic-int8-numeric-v1/kc/result.json').read_text());manifest=json.loads((t.BASE/'export.json').read_text());config=json.loads((Path(manifest['model']['folder'])/'config.json').read_text())
    rng=np.random.default_rng(42);inputs=[]
    for batch,length in [(1,16),(8,16),(1,64),(8,64)]:
        ids=rng.integers(100,config['vocab_size'],(batch,length),dtype=np.int64);mask=np.ones_like(ids)
        if batch>1:mask[1:,length//2:]=0;ids[1:,length//2:]=config.get('pad_token_id',0)
        inputs.append(dict(input_ids=ids,attention_mask=mask))
    assert t.hashlib.sha256(b''.join(v.tobytes() for x in inputs for v in x.values())).hexdigest()==prior['input_sha256']
    for kind,h in prior['files'].items():assert h==t.sha(t.BASE/(kind+'.onnx'))
    quant=onnx.load(str(t.BASE/'int8.onnx'));q={x.name:t.numpy_helper.to_array(x) for x in quant.graph.initializer}
    model=onnx.load(str(t.BASE/'fp32.onnx'));changed=[]
    for initializer in model.graph.initializer:
        name=initializer.name
        if name+'_quantized' not in q:continue
        a=(q[name+'_quantized'].astype(np.float32)-q[name+'_zero_point'])*q[name+'_scale']
        if name.startswith('model.classifier.'):a=a.T
        assert list(a.shape)==list(initializer.dims)
        initializer.CopyFrom(t.numpy_helper.from_array(a.copy(),name));changed.append(name)
    assert len(changed)==74
    onnx.checker.check_model(model)
    s=runtime(model.SerializeToString());weight_outputs=[s.run(None,x)[0] for x in inputs];del s,model,q,quant
    raw={(x['format'],x['optimized']):x['outputs'] for x in prior['logits']}
    weight_rows=[dict(shape=list(x['input_ids'].shape),weight_only_vs_fp32=t.stats(np.array(raw['fp32',False][i]),weight_outputs[i]),int8_vs_weight_only=t.stats(weight_outputs[i],np.array(raw['int8',False][i])),logits=weight_outputs[i].tolist()) for i,x in enumerate(inputs)]
    batch_rows=[]
    for kind in ['fp32','int8']:
        s=runtime(str(t.BASE/(kind+'.onnx')))
        for i in [1,3]:
            feed=inputs[i];out=np.concatenate([s.run(None,{k:v[j:j+1] for k,v in feed.items()})[0] for j in range(8)])
            batch_rows.append(dict(format=kind,shape=list(feed['input_ids'].shape),**t.stats(np.array(raw[kind,False][i]),out),standalone_logits=out.tolist()))
        del s
    result=dict(weight_only=weight_rows,batch_isolation=batch_rows,weights_replaced=changed,input_sha256=prior['input_sha256'],files=prior['files'],script_sha256=t.sha(__file__),helper_sha256=t.sha(Path(t.__file__)),semantic_accuracy_measured=False)
    (ROOT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({'weight_only':[{'shape':r['shape'],'max_abs':r['weight_only_vs_fp32']['max_abs']} for r in weight_rows],'batch':[{'format':r['format'],'shape':r['shape'],'max_abs':r['max_abs']} for r in batch_rows]}),flush=True)
if __name__=='__main__':main()
