"""CPU normal-exclusion diagnostic; never modifies the production pipeline."""
import gc, importlib.util, json, math, time, unicodedata
from pathlib import Path

spec = importlib.util.spec_from_file_location('pilot', Path(__file__).with_name('klue-pilot.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
OUT = Path('.runtime/nuri10-filter-v1')
MODELS = {'Nuri1.0': '.runtime/klue-cycle3-v1/frozen8/model', 'D': '.runtime/klue-audit-learning-v1/run-cpu/model'}
TS = [0, .00001, .0001, .001, .005, .01, .02, .05, .1, .2]
QS = [.9, .95, .99, .999]

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def save(name, value):
    (OUT / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def excluded(row, t, q):
    return row['valid'] and row['length'] <= 512 and row['prediction'] == 2 and row['scores'][2] >= q and row['scores'][0] < t

def infer(name, checkpoint, rows, panel):
    start = time.perf_counter()
    tok = p.AutoTokenizer.from_pretrained(checkpoint, local_files_only=True)
    model = p.AutoModelForSequenceClassification.from_pretrained(checkpoint, local_files_only=True).to('cpu').eval()
    load = time.perf_counter() - start
    texts = []
    valid = []
    for r in rows:
        inp = r['input']
        valid.append(all(isinstance(inp.get(k), str) for k in ['target', 'context']) and bool(inp.get('target', '').strip()))
        assert valid[-1], 'Invalid existing input: preserve for manual audit'
        texts.append('판정대상: ' + unicodedata.normalize('NFC', inp['target']) + '\n문맥: ' + unicodedata.normalize('NFC', inp['context']))
    start = time.perf_counter()
    full = tok(texts, truncation=False, return_token_type_ids=False)
    short = tok(texts, truncation=True, max_length=512, return_token_type_ids=False)
    inputs = [{k: v[i] for k, v in short.items()} for i in range(len(rows))]
    token_seconds = time.perf_counter() - start
    result = []
    start = time.perf_counter()
    with p.torch.inference_mode():
        for i in range(0, len(rows), 8):
            probs = model(**p.batches(tok, inputs, list(range(i, min(i+8, len(rows)))), 'cpu')).logits.softmax(-1).tolist()
            for j, scores in enumerate(probs, i):
                assert all(math.isfinite(v) for v in scores) and abs(sum(scores)-1) < .00001
                result.append({'id': rows[j]['id'], 'scores': scores, 'prediction': max(range(4), key=scores.__getitem__), 'length': len(full['input_ids'][j]), 'valid': valid[j]})
            if len(result) % 256 == 0:
                print(name, panel, len(result), round(time.perf_counter()-start, 2), flush=True)
    seconds = time.perf_counter()-start
    assert len({r['id'] for r in result}) == len(rows)
    save(name+'-'+panel+'-scores', result)
    timing = {'load_seconds': load, 'tokenization_seconds': token_seconds, 'inference_seconds': seconds, 'truncated': sum(r['length'] > 512 for r in result)}
    del model
    gc.collect()
    return result, timing

def counts(scores, labels, t, q):
    result = {'total': len(scores), 'excluded': 0, 'ads': 0, 'ads_lost': 0, 'normal': 0, 'normal_excluded': 0, 'uncertain': 0, 'uncertain_excluded': 0}
    for r in scores:
        y = labels[r['id']]
        ex = excluded(r, t, q)
        result['excluded'] += ex
        key = 'ads' if y == 0 else 'uncertain' if y == 3 else 'normal'
        result[key] += 1
        result[{'ads': 'ads_lost', 'normal': 'normal_excluded', 'uncertain': 'uncertain_excluded'}[key]] += ex
        assert not (ex and (r['length'] > 512 or r['prediction'] in [1, 3]))
    return result

def quantiles(values):
    a = sorted(values)
    return {str(q): a[round((len(a)-1)*q)] for q in [0, .1, .5, .9, 1]} if a else {}

def main():
    OUT.mkdir(exist_ok=True)
    assert not (OUT/'started.json').exists(), 'Do not silently repeat'
    p.torch.set_num_threads(8)
    sample = {'valid': True, 'length': 10, 'prediction': 2, 'scores': [.001, .001, .997, .001]}
    assert excluded(sample, .01, .99) and not excluded(sample, 0, .99)
    assert not excluded(dict(sample, length=513), .01, .99)
    files = [Path('docs/nuri10-filter-plan.md'), Path(__file__), Path('.runtime/klue-input-audit-v2/corrected-inputs.json'), Path('test-set-contest-v1/data/private/gold.json'), Path('.runtime/slm-three/inputs.json')]
    files += [f for path in MODELS.values() for f in Path(path).glob('*') if f.is_file()]
    hashes = {str(f): p.digest(f) for f in files}
    save('started', {'hashes': hashes, 'models': MODELS, 'threads': 8, 'batch': 8, 'device': 'cpu'})
    rows = read(files[2]); gold = {r['id']: r for r in read(files[3])}
    labels = {k: 0 if r['is_violation'] else 2 for k, r in gold.items()}
    assert len(rows) == 2000 and sum(y == 0 for y in labels.values()) == 1000
    summary = {}
    for name, checkpoint in MODELS.items():
        scores, timing = infer(name, checkpoint, rows, 'development')
        grid = [{'t': t, 'q': q, **counts(scores, labels, t, q)} for t in TS for q in QS]
        selection = sorted((r for r in grid if r['ads_lost'] == 0), key=lambda r: (-r['normal_excluded'], r['t'], -r['q']))[0]
        missing = [r for r in scores if labels[r['id']] == 0 and r['prediction'] != 0]
        summary[name] = {'development_timing': timing, 'grid': grid, 'selection': selection,
            'classification': p.metrics([labels[r['id']] for r in scores], [r['prediction'] for r in scores]),
            'miss_scores': {'count': len(missing), 'ordinary': sum(r['prediction'] == 2 for r in missing), 'ad_quantiles': quantiles([r['scores'][0] for r in missing]), 'ordinary_quantiles': quantiles([r['scores'][2] for r in missing])},
            'techniques': {tech: counts([r for r in scores if gold[r['id']]['technique'] == tech], labels, selection['t'], selection['q']) for tech in sorted({r['technique'] for r in gold.values()})}}
    save('frozen-selection', summary)
    # Selection is durably frozen before confirmation inputs/labels are opened.
    confirmation = read('.runtime/slm-three/inputs.json')
    c_labels = {r['id']: r['label'] for r in confirmation}
    hcx = read('.runtime/exaone-hcx-v1/rows.json')
    for name, checkpoint in MODELS.items():
        scores, timing = infer(name, checkpoint, confirmation, 'confirmation')
        chosen = summary[name]['selection']
        removed = {r['id'] for r in scores if excluded(r, chosen['t'], chosen['q'])}
        summary[name]['confirmation'] = counts(scores, c_labels, chosen['t'], chosen['q'])
        summary[name]['confirmation_timing'] = timing
        summary[name]['confirmation_excluded_ids'] = sorted(removed)
        summary[name]['hcx_counterfactual'] = {}
        for phase in ['single', 'batch12']:
            predictions = {r['id']: r['prediction'] for req in hcx if req['phase'] == phase and not req.get('error') for r in req['rows']}
            assert set(predictions) == set(c_labels)
            summary[name]['hcx_counterfactual'][phase] = {'before': p.metrics(list(c_labels.values()), [predictions[k] for k in c_labels]), 'after': p.metrics(list(c_labels.values()), [2 if k in removed else predictions[k] for k in c_labels]), 'lost_hcx_tp': sum(k in removed and c_labels[k] == 0 and predictions[k] == 0 for k in c_labels)}
    assert all(p.digest(Path(f)) == h for f, h in hashes.items()), 'Source changed during measurement'
    save('result', summary)
    print(json.dumps({k: {'selection': v['selection'], 'confirmation': v['confirmation']} for k, v in summary.items()}), flush=True)

if __name__ == '__main__':
    main()
