"""Post-selection observed regression against previously saved HCX responses."""
import importlib.util,json,time,gc
from pathlib import Path
spec=importlib.util.spec_from_file_location('exp',Path(__file__).with_name('semantic-encoder.py'))
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
R=e.R/'regression';H=Path('.runtime/exaone-hcx-v1');I=Path('.runtime/slm-three/inputs.json')

def main():
    assert (e.R/'completed.json').exists(),'All predefined candidates must be finished'
    extra=Path('.runtime/semantic-encoder-context-v1')
    assert (extra/'completed.json').exists(),'Context-preserving follow-up must be frozen before HCX comparison'
    R.mkdir(exist_ok=False);e.verify();torch=e.torch;torch.set_num_threads(8)
    manifest=e.read(H/'manifest.json');assert e.p.digest(I)==manifest['input_hash']
    allrows=e.read(I);training=e.v.readl(e.TRAIN);trainkeys={e.v.canonical(r['input']) for r in training}
    excluded=[r for r in allrows if r['panel']=='human17' or e.v.canonical(r['input']) in trainkeys]
    rows=[r for r in allrows if r not in excluded]
    key=lambda r:r['panel']+'/'+r['id']
    assert len({key(r) for r in rows})==len(rows)
    dev=[dict(id=key(r),input=r['input']) for r in rows]
    keys=[dict(id=key(r),label=None if r['label']==3 else int(r['label']==0)) for r in rows]
    gold={k['id']:k['label'] for k in keys}
    stored=e.read(H/'rows.json');baselines={}
    for phase in ['single','batch12']:
        pred={}
        for run in [r for r in stored if r['phase']==phase]:
            raw=e.read(H/f"{run['index']}-response.json");request=e.read(H/f"{run['index']}-request.json")
            plan=manifest['plans'][run['index']]
            assert raw['status']==200 and request['body']==plan['body']
            response=json.loads(raw['text'])['result'];parsed=json.loads(response['message']['content'])
            assert set(parsed)==set(plan['ids']) and all(type(y) is int and y in range(4) for y in parsed.values())
            assert response['finishReason']=='stop' and [parsed[i] for i in plan['ids']]==[r['prediction'] for r in run['rows']]
            payload=json.loads(request['body']['messages'][1]['content'])
            if phase=='single':assert payload==plan['rows'][0]['input']
            else:
                assert len(payload)==len(plan['rows'])
                for item,original in zip(payload,plan['rows'],strict=True):assert {k:item[k] for k in ['target','context']}==original['input']
            for actual,original in zip(run['rows'],plan['rows'],strict=True):
                assert key(actual)==key(original)
                source=next(r for r in allrows if key(r)==key(original));assert original['input']==source['input']
                y=actual['prediction'];pred[key(actual)]=None if y==3 else int(y==0)
        assert all(k['id'] in pred for k in keys)
        baselines[phase]=pred
    e.save(R/'manifest.json',dict(inputs_sha256=e.p.digest(I),hcx_rows_sha256=e.p.digest(H/'rows.json'),
        script_sha256=e.p.digest(__file__),plan_sha256=e.p.digest('docs/semantic-encoder-regression-plan.md'),
        rows=len(rows),excluded=[key(r) for r in excluded],reason='human17 was in training; normalized train overlaps also excluded',new_api_calls=0,
        hcx_system=manifest['plans'][0]['body']['messages'][0]['content']))
    output={'hcx':{name:e.v.metrics(keys,pred) for name,pred in baselines.items()},'models':{}}
    chosen={}
    for name in e.BASES:
        # Amended before any regression predictions: exclude known conflicting inputs.
        folders=[e.R/f'{name}-f8-t512',e.R/f'{name}-f0-t512',extra/f'{name}-f8-t256']
        chosen[name]=max(folders,key=lambda folder:tuple(e.read(folder/'selection.json')['rank']))
    e.save(R/'selected-before-regression.json',{name:str(folder) for name,folder in chosen.items()})
    for name,folder in {**chosen,'Nuri1.0':Path('.runtime/klue-cycle3-v1/frozen8')}.items():
        start=time.perf_counter();tok=e.p.AutoTokenizer.from_pretrained(folder/'model',local_files_only=True)
        model=e.p.AutoModelForSequenceClassification.from_pretrained(folder/'model',local_files_only=True).to('cpu');load=time.perf_counter()-start
        limit=512 if name=='Nuri1.0' else e.read(folder/'contract.json')['max_tokens']
        if folder.parent==extra:
            ctx=e.module('context','semantic-encoder-context.py');enc,lengths=ctx.encode(tok,dev,limit)
        else:enc,lengths=e.encode(tok,dev,limit)
        if name=='Nuri1.0':
            ys,sec=e.p.predict(model,tok,enc,8,'cpu');pred={r['id']:None if y==3 else int(y==0) for r,y in zip(dev,ys,strict=True)};probs=None
        else:
            probs,sec=e.probabilities(model,tok,enc,'cpu');pred={r['id']:int(pr>=.5) for r,pr in zip(dev,probs,strict=True)}
        changes={}
        for phase,base in baselines.items():
            changes[phase]=dict(lost_hcx_tp=sum(y==1 and base[k]==1 and pred[k]!=1 for k,y in gold.items()),
                recovered_hcx_fn=sum(y==1 and base[k]!=1 and pred[k]==1 for k,y in gold.items()),
                resolved_hcx_fp=sum(y==0 and base[k]==1 and pred[k]!=1 for k,y in gold.items()),
                new_fp=sum(y==0 and base[k]!=1 and pred[k]==1 for k,y in gold.items()))
        met=dict(folder=str(folder),metrics=e.v.metrics(keys,pred),panels={panel:e.v.metrics([k for k in keys if k['id'].startswith(panel+'/')],pred) for panel in sorted({r['panel'] for r in rows})},
            comparison=changes,cpu_seconds=sec,load_seconds=load,lengths=lengths)
        if probs is not None:
            abst={r['id']:None if .2<pr<.8 else int(pr>=.5) for r,pr in zip(dev,probs,strict=True)}
            met['uncalibrated_abstention_diagnostic']=e.v.metrics(keys,abst)
        e.save(R/(name+'-predictions.json'),[dict(id=r['id'],prediction=pred[r['id']],p_ad=None if probs is None else probs[i]) for i,r in enumerate(dev)])
        output['models'][name]=met;e.save(R/'report.json',output);e.log({'regression':name,**met['metrics'],'lost_hcx':changes})
        del model;gc.collect()
    e.save(R/'completed.json',{'api_calls':0,'new_holdout':False,'models':4})

if __name__=='__main__':main()
