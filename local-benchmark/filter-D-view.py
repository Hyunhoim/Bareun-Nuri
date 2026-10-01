"""Only veto existing exclusions; auxiliary views never replace saved evidence."""
import importlib.util,json
from pathlib import Path
def module(name,file):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
r=module('runner','filter11-run.py');p=r.p;ROOT=Path('.runtime/filter-D-view-v1')
def save(name,obj):(ROOT/(name+'.json')).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8')
def ordinary(s):return s['length']<=512 and max(range(4),key=s['scores'].__getitem__)==2 and s['scores'][0]<.0001 and s['scores'][2]>=.9
def main():
    ROOT.mkdir(exist_ok=False)
    source=r.read('.runtime/filter-D-frontier-v1/fixed-excluded.json');stress=r.read('.runtime/filter-D-stress-v1/fixed-losses.json');rows=source+stress
    assert len({x['id'] for x in rows})==len(rows)
    p.torch.set_num_threads(8);tok=p.AutoTokenizer.from_pretrained('.runtime/klue-audit-learning-v1/run-cpu/model',local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained('.runtime/klue-audit-learning-v1/run-cpu/model',local_files_only=True).to('cpu')
    views={'target_only':[dict(x,input={'target':x['input']['target'],'context':''}) for x in rows],
        'owned_context':[dict(x,input={'target':x['input']['target'],'context':'\n'.join(x['input']['context'].splitlines()[1:])}) for x in rows]}
    scores={};seconds={}
    for name,items in views.items():scores[name],seconds[name]=r.infer(model,tok,items,'cpu');save(name+'-scores',scores[name])
    result={'additional_cpu_seconds':seconds,'original_excluded':len(source),'original_stress_lost':len(stress),'conditions':{}}
    for mode in ['target_only','owned_context','both']:
        keep=[ordinary(scores[mode][i]) if mode!='both' else ordinary(scores['target_only'][i]) and ordinary(scores['owned_context'][i]) for i in range(len(rows))]
        stats={}
        for panel in ['real','replica','stress']:
            ix=[i for i,x in enumerate(rows) if x.get('panel','stress')==panel]
            stats[panel]={'excluded':sum(keep[i] for i in ix),'normal_excluded':sum(keep[i] and rows[i].get('label') in [1,2] for i in ix),'ads_lost':sum(keep[i] and rows[i].get('label')==0 for i in ix),'uncertain_lost':sum(keep[i] and rows[i].get('label')==3 for i in ix),'unknown_excluded':sum(keep[i] and rows[i].get('label') is None for i in ix)}
        result['conditions'][mode]=stats;save(mode+'-excluded',[x for i,x in enumerate(rows) if keep[i]])
    save('result',result);print(json.dumps(result),flush=True)
if __name__=='__main__':main()
