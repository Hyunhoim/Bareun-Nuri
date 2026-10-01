"""Score frozen predictions against explicitly assistant-authored observed labels."""
import argparse, hashlib, importlib.util, json
from pathlib import Path

spec = importlib.util.spec_from_file_location('validation', Path(__file__).with_name('semantic-validation.py'))
v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
QUEUE = Path('local-benchmark/semantic-review-queue-v1/review-inputs.json')
ANSWERS = Path('local-benchmark/semantic-review-assistant-v1/answers.json')
ORIGINAL = Path('.runtime/semantic-encoder-real-hcx-v1')

def read(p): return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p, obj): Path(p).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf8')

def inputs():
    rows = read(QUEUE); labels = read(ANSWERS)
    assert labels['input_sha256'] == sha(QUEUE)
    assert labels['reviewer'] == 'assistant' and not labels['independent_human_gold']
    by_id = {r['id']: r for r in rows}
    assert len(by_id) == len(rows) == len(labels['answers']) == 62
    assert len({a['id'] for a in labels['answers']}) == 62
    for a in labels['answers']:
        assert a['purpose'] == by_id[a['id']]['purpose'] and a['reason']
        assert a['reviewed_by'] == 'assistant' and not a['human_label_reviewed']
    keys = [dict(a, label=None if a['label'] == 'uncertain' else int(a['label']))
            for a in labels['answers'] if a['purpose'] == 'observed']
    original = read('.runtime/semantic-encoder-real-v1/review-inputs.json')
    assert {k['id'] for k in keys} == {r['id'] for r in original}
    assert all(r['input'] == by_id[r['id']]['input'] for r in original)
    return keys

def assessment(keys, pred):
    result = v.metrics(keys, pred)
    result['false_positive_numbers'] = [k['number'] for k in keys if k['label'] == 0 and pred[k['id']] == 1]
    result['missed_ad_numbers'] = [k['number'] for k in keys if k['label'] == 1 and pred[k['id']] != 1]
    result['unknown_as_ad_numbers'] = [k['number'] for k in keys if k['label'] is None and pred[k['id']] == 1]
    return result

def score(root, output):
    keys = inputs(); ids = {k['id'] for k in keys}; files = [QUEUE, ANSWERS]
    classifiers = {}
    for name in ['klue', 'kc', 'ko']:
        f = root/name/'predictions.json'; files.append(f)
        rows = read(f); assert len(rows) == len(ids)
        p = {r['id']: r for r in rows}; assert set(p) == ids
        for r in rows:
            assert r['raw_prediction'] == int(r['p_ad'] >= .5)
            assert r['safe_prediction'] == (None if r['guard'] else r['raw_prediction'])
        classifiers[name] = p
    common = {i for i in ids if all(not p[i]['guard'] for p in classifiers.values())}
    output.mkdir(exist_ok=False)
    result = dict(label_provenance='assistant_annotated_observed_regression', independent_human_gold=False,
                  rows=len(keys), common_unguarded=len(common), models={}, api_calls=0, production_changed=False)
    for name, p in classifiers.items():
        result['models'][name] = {
            'common': assessment([k for k in keys if k['id'] in common], {i:r['raw_prediction'] for i,r in p.items()}),
            'all_safe': assessment(keys, {i:r['safe_prediction'] for i,r in p.items()}),
            'all_raw_truncated_diagnostic': assessment(keys, {i:r['raw_prediction'] for i,r in p.items()}),
            'all_confidence_diagnostic': assessment(keys, {i:r['confidence_prediction'] for i,r in p.items()}),
            'guarded_numbers': [k['number'] for k in keys if p[k['id']]['guard']]}
    for order in ['forward','reverse']:
        f = ORIGINAL/f'{order}-predictions.json'; files.append(f); rows = read(f)
        assert len(rows) == len(ids) and {r['id'] for r in rows} == ids
        assert all(type(r['label']) is int and r['label'] in range(4) for r in rows)
        pred = {r['id']:None if r['label']==3 else int(r['label']==0) for r in rows}
        result['models']['hcx_'+order] = {'common':assessment([k for k in keys if k['id'] in common],pred), 'all_safe':assessment(keys,pred)}
        for name,p in classifiers.items():
            result['models'][name]['vs_hcx_'+order] = {
                'lost_known_tp_numbers':[k['number'] for k in keys if k['label']==1 and pred[k['id']]==1 and p[k['id']]['safe_prediction']!=1],
                'recovered_known_ad_numbers':[k['number'] for k in keys if k['label']==1 and pred[k['id']]!=1 and p[k['id']]['safe_prediction']==1]}
    result['hashes'] = {str(f):sha(f) for f in files+[Path(__file__)]}
    save(output/'scores.json',result)
    print(json.dumps({n:{part:{k:s[k] for k in ['tp','fp','fn_including_positive_abstentions','f1']} for part,s in info.items() if part in ['common','all_safe']} for n,info in result['models'].items()},ensure_ascii=False),flush=True)

def check():
    keys=[dict(id=str(i),number=i,label=y) for i,y in enumerate([1,1,0,0,None])]
    s=assessment(keys,{'0':1,'1':None,'2':1,'3':0,'4':1})
    assert (s['tp'],s['fp'],s['fn_including_positive_abstentions'],s['positive_abstentions'])==(1,1,1,1)
    assert s['false_positive_numbers']==[2] and s['unknown_as_ad_numbers']==[4] and s['f1']==.5
    assert len(inputs())==31

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=ORIGINAL);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    check();score(a.root,a.out)
