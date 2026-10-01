"""Audit raw local completions and score complete observed panels only."""
import json,math,statistics,hashlib
from pathlib import Path

root=Path('.runtime/slm-three');run=root/'comparison-v4'
read=lambda p:json.loads(p.read_text(encoding='utf8'))
inputs=read(root/'inputs.json');gold={(r['panel'],r['id']):r for r in inputs}
def metrics(rows):
    cm=[[0]*4 for _ in range(4)]
    for r in rows:
        assert r['prediction'] in [0,1,2,3], 'Do not score incomplete/invalid predictions as normal'
        cm[gold[r['panel'],r['id']]['label']][r['prediction']]+=1
    tp=cm[0][0];fp=cm[1][0]+cm[2][0];fn=sum(cm[0][1:])
    return {'tp':tp,'fp':fp,'fn':fn,'precision':tp/(tp+fp) if tp+fp else None,'recall':tp/(tp+fn) if tp+fn else None,
            'f1':2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None,'uncertain_as_ad':cm[3][0],'uncertain_correct':cm[3][3],
            'confusion':cm}

results={}
old=read(Path('.runtime/nuri-1.2-format-v1/results.json'))
for model in ['exaone','kanana','bllossom']:
    completion=read(run/(model+'-completion.json'));assert completion['error'] is None and completion['rows']==233
    rows=read(run/(model+'-rows.json'));ev=[r for r in rows if r['phase']=='evaluation'];repeat=[r for r in rows if r['phase']=='repeat']
    assert [(r['panel'],r['id']) for r in ev]==list(gold) and len(repeat)==12
    rendered={(r['panel'],r['id']):r['prompt'] for r in read(root/model/'rendered-inputs.json')}
    for r in rows:
        raw=read(run/f"{model}-{r['phase']}-{r['index']}-response.json")
        assert raw['prompt']==rendered[r['panel'],r['id']]
        assert raw['timings']['cache_n']==0 and not raw['truncated'] and raw['stop_type']!='limit'
        assert json.loads(raw['content'])=={'label':r['prediction']}
        assert raw['tokens_evaluated']+32<=4096
    dev=[r for r in ev if r['panel']!='human17'];human=[r for r in ev if r['panel']=='human17']
    pred={(r['panel'],r['id']):r['prediction'] for r in ev}
    times=sorted(r['wall_sec'] for r in ev)
    retention={}
    for baseline in ['A','old_freeze8']:
        bp={(panel,r['id']):r['prediction'] for panel,pr in old[baseline]['panels'].items() for r in pr['predictions']}
        positive=[k for k,v in gold.items() if v['label']==0]
        retention[baseline]={'lost_tp':sum(bp[k]==0 and pred[k]!=0 for k in positive),'recovered_fn':sum(bp[k]!=0 and pred[k]==0 for k in positive)}
    results[model]={'development':metrics(dev),'panels':{panel:metrics([r for r in dev if r['panel']==panel]) for panel in ['new40','broad120','ownership44']},
                    'human17_false_positives':sum(r['prediction']==0 for r in human),'repeat_changes':sum(r['prediction']!=pred[r['panel'],r['id']] for r in repeat),
                    'retention':retention,'seconds_221':sum(times),'median_sec':statistics.median(times),'p95_sec':times[math.ceil(.95*len(times))-1],
                    'prompt_tokens':sum(r['usage']['prompt_tokens'] for r in ev),'max_prompt_tokens':max(r['usage']['prompt_tokens'] for r in ev),
                    'completion_tokens':sum(r['usage']['completion_tokens'] for r in ev),'prompt_seconds':sum(r['timings']['prompt_ms'] for r in ev)/1000,
                    'generation_seconds':sum(r['timings']['predicted_ms'] for r in ev)/1000,'memory':read(run/(model+'-memory.json')),
                    'startup':read(run/(model+'-startup.json')),'audit':'all raw prompts, predictions, no truncation, no cache reuse verified'}
results['baseline_reference']={k:{'summary':old[k]['summary'],'human17_false_positives':old[k]['real17']['false_positives']} for k in ['A','old_freeze8']}
(run/'report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(results,ensure_ascii=False,indent=2))
