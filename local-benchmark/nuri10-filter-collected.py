"""Frozen thresholds on saved real collections and controlled replica evidence."""
import importlib.util, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('filter_v1',Path(__file__).with_name('nuri10-filter.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
f.OUT=Path('.runtime/nuri10-filter-collected-v1')
assert not (f.OUT/'started.json').exists(), 'No silent repeat'
f.p.torch.set_num_threads(8)
rows=f.read(f.OUT/'inputs.json'); selections=f.read('.runtime/nuri10-filter-v1/frozen-selection.json')
files=[f.OUT/'inputs.json',Path('.runtime/nuri10-filter-v1/frozen-selection.json'),Path('docs/nuri10-filter-collected-plan.md'),Path(__file__)]
files += [Path(s['path']) for s in f.read(f.OUT/'sources.json')]
files += [p for m in f.MODELS.values() for p in Path(m).glob('*') if p.is_file()]
hashes={str(p):f.p.digest(p) for p in files}
f.save('started',{'hashes':hashes,'thresholds':{k:v['selection'] for k,v in selections.items()}})
byid={r['id']:r for r in rows}; output={}
for name,model in f.MODELS.items():
    scores,timing=f.infer(name,model,rows,'collected')
    t,q=selections[name]['selection']['t'],selections[name]['selection']['q']
    removed={s['id'] for s in scores if f.excluded(s,t,q)}
    scoremap={s['id']:s for s in scores}
    def summarize(rs):
        known=[r for r in rs if r['label'] is not None]
        return {'total':len(rs),'excluded':sum(r['id'] in removed for r in rs),'unknown_excluded':sum(r['label'] is None and r['id'] in removed for r in rs),
            'gold':f.counts([scoremap[r['id']] for r in known],{r['id']:r['label'] for r in known},t,q)}
    result={'timing':timing,'t':t,'q':q,'panels':{},'pages':{},'areas':{}}
    for panel in ['real','replica']:
        rs=[r for r in rows if r['panel']==panel];result['panels'][panel]=summarize(rs)
        unique={json.dumps(r['input'],sort_keys=True,ensure_ascii=False):r for r in rs}
        result['panels'][panel]['unique_inputs']=summarize(list(unique.values()))
        for area in sorted({r['area'] for r in rs}): result['areas'][panel+':'+area]=summarize([r for r in rs if r['area']==area])
    for url in sorted({r['url'] for r in rows}):result['pages'][url]=summarize([r for r in rows if r['url']==url])
    hcx=f.read('.runtime/scale-medium-envelope-v1/evaluation.json')['controlled64']['rows']
    gone={r['node_id'] for r in rows if r['panel']=='replica' and r['id'] in removed}
    result['saved_hcx_tp_lost']=[r for r in hcx if r['is_ad'] is True and r['predicted'] and r['node_id'] in gone]
    result['techniques']={tech:summarize([r for r in rows if tech in r['techniques'] and r['label']==0]) for tech in ['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN']}
    f.save(name+'-excluded-review',[dict(r,scores=scoremap[r['id']]['scores']) for r in rows if r['id'] in removed])
    output[name]=result;f.save('result',output)
    print(json.dumps({name:result['panels']},ensure_ascii=False),flush=True)
assert all(f.p.digest(Path(path))==h for path,h in hashes.items())
f.save('completed',{'rows':len(rows),'source_hashes_unchanged':True,'api_calls':0})
