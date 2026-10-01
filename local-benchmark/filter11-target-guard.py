"""Target-only secondary view can veto exclusion; no evidence is discarded."""
import importlib.util,json
from pathlib import Path
sp=importlib.util.spec_from_file_location('r',Path(__file__).with_name('filter11-run.py'));r=importlib.util.module_from_spec(sp);sp.loader.exec_module(r)
def main():
    root=r.ROOT;assert not (root/'target-guard-started.json').exists();r.torch.set_num_threads(8);sel=r.read(root/'selection.json');t=sel['calibration']['t']
    r.save('target-guard-started',{'model_hash':sel['model_hash'],'threshold':t,'target_threshold':t,'consumed_final_is_regression':True})
    tok=r.p.AutoTokenizer.from_pretrained(sel['checkpoint'],local_files_only=True);model=r.p.AutoModelForSequenceClassification.from_pretrained(sel['checkpoint'],local_files_only=True).to('cpu')
    rows=r.read(root/'excluded-review.json');views=[{**x,'input':{'target':x['input']['target'],'context':''}} for x in rows]
    ss,secs=r.infer(model,tok,views,'cpu');r.save('target-guard-collected-scores',ss)
    # Full-evidence first stage already passed input validation; missing context here is intentional.
    def auxiliary_ok(x,s):
        proxy={**x,'input':{'target':x['input']['target'],'context':'auxiliary view'}}
        return r.safe_exclude(proxy,s['scores'],s['length'],t)
    removed={x['id'] for x,s in zip(rows,ss) if auxiliary_ok(x,s)};allrows=r.read('.runtime/nuri10-filter-collected-v1/inputs.json');result={'extra_cpu_seconds':secs,'extra_rows':len(rows),'panels':{}}
    for panel in ['real','replica']:
        rs=[x for x in allrows if x['panel']==panel];known=[{**x,'label':0 if x['label'] in [1,2] else 1,'semantic_intent':'ad' if x['label']==0 else 'uncertain' if x['label']==3 else 'benign'} for x in rs if x['label'] is not None]
        result['panels'][panel]={'total':len(rs),'excluded':sum(x['id'] in removed for x in rs),'unknown_excluded':sum(x['id'] in removed and x['label'] is None for x in rs),'known':r.b.stats(known,[[1,0] if x['id'] in removed else [0,1] for x in known],.5)}
    r.save('target-guard-excluded-review',[x for x in rows if x['id'] in removed])
    for panel in ['calibration','confirmation','final']:
        if panel=='calibration':rs=r.read(root/'calibration-inputs.json');full=r.read(root/'C-calibration-scores.json')
        elif panel=='confirmation':rs=r.read('.runtime/filter-mixed-v1/confirm.json');full=r.read(root/'confirmation-scores.json')
        else:
            folder=Path('local-benchmark/filter-data-v1/sealed-final');a=[json.loads(l) for l in (folder/'final-inputs.jsonl').read_text(encoding='utf8').splitlines()];b=[json.loads(l) for l in (folder/'final-labels.jsonl').read_text(encoding='utf8').splitlines()];assert [x['id'] for x in a]==[x['id'] for x in b];rs=[{**x,**g} for x,g in zip(a,b)];full=r.read(root/'final-scores.json')
        selected=[x for x,s in zip(rs,full) if r.safe_exclude(x,s['scores'],s['length'],t)]
        views=[{**x,'input':{'target':x['input']['target'],'context':''}} for x in selected];ss,_=r.infer(model,tok,views,'cpu')
        kept={x['id'] for x,s in zip(selected,ss) if auxiliary_ok(x,s)}
        result[panel+'_regression']=r.b.stats(rs,[[1,0] if x['id'] in kept else [0,1] for x in rs],.5);r.save('target-guard-'+panel+'-scores',ss)
    result['production_adoption']=False;r.save('target-guard-result',result);print(json.dumps(result,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
