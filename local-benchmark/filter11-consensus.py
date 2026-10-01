"""Single agreement diagnostic; consumed final is regression only."""
import importlib.util,json,time
from pathlib import Path
sp=importlib.util.spec_from_file_location('r',Path(__file__).with_name('filter11-run.py'));r=importlib.util.module_from_spec(sp);sp.loader.exec_module(r)
def main():
    root=r.ROOT;assert not (root/'consensus-started.json').exists();r.torch.set_num_threads(8)
    sel=r.read(root/'selection.json');f=sel['all_candidates']['F'];t=f['calibration']['t'];r.save('consensus-started',{'C_threshold':.005,'F_threshold':t,'hypothesis':'both fixed candidates agree; no tuning','consumed_final_is_regression':True})
    mark=time.perf_counter();tok=r.p.AutoTokenizer.from_pretrained(f['checkpoint'],local_files_only=True);model=r.p.AutoModelForSequenceClassification.from_pretrained(f['checkpoint'],local_files_only=True).to('cpu');load=time.perf_counter()-mark
    rows=r.read(root/'excluded-review.json');ss,secs=r.infer(model,tok,rows,'cpu');r.save('consensus-second-stage-scores',ss)
    removed={row['id'] for row,s in zip(rows,ss) if r.safe_exclude(row,s['scores'],s['length'],t)};allrows=r.read('.runtime/nuri10-filter-collected-v1/inputs.json');result={'second_stage_rows':len(rows),'second_stage_cpu_seconds':secs,'second_stage_load_seconds':load,'panels':{}}
    for panel in ['real','replica']:
        rs=[x for x in allrows if x['panel']==panel];known=[{**x,'label':0 if x['label'] in [1,2] else 1,'semantic_intent':'ad' if x['label']==0 else 'uncertain' if x['label']==3 else 'benign'} for x in rs if x['label'] is not None]
        result['panels'][panel]={'total':len(rs),'excluded':sum(x['id'] in removed for x in rs),'unknown_excluded':sum(x['id'] in removed and x['label'] is None for x in rs),'known':r.b.stats(known,[[1,0] if x['id'] in removed else [0,1] for x in known],.5)}
    r.save('consensus-excluded-review',[x for x in rows if x['id'] in removed])
    for panel in ['confirmation','final']:
        if panel=='confirmation':rs=r.read('.runtime/filter-mixed-v1/confirm.json')
        else:
            folder=Path('local-benchmark/filter-data-v1/sealed-final');a=[json.loads(l) for l in (folder/'final-inputs.jsonl').read_text(encoding='utf8').splitlines()];b=[json.loads(l) for l in (folder/'final-labels.jsonl').read_text(encoding='utf8').splitlines()];assert [x['id'] for x in a]==[x['id'] for x in b];rs=[{**x,**y} for x,y in zip(a,b)]
        c={x['id']:x for x in r.read(root/(panel+'-scores.json'))};ss,_=r.infer(model,tok,rs,'cpu');r.save('consensus-'+panel+'-scores',ss)
        decisions=[[1,0] if r.safe_exclude(x,c[x['id']]['scores'],c[x['id']]['length'],.005) and r.safe_exclude(x,y['scores'],y['length'],t) else [0,1] for x,y in zip(rs,ss)]
        result[panel+'_regression']=r.b.stats(rs,decisions,.5)
    # Saved checkpoint scores: same calibration rows, intersection fixed before verification.
    cal=r.read(root/'calibration-inputs.json');c=r.read(root/'C-calibration-scores.json');fss=r.read(root/'F-calibration-scores.json')
    result['calibration']=r.b.stats(cal,[[1,0] if r.safe_exclude(x,y['scores'],y['length'],.005) and r.safe_exclude(x,z['scores'],z['length'],t) else [0,1] for x,y,z in zip(cal,c,fss)],.5)
    result['production_adoption']=False;r.save('consensus-result',result);print(json.dumps(result,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
