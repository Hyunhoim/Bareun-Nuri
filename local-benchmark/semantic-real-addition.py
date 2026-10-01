"""Fixed GPU control versus real-input addition, reusing the encoder pipeline."""
import argparse, collections, gc, importlib.util, json, random, time
from pathlib import Path
from urllib.parse import urlparse

spec=importlib.util.spec_from_file_location('encoder',Path(__file__).with_name('semantic-encoder.py'))
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
R=Path('.runtime/semantic-real-addition-gpu-v1')
LABELS=Path('local-benchmark/semantic-review-assistant-v1/answers.json')
QUEUE=Path('local-benchmark/semantic-review-queue-v1/review-inputs.json')
SUPPLEMENTS=[Path('local-benchmark')/f'real-context-supplement-v{i}'/'candidates.jsonl' for i in [1,2]]
PLAN=Path('docs/semantic-real-addition-plan.md')

def datasets(arm):
    train=e.v.readl(e.TRAIN if arm=='control' else R/'train.jsonl')
    return train,e.v.readl(e.v.ROOT/'inputs.jsonl'),e.v.readl(e.v.ROOT/'labels.jsonl')

def prepare():
    assert not R.exists();e.verify()
    base,dev,_=e.rows();answers=e.read(LABELS)
    assert answers['input_sha256']==e.p.digest(QUEUE) and answers['reviewer']=='assistant'
    queue={r['id']:r for r in e.read(QUEUE)}
    ann={a['id']:a for a in answers['answers'] if a['purpose']=='training_candidate'}
    candidates=[r for f in SUPPLEMENTS for r in e.v.readl(f)]
    assert len(ann)==len(candidates)==31 and set(ann)=={r['id'] for r in candidates}
    existing_families={r['family_id'] for r in base};added=[];excluded=[]
    observed=[r for r in queue.values() if r['purpose']=='observed']
    ref_keys={e.v.canonical(r['input']) for r in base+dev+observed}
    obs_hosts={urlparse(r['url']).hostname for r in observed}
    for r in candidates:
        a=ann[r['id']];assert r['input']==queue[r['id']]['input']
        assert e.v.canonical(r['input']) not in ref_keys
        assert urlparse(r['url']).hostname not in obs_hosts
        reasons=(['uncertain_label'] if a['label']=='uncertain' else [])
        reasons+=sorted({g for guards in r['input_guards'].values() for g in guards})
        if reasons:
            excluded.append(dict(id=r['id'],number=a['number'],reasons=reasons));continue
        family=r['group_id'] if r['group_id'] in existing_families else 'collected:'+r['group_id']
        added.append(dict(r,label=int(a['label']),family_id=family,reason=a['reason'],
                          human_reviewed=False,annotation_status='assistant_annotated_at_user_request',
                          eligible_for_training=True,training_scope='this_fixed_local_research_only'))
    assert len(added)==22 and collections.Counter(r['label'] for r in added)=={0:13,1:9}
    train=base+added;assert len({r['id'] for r in train})==len(train)
    audit={}
    for name,folder in e.BASES.items():
        tok=e.p.AutoTokenizer.from_pretrained(folder,local_files_only=True)
        enc,stats=e.encode(tok,train,512);_,newstats=e.encode(tok,added,512)
        assert newstats['truncated']==0
        groups=collections.defaultdict(set)
        for r,x in zip(train,enc,strict=True):groups[tuple(x['input_ids'])].add(r['label'])
        assert not any(len(labels)>1 for labels in groups.values())
        audit[name]=dict(train=stats,added=newstats,token_unique=len(groups),conflicting_groups=0)
    R.mkdir()
    (R/'train.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in train),encoding='utf8')
    files=[LABELS,QUEUE,*SUPPLEMENTS,PLAN,Path(__file__),e.TRAIN,e.v.ROOT/'inputs.jsonl',e.v.ROOT/'labels.jsonl',Path('local-benchmark/semantic-encoder.py'),Path('local-benchmark/klue-pilot.py'),Path('local-benchmark/semantic-validation.py')]
    e.save(R/'manifest.json',dict(files={str(f):e.p.digest(f) for f in files+[R/'train.jsonl']},
        base_rows=len(base),added_rows=len(added),train_rows=len(train),added_ids=[r['id'] for r in added],
        added_labels=dict(collections.Counter(r['label'] for r in added)),excluded=excluded,
        base_families=len(existing_families),new_families=len({r['family_id'] for r in added}-existing_families),
        added_groups=len({r['family_id'] for r in added}),lengths=audit,
        label_provenance='assistant',independent_human_gold=False,api_calls=0,operating_changes=0,
        models={n:{str(f):e.p.digest(f) for f in p.glob('*') if f.is_file()} for n,p in e.BASES.items()}))
    e.log({'prepared':True,'base':len(base),'added':len(added),'excluded':len(excluded)})

def verify():
    m=e.read(R/'manifest.json')
    for f,h in m['files'].items():assert e.p.digest(f)==h,f
    for model in m['models'].values():
        for f,h in model.items():assert e.p.digest(f)==h,f

def train_one(name,arm):
    verify()
    assert e.torch.cuda.is_available(), 'GPU required; use the verified unsandboxed execution path'
    (R/arm).mkdir(exist_ok=True)
    # Keep the old trainer and its exact optimizer, ordering, selection and checks.
    e.R=R/arm
    e.rows=lambda:datasets(arm)
    original_score=e.v.score
    e.v.score=lambda path,name:original_score(path,'real-addition/'+arm+'/'+name)
    out=e.R/f'{name}-f8-t512'
    if (out/'completed.json').exists():
        assert e.p.digest(out/'model/model.safetensors')==e.read(out/'completed.json')['model_sha256']
        return
    e.train_one(name,8,512)


def observe(name,arm):
    import psutil
    verify();assert all((R/a/f'{n}-f8-t512'/'completed.json').exists() for a in ['control','addition'] for n in e.BASES)
    out=R/arm/name;out.mkdir(parents=True,exist_ok=False);folder=R/arm/f'{name}-f8-t512'/'model'
    assert e.p.digest(folder/'model.safetensors')==e.read(folder.parent/'completed.json')['model_sha256']
    e.torch.set_num_threads(8);rows=e.read('.runtime/semantic-encoder-real-v1/review-inputs.json')
    start=time.perf_counter();tok=e.p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=e.p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cpu');load=time.perf_counter()-start
    start=time.perf_counter();enc,stats=e.encode(tok,rows,512);encoding=time.perf_counter()-start
    e.probabilities(model,tok,enc[:8],'cpu');probs,seconds=e.probabilities(model,tok,enc,'cpu');truncated=set(stats['truncated_ids']);pred=[]
    for r,p in zip(rows,probs,strict=True):
        guard=(['token_limit'] if r['id'] in truncated else [])+(['collection_context_truncated'] if r['collection_truncated'] else [])
        pred.append(dict(id=r['id'],p_ad=p,raw_prediction=int(p>=.5),guard=guard,safe_prediction=None if guard else int(p>=.5),confidence_prediction=None if guard or .2<p<.8 else int(p>=.5)))
    e.save(out/'predictions.json',pred);e.save(out/'completed.json',dict(seconds=seconds,load_seconds=load,encoding_seconds=encoding,
        memory=psutil.Process().memory_info()._asdict(),model_sha256=e.p.digest(folder/'model.safetensors'),input_sha256=e.p.digest('.runtime/semantic-encoder-real-v1/review-inputs.json')))
    e.log({'observed':arm+'-'+name,'seconds':seconds})

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['prepare','train','observe']);p.add_argument('--model',choices=list(e.BASES));p.add_argument('--arm',choices=['control','addition']);a=p.parse_args()
    if a.action=='prepare':prepare()
    else:
        assert a.model and a.arm
        (train_one if a.action=='train' else observe)(a.model,a.arm)
