import json, re, statistics, sys
from pathlib import Path
from urllib.parse import urlsplit

p = Path(sys.argv[1])
read = lambda name: json.loads((p / name).read_text(encoding='utf-8'))
jobs = read('inputs.json')
gold = [json.loads(x) for x in Path('.runtime/phase1-operating-1790735149471/gold-frozen.jsonl').read_text(encoding='utf-8').splitlines()]
gmap = {(g['page_path'], g['id']): g for g in gold}
items = {c['node_id']: c for j in jobs for c in j['items']}
labels = {}
for nid, c in items.items():
    match = re.search(r'#n([a-f0-9]{14})(?![a-f0-9])', c['location'])
    key = (urlsplit(c['url']).path, match[1]) if match else None
    if key in gmap:
        labels[nid] = gmap[key]['is_violation']

def metrics(pred):
    tp = sum(y and pred[k]['is_violation'] for k,y in labels.items())
    fp = sum(not y and pred[k]['is_violation'] for k,y in labels.items())
    fn = sum(y and not pred[k]['is_violation'] for k,y in labels.items())
    return dict(tp=tp, fp=fp, fn=fn, precision=tp/(tp+fp) if tp+fp else 0,
                recall=tp/(tp+fn) if tp+fn else 0, f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0)

results = read('results.json')
clean=read('manifest.json').get('cleanMode',False)
assert len(results)==(6 if clean else 4) and all(not r['error'] for r in results)
preds, rounds, requests = [], [], []
for r in results:
    name = f"{r['round']}-{r['arm']}"
    rows = read(name+'-rows.json')
    pred = {d['node_id']:d for row in rows for d in row['decisions']}
    assert set(pred)==set(items)
    preds.append(pred)
    traces = [json.loads(x) for x in (p/(name+'-trace.jsonl')).read_text(encoding='utf-8').splitlines()]
    requests.append([t['body'] for t in traces if t['event']=='llm_request'])
    rounds.append(dict(round=r['round'], arm=r['arm'], **metrics(pred), wall_sec=r['wall_sec'],
        median_service_sec=statistics.median(c['service_sec'] for c in r['calls']),
        tokens=sum(c['usage']['total_tokens'] for c in r['calls']),
        output_tokens=sum(c['usage']['completion_tokens'] for c in r['calls']),
        queue_sec=sum(c['queue_wait_sec'] for c in r['calls'])))

for reqs in requests[1:]:
    for a,b in zip(requests[0],reqs):
        assert a['messages'][1:]==b['messages'][1:]
        assert {k:v for k,v in a.items() if k not in ('messages','responseFormat')}=={k:v for k,v in b.items() if k not in ('messages','responseFormat')}
for j in range(len(jobs)):
    a,b=requests[0][j],requests[1][j]
    assert 'responseFormat' not in a and b['responseFormat']['type']=='json'
    assert a['messages'][0]['content'].startswith(b['messages'][0]['content'])
    if clean:
        c=requests[2][j]
        assert b['responseFormat']==c['responseFormat']
        assert b['messages'][0]['content'].split('\nJSON decisions')[0]==c['messages'][0]['content'].split('\n출력 형식')[0]
        assert len(c['messages'][0]['content'].split('\n출력 형식'))==2

def delta(a,b):
    return dict(tp_lost=sum(labels[k] and preds[a][k]['is_violation'] and not preds[b][k]['is_violation'] for k in labels),
                new_fp=sum(not labels[k] and not preds[a][k]['is_violation'] and preds[b][k]['is_violation'] for k in labels),
                binary_changes=sum(preds[a][k]['is_violation']!=preds[b][k]['is_violation'] for k in items),
                category_changes=sum(preds[a][k]['publication_act']!=preds[b][k]['publication_act'] for k in items))
arms={}
for arm in ('ABC' if clean else 'AB'):
    rr=[r for r in rounds if r['arm']==arm]
    tp,fp,fn=[sum(r[k] for r in rr) for k in ('tp','fp','fn')]
    calls=[c for r in results if r['arm']==arm for c in r['calls']]
    arms[arm]=dict(tp=tp,fp=fp,fn=fn,f1=2*tp/(2*tp+fp+fn),precision=tp/(tp+fp),recall=tp/(tp+fn),
        median_service_sec=statistics.median(c['service_sec'] for c in calls),
        mean_round_wall_sec=statistics.mean(r['wall_sec'] for r in rr),
        tokens=sum(r['tokens'] for r in rr),output_tokens=sum(r['output_tokens'] for r in rr))
pairs=[delta(0,2),delta(5,3)] if clean else [delta(0,1),delta(3,2)]
target='C' if clean else 'B'
gate=dict(format_pass=True,f1_pass=arms[target]['f1']>=arms['A']['f1']-.01,
          tp_fp_pass=all(d['tp_lost']<=1 and d['new_fp']<=1 for d in pairs),
          latency_pass=arms[target]['median_service_sec']<=arms['A']['median_service_sec']*1.2)
out=dict(candidates=len(items),labeled=len(labels),ads=sum(labels.values()),rounds=rounds,arms=arms,pairs=pairs,
         repeat_changes=(dict(A=delta(0,5),B=delta(1,4),C=delta(2,3)) if clean else dict(A=delta(0,3),B=delta(1,2))),request_parity=True,gate=gate,screen_pass=all(gate.values()))
if clean:
    out['B_to_C_pairs']=[delta(1,2),delta(4,3)]
    out['batch_profile']=[dict(index=j['index'],count=len(j['items']),user_chars=len(requests[0][i]['messages'][1]['content']),stratum='hash12' if i<12 else ('short3' if i<15 else 'long3')) for i,j in enumerate(jobs)]
    out['strata']={}
    for name,indices in [('hash12',range(12)),('short3',range(12,15)),('long3',range(15,18))]:
        ids={c['node_id'] for i in indices for c in jobs[i]['items']}
        out['strata'][name]={}
        for arm in 'ABC':
            pp=[preds[r['round']] for r in results if r['arm']==arm]
            tp=sum(labels[k] and pred[k]['is_violation'] for pred in pp for k in labels if k in ids)
            fp=sum(not labels[k] and pred[k]['is_violation'] for pred in pp for k in labels if k in ids)
            fn=sum(labels[k] and not pred[k]['is_violation'] for pred in pp for k in labels if k in ids)
            out['strata'][name][arm]=dict(tp=tp,fp=fp,fn=fn,f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None)
(p/'evaluation.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(out,ensure_ascii=False,indent=2))
