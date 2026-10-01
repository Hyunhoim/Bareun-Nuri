"""Label-free integer-kernel and frozen-graph diagnostics."""
import argparse,hashlib,json,sys,time
from pathlib import Path
sys.path.insert(0,str(Path('.runtime/semantic-onnx-deps').resolve()))
import numpy as np,onnx,onnxruntime as ort
from onnx import helper as h,numpy_helper as nh,TensorProto as T
R=Path('.runtime/semantic-int8-numeric-v1');MODELS=Path('.runtime/semantic-encoder-onnx-v1')
def save(p,x):p.write_text(json.dumps(x,indent=2),encoding='utf8')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def session(model,opt):
    options=ort.SessionOptions();options.intra_op_num_threads=8;options.inter_op_num_threads=1;options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL if opt else ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    return ort.InferenceSession(model,options,providers=['CPUExecutionProvider'])
def kernels():
    R.mkdir(exist_ok=True);assert not (R/'kernels-corrected.json').exists();results=[];rng=np.random.default_rng(42)
    for m,k,n in [(1,2,1),(8,768,64)]:
        for pattern in ['positive','negative','random']:
            a=np.full((m,k),255,dtype=np.uint8);a[0,0]=0
            b=np.full((k,n),127 if pattern=='positive' else -128,dtype=np.int8)
            if pattern=='random':a=rng.integers(0,256,(m,k),dtype=np.uint8);a[0,0]=0;a[-1,-1]=255;b=rng.integers(-128,128,(k,n),dtype=np.int8)
            ref=a.astype(np.int64)@b.astype(np.int64)
            for dynamic in [False,True]:
                nodes=[];init=[nh.from_array(b,'B')]
                if dynamic:
                    init.append(nh.from_array(np.int8(0),'bz'))
                    nodes=[h.make_node('DynamicQuantizeLinear',['A'],['aq','scale','az']),h.make_node('MatMulInteger',['aq','B','az','bz'],['Yint']),h.make_node('Cast',['Yint'],['Yfloat'],to=T.FLOAT),h.make_node('Mul',['Yfloat','scale'],['Y'])]
                else:nodes=[h.make_node('MatMulInteger',['A','B'],['Y'])]
                g=h.make_graph(nodes,'integer-reference',[h.make_tensor_value_info('A',T.FLOAT if dynamic else T.UINT8,[m,k])],[h.make_tensor_value_info('Y',T.FLOAT if dynamic else T.INT32,[m,n])],init)
                model=h.make_model(g,opset_imports=[h.make_opsetid('',17)]);model.ir_version=10;onnx.checker.check_model(model)
                for opt in [False,True]:
                    runtime=session(model.SerializeToString(),opt);actual=runtime.run(None,{'A':a.astype(np.float32) if dynamic else a})[0]
                    expected=ref.astype(np.float32) if dynamic else ref
                    delta=float(np.max(np.abs(actual.astype(np.float64)-expected)));results.append(dict(shape=[m,k,n],pattern=pattern,dynamic=dynamic,optimized=opt,max_output_error=delta,reference_rounding=float(np.max(np.abs(expected.astype(np.float64)-ref))),passed=delta==0))
    save(R/'kernels-corrected.json',dict(versions=dict(onnx=onnx.__version__,ort=ort.__version__),seed=42,tests=results,passed=all(x['passed'] for x in results),script_sha256=sha(__file__),correction='Dynamic graph includes Cast to float32; compare against float32-rounded integer reference. Original kernels.json preserved.'))
    print(json.dumps({'kernel_tests':len(results),'failed':sum(not x['passed'] for x in results)}),flush=True)
def graph(name):
    assert (R/'kernels.json').exists();out=R/name;out.mkdir(exist_ok=False)
    manifest=json.loads((MODELS/name/'export.json').read_text());config=json.loads((Path(manifest['model']['folder'])/'config.json').read_text())
    pad=config.get('pad_token_id',0);rng=np.random.default_rng(42);inputs=[]
    for batch,length in [(1,16),(8,16),(1,64),(8,64)]:
        ids=rng.integers(100,config['vocab_size'],size=(batch,length),dtype=np.int64);mask=np.ones_like(ids)
        if batch>1:mask[1:,length//2:]=0;ids[1:,length//2:]=pad
        inputs.append({'input_ids':ids,'attention_mask':mask})
    evidence=[];times={}
    for kind in ['fp32','int8']:
        file=MODELS/name/(kind+'.onnx');assert sha(file)==manifest['files'][file.name]['sha256']
        for opt in [False,True]:
            runtime=session(str(file),opt);start=time.perf_counter();outputs=[runtime.run(None,x)[0] for x in inputs];times[kind+str(opt)]=time.perf_counter()-start
            assert all(np.isfinite(x).all() for x in outputs)
            evidence.append(dict(format=kind,optimized=opt,outputs=[x.tolist() for x in outputs]));del runtime
    output={(x['format'],x['optimized']):[np.array(a) for a in x['outputs']] for x in evidence}
    compare=lambda a,b:max(float(np.max(np.abs(x-y))) for x,y in zip(output[a],output[b],strict=True))
    result=dict(model=name,shapes=[list(x['input_ids'].shape) for x in inputs],seed=42,logits=evidence,seconds=times,
        input_sha256=hashlib.sha256(b''.join(v.tobytes() for x in inputs for v in x.values())).hexdigest(),
        fp32_optimization_delta=compare(('fp32',False),('fp32',True)),int8_optimization_delta=compare(('int8',False),('int8',True)),
        quantization_unoptimized_delta=compare(('fp32',False),('int8',False)),quantization_optimized_delta=compare(('fp32',True),('int8',True)),
        files={kind:manifest['files'][kind+'.onnx']['sha256'] for kind in ['fp32','int8']},script_sha256=sha(__file__),semantic_accuracy_measured=False)
    save(out/'result.json',result);print(json.dumps({k:v for k,v in result.items() if k not in ['logits','files','seconds']}),flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['kernels','klue','kc','ko']);a=p.parse_args();kernels() if a.action=='kernels' else graph(a.action)
