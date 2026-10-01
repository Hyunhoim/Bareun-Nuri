"""Trace frozen Kc ONNX graphs on the already fixed, label-free token arrays."""
import hashlib,json,sys
from pathlib import Path
sys.path.insert(0,str(Path('.runtime/semantic-onnx-deps').resolve()))
import numpy as np,onnx,onnxruntime as ort
from onnx import helper,numpy_helper

ROOT=Path('.runtime/semantic-int8-trace-v1')
BASE=Path('.runtime/semantic-encoder-onnx-v1/kc')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def stats(a,b):
    a=a.astype(np.float64);b=b.astype(np.float64);norm=float(np.linalg.norm(a))
    return dict(max_abs=float(np.max(np.abs(a-b))),relative_l2=float(np.linalg.norm(a-b)/norm) if norm>1e-12 else None,reference_l2=norm,reference_max=float(np.max(np.abs(a))))
def main():
    ROOT.mkdir(exist_ok=False)
    prior=json.loads(Path('.runtime/semantic-int8-numeric-v1/kc/result.json').read_text())
    manifest=json.loads((BASE/'export.json').read_text())
    config=json.loads((Path(manifest['model']['folder'])/'config.json').read_text())
    rng=np.random.default_rng(42);inputs=[]
    for batch,length in [(1,16),(8,16),(1,64),(8,64)]:
        ids=rng.integers(100,config['vocab_size'],(batch,length),dtype=np.int64);mask=np.ones_like(ids)
        if batch>1:mask[1:,length//2:]=0;ids[1:,length//2:]=config.get('pad_token_id',0)
        inputs.append(dict(input_ids=ids,attention_mask=mask))
    assert hashlib.sha256(b''.join(v.tobytes() for x in inputs for v in x.values())).hexdigest()==prior['input_sha256']
    graphs={kind:onnx.load(str(BASE/(kind+'.onnx'))) for kind in ['fp32','int8']}
    for kind in graphs:assert sha(BASE/(kind+'.onnx'))==prior['files'][kind]
    common={v for n in graphs['int8'].graph.node for v in n.output}
    names=[n.output[0] for n in graphs['fp32'].graph.node if n.op_type in ['MatMul','Gemm','LayerNormalization'] and n.output[0] in common]
    assert 'logits' in names and len(names)==len(set(names))
    weights=[]
    initial={k:{x.name:numpy_helper.to_array(x) for x in g.graph.initializer} for k,g in graphs.items()}
    for name,a in initial['fp32'].items():
        q=initial['int8'];quant=name+'_quantized';scale=name+'_scale';zero=name+'_zero_point'
        if quant not in q:continue
        b=(q[quant].astype(np.float32)-q[zero])*q[scale]
        # Gemm weights are transposed to MatMul layout during quantization.
        if name.startswith('model.classifier.'):b=b.T
        assert a.shape==b.shape,(name,a.shape,b.shape)
        weights.append(dict(name=name,shape=list(a.shape),**stats(a,b)))
    del initial
    arrays={};preservation=[]
    for kind,model in graphs.items():
        existing={x.name for x in model.graph.output}
        for name in names:
            if name not in existing:model.graph.output.append(helper.make_tensor_value_info(name,onnx.TensorProto.FLOAT,None))
        opts=ort.SessionOptions();opts.intra_op_num_threads=8;opts.inter_op_num_threads=1;opts.graph_optimization_level=ort.GraphOptimizationLevel.ORT_DISABLE_ALL
        runtime=ort.InferenceSession(model.SerializeToString(),opts,providers=['CPUExecutionProvider'])
        expected=next(x['outputs'] for x in prior['logits'] if x['format']==kind and not x['optimized'])
        arrays[kind]=[]
        for i,feed in enumerate(inputs):
            out=runtime.run(names,feed);assert all(np.isfinite(x).all() for x in out)
            delta=stats(np.array(expected[i]),out[names.index('logits')])['max_abs'];assert delta<1e-5
            preservation.append(dict(format=kind,input=i,logits_max_delta=delta))
            np.savez_compressed(ROOT/(kind+'-'+str(i)+'.npz'),**{'v'+str(j):a for j,a in enumerate(out)})
            arrays[kind].append(out)
        del runtime
    rows=[]
    for j,name in enumerate(names):
        rows.append(dict(name=name,inputs=[dict(shape=list(feed['input_ids'].shape),**stats(arrays['fp32'][i][j],arrays['int8'][i][j])) for i,feed in enumerate(inputs)]))
    result=dict(model='kc',nodes=rows,weights=weights,preservation=preservation,input_sha256=prior['input_sha256'],files=prior['files'],script_sha256=sha(__file__),semantic_accuracy_measured=False)
    (ROOT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({'nodes':len(rows),'weights':len(weights),'preservation_max':max(x['logits_max_delta'] for x in preservation),'top_relative_l2':sorted([{'name':x['name'],'max':max(v['relative_l2'] or 0 for v in x['inputs'])} for x in rows],key=lambda x:x['max'],reverse=True)[:12]}),flush=True)
if __name__=='__main__':main()
