"""One fixed observed evaluation after all six selections; no tuning from results."""
import argparse, importlib.util, json, time
from pathlib import Path

s=importlib.util.spec_from_file_location('addition',Path(__file__).with_name('semantic-real-addition.py'))
a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
e=a.e;R=a.R
SOURCE=Path('.runtime/slm-three/inputs.json')
CONTEST=Path('.runtime/klue-contest-v1/inputs.json')
GOLD=Path('test-set-contest-v1/data/private/gold.json')

def panels():
    old=e.read('.runtime/semantic-encoder-v1/regression/manifest.json')
    assert e.p.digest(SOURCE)==old['inputs_sha256']
    excluded=set(old['excluded'])
    rows=[r for r in e.read(SOURCE) if r['panel']+'/'+r['id'] not in excluded]
    semantic=[dict(id=r['panel']+'/'+r['id'],input=r['input']) for r in rows]
    sk=[dict(id=r['panel']+'/'+r['id'],label=None if r['label']==3 else int(r['label']==0)) for r in rows]
    hist=e.read('.runtime/semantic-encoder-v1/retention/manifest.json')
    for f in [CONTEST,GOLD]:assert e.p.digest(f)==hist['files'][str(f)]
    retained=e.read(CONTEST);gold={r['id']:r for r in e.read(GOLD)}
    rk=[dict(id=r['id'],label=int(gold[r['id']]['is_violation'])) for r in retained]
    training={e.v.canonical(r['input']) for r in e.v.readl(R/'train.jsonl')}
    assert len(semantic)==204 and len(retained)==2000
    assert not training&{e.v.canonical(r['input']) for r in semantic+retained}
    return {'semantic204':(semantic,sk),'retention2000':(retained,rk)}

def selections():
    a.verify();models={}
    for arm in ['control','addition']:
        for name in e.BASES:
            folder=R/arm/f'{name}-f8-t512'
            done=e.read(folder/'completed.json');assert e.p.digest(folder/'model/model.safetensors')==done['model_sha256']
            history=e.read(folder/'history.json');selected=e.read(folder/'selection.json')
            assert len(history)==3 and selected==max(history,key=lambda r:tuple(r['rank']))
            assert e.read(folder/'cpu.json')['hard']['rank']==selected['rank']
            assert e.p.digest(R/arm/'manifest.json')==e.read(folder/'contract.json')['manifest_sha256']
            models[arm+'/'+name]=dict(folder=str(folder),sha256=done['model_sha256'],selected_epoch=selected['epoch'],rank=selected['rank'])
    return models

def infer(name,arm):
    import psutil
    frozen=selections();data=panels();folder=Path(frozen[arm+'/'+name]['folder'])/'model'
    out=R/arm/name/'regression';out.mkdir(parents=True,exist_ok=False)
    e.torch.set_num_threads(8)
    start=time.perf_counter();tok=e.p.AutoTokenizer.from_pretrained(folder,local_files_only=True)
    model=e.p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cpu');load=time.perf_counter()-start
    results={}
    for panel,(rows,keys) in data.items():
        start=time.perf_counter();enc,stats=e.encode(tok,rows,512);encoding=time.perf_counter()-start
        assert stats['truncated']==0,'Keep full-input panel comparable'
        e.probabilities(model,tok,enc[:8],'cpu');probs,seconds=e.probabilities(model,tok,enc,'cpu')
        pred={r['id']:int(p>=.5) for r,p in zip(rows,probs,strict=True)}
        e.save(out/(panel+'-predictions.json'),[dict(id=r['id'],p_ad=p,prediction=pred[r['id']]) for r,p in zip(rows,probs,strict=True)])
        results[panel]=dict(metrics=e.v.metrics(keys,pred),seconds=seconds,encoding_seconds=encoding,lengths=stats,
            memory=psutil.Process().memory_info()._asdict())
        e.log({'arm':arm,'model':name,'panel':panel,**results[panel]['metrics'],'seconds':seconds})
    e.save(out/'completed.json',dict(results=results,load_seconds=load,model=frozen[arm+'/'+name],
        files={str(f):e.p.digest(f) for f in [SOURCE,CONTEST,GOLD,Path(__file__)]},new_api_calls=0))

def delta(keys,base,new):
    return dict(lost_tp=[k['id'] for k in keys if k['label']==1 and base[k['id']]==1 and new[k['id']]!=1],
        recovered_fn=[k['id'] for k in keys if k['label']==1 and base[k['id']]!=1 and new[k['id']]==1],
        new_fp=[k['id'] for k in keys if k['label']==0 and base[k['id']]!=1 and new[k['id']]==1],
        resolved_fp=[k['id'] for k in keys if k['label']==0 and base[k['id']]==1 and new[k['id']]!=1])

def audit():
    frozen=selections();data=panels();result={'models':{},'frozen':frozen,'api_calls':0,'independent_human_gold':False,'operating_changed':False};hashes={}
    scores={arm:e.read(R/arm/'observed-scores/scores.json') for arm in ['control','addition']}
    for name in e.BASES:
        info={'panels':{}};passes=[]
        for panel,(rows,keys) in data.items():
            preds={};stats={}
            for arm in ['control','addition']:
                out=R/arm/name/'regression';f=out/(panel+'-predictions.json');raw=e.read(f)
                hashes[str(f)]=e.p.digest(f)
                assert len(raw)==len(rows) and {r['id'] for r in raw}=={r['id'] for r in rows}
                assert all(r['prediction']==int(r['p_ad']>=.5) for r in raw)
                preds[arm]={r['id']:r['prediction'] for r in raw};stats[arm]=e.v.metrics(keys,preds[arm])
                done=e.read(out/'completed.json');assert stats[arm]==done['results'][panel]['metrics']
                assert done['model']==frozen[arm+'/'+name]
            changes=delta(keys,preds['control'],preds['addition'])
            ok=stats['addition']['f1']>=stats['control']['f1'] and not changes['lost_tp']
            info['panels'][panel]=dict(metrics=stats,changes=changes,gate=ok);passes.append(ok)
        old=scores['control']['models'][name]['common'];new=scores['addition']['models'][name]['common']
        actual=new['tp']>old['tp'] and new['fp']<=old['fp']
        info['observed_common']={'control':old,'addition':new,'gate':actual};passes.append(actual)
        development=e.read(R/'addition'/f'{name}-f8-t512'/'selection.json')['followup_gate']
        info['development_gate']=development;passes.append(development)
        info['all_predeclared_gates_passed']=all(passes)
        previous=e.read(e.R/f'{name}-f8-t512'/'completed.json')['model_sha256']
        info['control_weight_matches_prior_run']=previous==frozen['control/'+name]['sha256']
        result['models'][name]=info
    result['prediction_hashes']=hashes
    e.save(R/'comparison.json',result)
    e.log({n:dict(gates=x['all_predeclared_gates_passed'],reproduced=x['control_weight_matches_prior_run'],
        actual_tp=[x['observed_common'][arm]['tp'] for arm in ['control','addition']],
        regressions={k:dict(f1={arm:v['metrics'][arm]['f1'] for arm in ['control','addition']},lost_tp=len(v['changes']['lost_tp'])) for k,v in x['panels'].items()}) for n,x in result['models'].items()})

def check():
    keys=[dict(id='a',label=1),dict(id='b',label=0),dict(id='c',label=None)]
    d=delta(keys,{'a':1,'b':0,'c':0},{'a':0,'b':1,'c':1})
    assert d==dict(lost_tp=['a'],recovered_fn=[],new_fp=['b'],resolved_fp=[])

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['infer','audit']);p.add_argument('--model',choices=list(e.BASES));p.add_argument('--arm',choices=['control','addition']);args=p.parse_args();check()
    if args.action=='audit':audit()
    else:
        assert args.model and args.arm
        infer(args.model,args.arm)
