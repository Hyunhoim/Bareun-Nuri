"""Export deduplicated learning inputs and seal synthetic final; no model calls."""
import collections, csv, hashlib, json, re
from pathlib import Path
root=Path('.runtime/filter-data-v1');dest=Path('local-benchmark/filter-data-v1')
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8'))
norm=lambda s:re.sub(r'\s+',' ',s).strip()
key=lambda r:(norm(r['input']['target']),norm(r['input']['context']))
rows={s:read(root/(s+'-records.json')) for s in ['train','validation','final']}
assert not (dest/'manifest.json').exists(), 'Preserve version; do not regenerate after evaluation'
from transformers import AutoTokenizer
tok=AutoTokenizer.from_pretrained('.runtime/klue-cycle3-v1/frozen8/model',local_files_only=True)
oldpaths=['.runtime/klue-cycle3-v1/train.json','.runtime/klue-audit-learning-v1/train.json','local-benchmark/nuri-1.2/train.json','local-benchmark/exaone-ft-data-v3/dataset.json','.runtime/klue-input-audit-v2/corrected-inputs.json','.runtime/slm-three/inputs.json','.runtime/nuri10-filter-collected-v1/inputs.json']
def inputs(x):
    if isinstance(x,dict):
        if isinstance(x.get('input'),dict) and all(isinstance(x['input'].get(k),str) for k in ['target','context']):yield x
        else:
            for v in x.values():yield from inputs(v)
    elif isinstance(x,list):
        for v in x:yield from inputs(v)
prior={key(r) for p in oldpaths for r in inputs(read(p))}
index=collections.defaultdict(set)
def grams(text):return {text[i:i+4] for i in range(len(text)-3)}
oldgrams=[]
for j,k in enumerate(prior):
    gs=grams(' '.join(k));oldgrams.append(gs)
    for g in gs:index[g].add(j)
audit={'prior_unique_inputs':len(prior),'prior_sources':oldpaths,'splits':{},'near_duplicates':[]}
groups={};keys={};allfiles=[]
for split,rs in rows.items():
    groups[split]={r['group_id'] for r in rs};keys[split]={key(r) for r in rs};unique={}
    for r in rs:
        k=key(r);assert k not in prior,'Existing experiment input reused'
        assert '[object Object]' not in '\n'.join(k)
        if k in unique:assert unique[k]['label']==r['label'],'Conflicting exact labels'
        else:unique[k]=r
    lengths=[]
    for r in unique.values():
        text='판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context']
        lengths.append(len(tok(text,truncation=False)['input_ids']))
        assert lengths[-1]<=512,'Do not train EXCLUDE from a truncated input'
        gs=grams(' '.join(key(r)));counts=collections.Counter(j for g in gs for j in index.get(g,()))
        best=max((count/len(gs|oldgrams[j]) for j,count in counts.items()),default=0)
        if best>=.75:audit['near_duplicates'].append({'split':split,'id':r['id'],'jaccard4':best})
    targetdir=dest/'sealed-final' if split=='final' else dest
    targetdir.mkdir(exist_ok=True)
    inp=targetdir/(split+'-inputs.jsonl');gold=targetdir/(split+'-labels.jsonl')
    exported=list(unique.values())
    inp.write_text(''.join(json.dumps({'id':r['id'],'input':r['input']},ensure_ascii=False)+'\n' for r in exported),encoding='utf8')
    gold.write_text(''.join(json.dumps({'id':r['id'],'label':r['label'],'group_id':r['group_id'],'semantic_intent':r['semantic_intent'],'review_status':'author_proposed'},ensure_ascii=False)+'\n' for r in exported),encoding='utf8')
    allfiles += [inp,gold]
    audit['splits'][split]={'groups':len(groups[split]),'rendered_views':len(rs),'unique_model_inputs':len(exported),'labels':dict(collections.Counter(r['label'] for r in exported)),'intent':dict(collections.Counter(r['semantic_intent'] for r in exported)),'modes':dict(collections.Counter(r['mode'] for r in rs)),'max_tokens':max(lengths)}
    if split!='final':
        with (dest/(split+'-review.csv')).open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.writer(f);w.writerow(['id','group_id','target','context','proposed_route','reason','human_decision','review_note'])
            for r in exported:w.writerow([r['id'],r['group_id'],r['input']['target'],r['input']['context'],r['route'],r['rationale'],'',''])
for a,b in [('train','validation'),('train','final'),('validation','final')]:
    assert not groups[a]&groups[b] and not keys[a]&keys[b]
assert not audit['near_duplicates'],'Review near duplicates before release'
audit.update({'exact_input_leakage':0,'group_overlap':0,'collection':read(root/'collection-audit.json'),'final_evaluated':False,'human_reviewed':False,'training_ready':False})
(dest/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
hashes={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in allfiles+[dest/'seeds.tsv',dest/'audit.json']}
(dest/'manifest.json').write_text(json.dumps({'name':'filter-data-v1','label_contract':{'0':'EXCLUDE','1':'HCX'},'rows':audit['splits'],'hashes':hashes,'independent_real_holdout':False,'final_evaluation_count':0,'training_ready':False,'reason':'Author-labelled synthetic pilot; independent human label review pending','allowed_input_fields':['input.target','input.context'],'prohibited_input_fields':['label','route','semantic_intent','group_id','mode','rationale','split','review_status']},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(audit['splits'],ensure_ascii=False))
