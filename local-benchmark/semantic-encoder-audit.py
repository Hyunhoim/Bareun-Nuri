"""Verify saved training/validation artifacts without new model inference."""
import importlib.util,json
from pathlib import Path
s=importlib.util.spec_from_file_location('e',Path(__file__).with_name('semantic-encoder.py'))
e=importlib.util.module_from_spec(s);s.loader.exec_module(e)

def main():
    assert e.read(e.R/'completed.json')['runs']==9;e.verify()
    extra=Path('.runtime/semantic-encoder-context-v1')
    assert e.read(extra/'completed.json')['runs']==3
    for file,h in e.read(extra/'manifest.json')['files'].items():assert e.p.digest(file)==h,file
    dev=e.v.readl(e.v.ROOT/'inputs.jsonl');keys=e.v.readl(e.v.ROOT/'labels.jsonl')
    use=e.read(e.v.ROOT/'usage.json');results=[];equivalence={}
    for name,folder in e.BASES.items():
        tok=e.p.AutoTokenizer.from_pretrained(folder,local_files_only=True);enc,_=e.encode(tok,dev,512)
        byid={r['id']:x['input_ids'] for r,x in zip(dev,enc,strict=True)}
        variants=[k for k in keys if k['parent_id']]
        equivalence[name]={'variants':len(variants),'same_tokens_as_parent':sum(byid[k['id']]==byid[k['parent_id']] for k in variants)}
    for root,freeze,limit,prefix in [(e.R,8,512,''),(e.R,8,256,''),(e.R,0,512,''),(extra,8,256,'context/')]:
        for name in e.BASES:
            out=root/f'{name}-f{freeze}-t{limit}';history=e.read(out/'history.json');selected=e.read(out/'selection.json');done=e.read(out/'completed.json');cpu=e.read(out/'cpu.json')
            assert e.p.digest(out/'model/model.safetensors')==done['model_sha256']
            assert selected==max(history,key=lambda r:tuple(r['rank']))
            expected=e.read(out/f"epoch-{selected['epoch']}-probabilities.json")
            actual=e.read(out/'selected-cpu-probabilities.json')
            assert all(a['id']==b['id'] and (a['p_ad']>=.5)==(b['p_ad']>=.5) for a,b in zip(expected,actual,strict=True))
            for epoch in range(1,4):
                path=out/f'epoch-{epoch}-predictions.jsonl';record=next(r for r in use['runs'] if r['name']==prefix+out.name+'/epoch-'+str(epoch))
                assert e.p.digest(path)==record['predictions_sha256']
                report=e.read(e.v.ROOT/record['report']);assert report['primary']==history[epoch-1]['primary']
                rows=e.v.readl(path);pred={r['id']:r['prediction'] for r in rows}
                assert len(rows)==90 and set(pred)=={r['id'] for r in dev}
                assert e.v.metrics([k for k in keys if k['stratum']=='primary'],pred)==history[epoch-1]['primary']
            results.append(dict(run=prefix+out.name,path=str(out),selected_epoch=selected['epoch'],development=selected['primary'],variant=selected['variant'],agreement=selected['agreement'],gate=selected['followup_gate'],
                train_seconds=done['train_seconds'],gpu_peak_bytes=done['gpu_peak_bytes'],cpu=cpu,
                regression_within_training=any(history[i]['loss']<history[i-1]['loss'] and history[i]['rank'][0]<history[i-1]['rank'][0] for i in range(1,3))))
    result=dict(passed=True,runs=results,normalization_equivalence=equivalence,
                validation_runs=sum(r['name'].startswith(tuple(x['run']+'/' for x in results)) for r in use['runs']),
                production_modified=False,api_calls=0,independent_holdout=False)
    e.save(e.R/'audit.json',result);e.log({k:val for k,val in result.items() if k!='runs'})

if __name__=='__main__':main()
