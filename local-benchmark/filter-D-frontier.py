"""Frozen D score-boundary diagnostic; all panels are observed regression."""
import json, math, hashlib
from pathlib import Path

ROOT=Path('.runtime/filter-D-frontier-v1')
def read(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def save(name,obj):(ROOT/(name+'.json')).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8')
def eligible(row,s):
    return (all(isinstance(row.get('input',{}).get(k),str) and row['input'][k].strip() for k in ['target','context'])
        and row.get('collection_truncated') is False and 0<s['length']<=512
        and len(s['scores'])==4 and all(math.isfinite(v) and 0<=v<=1 for v in s['scores'])
        and abs(sum(s['scores'])-1)<1e-5 and max(range(4),key=s['scores'].__getitem__)==2)
def removed(row,s,gate):
    if not eligible(row,s):return False
    if gate['mode']=='ad':return s['scores'][0]<gate['threshold'] and s['scores'][2]>=.9
    return sum(s['scores'][k] for k in [0,1,3])<gate['threshold']
def stats(rows,scores,gate):
    out={'total':len(rows),'excluded':0,'normal':0,'normal_excluded':0,'ads':0,'ads_lost':0,'uncertain':0,'uncertain_lost':0,'unknown_excluded':0}
    for row,s in zip(rows,scores):
        assert row['id']==s['id'];ex=removed(row,s,gate);out['excluded']+=ex;y=row.get('label')
        if y is None:out['unknown_excluded']+=ex;continue
        name='ads' if y==0 else 'uncertain' if y==3 else 'normal';out[name]+=1
        out[name+('_excluded' if name=='normal' else '_lost')]+=ex
    return out
def main():
    ROOT.mkdir(exist_ok=False)
    gold={r['id']:0 if r['is_violation'] else 2 for r in read('test-set-contest-v1/data/private/gold.json')}
    rows=[dict(r,label=gold[r['id']],collection_truncated=False) for r in read('.runtime/klue-input-audit-v2/corrected-inputs.json')]
    rows += [dict(r,collection_truncated=False) for r in read('.runtime/slm-three/inputs.json')]
    scores=read('.runtime/nuri10-filter-v1/D-development-scores.json')+read('.runtime/nuri10-filter-v1/D-confirmation-scores.json')
    gates={'fixed':{'mode':'ad','threshold':.0001}};boundaries={}
    for mode in ['ad','non_normal']:
        values=[(s['scores'][0] if mode=='ad' else sum(s['scores'][k] for k in [0,1,3])) for row,s in zip(rows,scores)
            if row['label'] in [0,3] and eligible(row,s) and (mode!='ad' or s['scores'][2]>=.9)]
        assert values,'Cannot calibrate without qualifying must-pass examples'
        bound=min(values);gates[mode]={'mode':mode,'threshold':.8*bound}
        boundaries[mode]={'boundary':bound,'empirical_ceiling':stats(rows,scores,{'mode':mode,'threshold':bound})}
    save('frozen',{'gates':gates,'boundaries':boundaries,'calibration':{k:stats(rows,scores,g) for k,g in gates.items()},'model_sha256':hashlib.sha256(Path('.runtime/klue-audit-learning-v1/run-cpu/model/model.safetensors').read_bytes()).hexdigest(),'holdout':False})
    # Only after freezing thresholds, read collected regression scores.
    collected=read('.runtime/nuri10-filter-collected-v1/inputs.json');cs=read('.runtime/nuri10-filter-collected-v1/D-collected-scores.json');flags={}
    for source in read('.runtime/nuri10-filter-collected-v1/sources.json'):
        for c in read(source['path'])['candidates']:flags[(c['url'],c['selector'])]=bool(c.get('context_evidence',{}).get('truncated',False))
    for row in collected:row['collection_truncated']=flags[(row['url'],row['selector'])]
    result={}
    for name,g in gates.items():
        result[name]={}
        for panel in ['real','replica']:
            ix=[i for i,r in enumerate(collected) if r['panel']==panel]
            result[name][panel]=stats([collected[i] for i in ix],[cs[i] for i in ix],g)
        save(name+'-excluded',[dict(r,scores=s['scores']) for r,s in zip(collected,cs) if removed(r,s,g)])
    save('result',result);print(json.dumps({'frozen':read(ROOT/'frozen.json'),'result':result},ensure_ascii=False))
if __name__=='__main__':main()
