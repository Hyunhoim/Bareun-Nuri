"""Read-only evidence audit, without model calls or changing authored labels."""
from pathlib import Path
import json, sys, hashlib, collections

run=Path(sys.argv[1]); job=run/'scan'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
state=read(job/'checkpoint.json')['state']
gold={r['id']:r for r in map(json.loads,Path('test-set-operating-phase1/private/gold.jsonl').read_text(encoding='utf-8').splitlines())}
report=read(run/('evaluation.json' if state['status']!='running' else 'interim-evaluation.json'))['end']
pages={};candidates=[]
for p in state['pages']:
    snapshot=read(job/p['evidence']['file']);pages[p['url']]=snapshot;candidates.extend(snapshot['candidates'])
by_id={c['node_id']:c for c in candidates}
css_issues=[];parent_candidates=[]
for r in report['rows']:
    g=gold[r['id']]
    cs=[c for c in candidates if c['url'].split('://',1)[1].split('/',1)[-1]==g['page_path'].lstrip('/')]
    exact=[c for c in cs if '#n'+g['id'] in c['location']]
    if exact:
        c=exact[0]
        for e in g['style_evidence']:
            if e['technique']=='TRANSPARENT' and e['scope']=='ancestor' and c['own_style']['tag']=='a' and e['kind'] in ['transparent-color','white-on-white','matching-solid-color']:
                css_issues.append({'id':g['id'],'gold':e,'actual_color':c['own_style']['color'],'actual_background':c['own_style']['background'],'chain':c['ancestors'],'explanation':'Inspect UA anchor color overriding ancestor color; authored technique is not automatically rendered.'})
    elif r['miss_reason']=='visited_not_collected':
        possible=[c for c in cs if g['target_text'] and g['target_text'] in c['raw_text']]
        parent_candidates.append({'id':g['id'],'slot':g['slot'],'ad':g['is_violation'],'target':g['target_text'],'possible_containing_candidates':[{'node_id':c['node_id'],'location':c['location'],'raw_text':c['raw_text']} for c in possible],'not_automatically_scored':True})
calls=state['call_records'];timing=[]
if (job/'collection-timing.jsonl').exists():timing=[json.loads(x) for x in (job/'collection-timing.jsonl').read_text(encoding='utf-8').splitlines()]
collection=[x for x in timing if x.get('kind')=='page_collection']
manifest=read(run/'manifest.json');data=Path('test-set-operating-phase1');dataset=read(data/'manifest.json')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
out={'status':state['status'],'sources_unchanged':all(sha(Path(f))==h for f,h in manifest['source_hashes'].items()),'dataset_files_unchanged':all(sha(data/f)==h for f,h in dataset['files'].items()),'authored_style_requires_review':css_issues,'unmatched_locations_with_containing_text':parent_candidates,'calls':len(calls),'http_statuses':dict(collections.Counter(str(c.get('http_status')) for c in calls)),'call_statuses':dict(collections.Counter(c.get('status') for c in calls)),'prompt_tokens':sum((c.get('usage') or {}).get('prompt_tokens',0) for c in calls),'completion_tokens':sum((c.get('usage') or {}).get('completion_tokens',0) for c in calls),'api_service_sec_sum':sum(c.get('service_sec',0) for c in calls),'api_queue_sec_sum':sum(c.get('queue_wait_sec',0) for c in calls),'page_collection_sec_sum':sum(x['total_ms'] for x in collection)/1000,'page_collection_count':len(collection),'timing_caveat':'Concurrent collection duration sum is not elapsed wall time; AntiSpoof time not independently instrumented.','inflight_phase':state.get('inflight',{}).get('phase') if state.get('inflight') else None}
(run/'evidence-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in out.items() if k not in ['authored_style_requires_review','unmatched_locations_with_containing_text']},ensure_ascii=False))
print('style_review',len(css_issues),'unmatched',len(parent_candidates),'containing',sum(bool(r['possible_containing_candidates']) for r in parent_candidates))
