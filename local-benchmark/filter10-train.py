"""One bounded fresh-base filter trial; final dataset is never opened."""
import collections, importlib.util, json, random, time
from pathlib import Path
spec=importlib.util.spec_from_file_location('f',Path(__file__).with_name('nuri10-filter.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
p=f.p;torch=p.torch;OUT=Path('.runtime/filter-1.0-v1');DATA=Path('local-benchmark/filter-data-v1')
def save(n,v):(OUT/(n+'.json')).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf8')
def read(pth):return json.loads(Path(pth).read_text(encoding='utf8'))
def load(split):
    a=[json.loads(l) for l in (DATA/(split+'-inputs.jsonl')).read_text(encoding='utf8').splitlines()]
    b=[json.loads(l) for l in (DATA/(split+'-labels.jsonl')).read_text(encoding='utf8').splitlines()]
    assert [r['id'] for r in a]==[r['id'] for r in b]
    return [{**r,**g} for r,g in zip(a,b)]
def probs(model,tok,inputs,device):
    model.eval();out=[];start=time.perf_counter()
    with torch.inference_mode():
        for i in range(0,len(inputs),8):out.extend(model(**p.batches(tok,inputs,list(range(i,min(i+8,len(inputs)))),device)).logits.softmax(-1).cpu().tolist())
    return out,time.perf_counter()-start
def stats(rows,scores,t,lengths=None):
    gone=[i for i,s in enumerate(scores) if s[1]<t and (lengths is None or lengths[i]<=512)]
    normal=sum(r['label']==0 for r in rows);passed=sum(r['label']==1 for r in rows);lost=sum(rows[i]['label']==1 for i in gone);excluded=sum(rows[i]['label']==0 for i in gone)
    tp=passed-lost;fp=normal-excluded
    return {'rows':len(rows),'normal':normal,'must_pass':passed,'normal_excluded':excluded,'must_pass_lost':lost,'excluded':len(gone),'route_f1':2*tp/(2*tp+fp+lost) if 2*tp+fp+lost else 0,'ad_total':sum(r.get('semantic_intent')=='ad' for r in rows),'ad_lost':sum(rows[i].get('semantic_intent')=='ad' for i in gone),'uncertain_total':sum(r.get('semantic_intent')=='uncertain' for r in rows),'uncertain_lost':sum(rows[i].get('semantic_intent')=='uncertain' for i in gone)}
def main():
    OUT.mkdir(exist_ok=False);torch.set_num_threads(8);torch.manual_seed(42);random.seed(42)
    assert torch.cuda.is_available();torch.cuda.manual_seed_all(42)
    tr,va=load('train'),load('validation');assert not {r['group_id'] for r in tr}&{r['group_id'] for r in va}
    manifest=read(DATA/'manifest.json');files=[DATA/(s+'-'+k+'.jsonl') for s in ['train','validation'] for k in ['inputs','labels']]
    for file in files:assert p.digest(file)==manifest['hashes'][str(file)]
    sources=files+[Path(__file__),Path('docs/filter10-plan.md')]+[x for x in Path('.runtime/klue-base').glob('*') if x.is_file()]
    hashes={str(x):p.digest(x) for x in sources};save('started',{'hashes':hashes,'name':'Filter 1.0','human_reviewed':False,'author_rechecked':True,'final_opened':False,'device':torch.cuda.get_device_name(0),'seed':42})
    assert stats([{'label':0},{'label':1}],[[.99,.01],[.1,.9]],.1)['must_pass_lost']==0
    tok=p.AutoTokenizer.from_pretrained('.runtime/klue-base',local_files_only=True)
    model=p.AutoModelForSequenceClassification.from_pretrained('.runtime/klue-base',local_files_only=True,num_labels=2,id2label={0:'EXCLUDE',1:'HCX'},label2id={'EXCLUDE':0,'HCX':1}).to('cuda')
    ti,tt=p.encoded(tok,tr);vi,vt=p.encoded(tok,va);assert tt==vt==0
    counts=collections.Counter(r['group_id'] for r in tr);weights=[(2 if r['label']==1 else 1)/counts[r['group_id']] for r in tr]
    opt=torch.optim.AdamW(model.parameters(),lr=2e-5,weight_decay=.01);history=[];best=None;start=time.perf_counter()
    for epoch in range(1,5):
        model.train();ix=list(range(len(tr)));random.Random(41+epoch).shuffle(ix);losses=[]
        for i in range(0,len(ix),8):
            assert time.perf_counter()-start<600
            ids=ix[i:i+8];opt.zero_grad(set_to_none=True)
            logits=model(**p.batches(tok,ti,ids,'cuda')).logits
            loss=torch.nn.functional.cross_entropy(logits,torch.tensor([tr[j]['label'] for j in ids],device='cuda'),reduction='none')
            w=torch.tensor([weights[j] for j in ids],device='cuda');loss=(loss*w).sum()/w.sum();assert torch.isfinite(loss)
            loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(loss.item())
        scores,secs=probs(model,tok,vi,'cuda');ce=sum(-__import__('math').log(max(s[r['label']],1e-30)) for r,s in zip(va,scores))/len(va)
        grid=[{'t':t,**stats(va,scores,t)} for t in [0,.01,.05,.1,.2,.3,.4,.5]]
        choice=sorted([x for x in grid if x['must_pass_lost']==0],key=lambda x:(-x['normal_excluded'],x['t']))[0]
        rank=(choice['normal_excluded'],-ce,-choice['t'],-epoch)
        rec={'epoch':epoch,'train_loss':sum(losses)/len(losses),'validation_ce':ce,'argmax':stats(va,scores,.5),'selected_threshold':choice,'grid':grid,'elapsed_seconds':time.perf_counter()-start}
        history.append(rec);save('history',history)
        if best is None or rank>best:
            best=rank;model.save_pretrained(OUT/'model',safe_serialization=True);tok.save_pretrained(OUT/'model');save('selection',rec);save('validation-scores',[{'id':r['id'],'scores':s} for r,s in zip(va,scores)])
        print(json.dumps(rec),flush=True)
    save('training-completed',{'seconds':time.perf_counter()-start,'epochs':4,'gpu_peak_bytes':torch.cuda.max_memory_allocated()});del model;torch.cuda.empty_cache()
    # Freeze checkpoint/threshold before historical diagnostic panels.
    selection=read(OUT/'selection.json');threshold=selection['selected_threshold']['t'];save('frozen',{'threshold':threshold,'model_sha256':p.digest(OUT/'model/model.safetensors')})
    model=p.AutoModelForSequenceClassification.from_pretrained(OUT/'model',local_files_only=True).to('cpu');results={}
    gold={r['id']:r for r in read('test-set-contest-v1/data/private/gold.json')}
    panels={'development':va,'observed221':[{**r,'label':0 if r['label'] in [1,2] else 1,'semantic_intent':'ad' if r['label']==0 else 'uncertain' if r['label']==3 else 'benign'} for r in read('.runtime/slm-three/inputs.json')], 'observed2000':[{**r,'label':int(gold[r['id']]['is_violation']),'semantic_intent':'ad' if gold[r['id']]['is_violation'] else 'benign'} for r in read('.runtime/klue-input-audit-v2/corrected-inputs.json')]}
    for name,rows in panels.items():
        inp,truncated=p.encoded(tok,rows);lengths=[len(x) for x in tok(['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context'] for r in rows],truncation=False)['input_ids']]
        scores,seconds=probs(model,tok,inp,'cpu');results[name]={'filter':stats(rows,scores,threshold,lengths),'argmax':stats(rows,scores,.5,lengths),'cpu_seconds':seconds,'truncated':truncated}
        save(name+'-scores',[{'id':r['id'],'scores':s,'length':n,'excluded':s[1]<threshold and n<=512} for r,s,n in zip(rows,scores,lengths)])
        print(json.dumps({name:results[name]}),flush=True)
    del model
    f.OUT=OUT
    ds,dt=f.infer('D',f.MODELS['D'],va,'development');removed={r['id'] for r in ds if f.excluded(r,.0001,.9)}
    results['D_development']={'filter':stats(va,[[1,0] if r['id'] in removed else [0,1] for r in va],.5),'timing':dt}
    for name,oldpanel in [('observed221','confirmation'),('observed2000','development')]:
        ds=read('.runtime/nuri10-filter-v1/D-'+oldpanel+'-scores.json');removed={r['id'] for r in ds if f.excluded(r,.0001,.9)}
        assert {r['id'] for r in ds}=={r['id'] for r in panels[name]}
        results['D_'+name]={'filter':stats(panels[name],[[1,0] if r['id'] in removed else [0,1] for r in panels[name]],.5)}
    assert all(p.digest(Path(x))==h for x,h in hashes.items())
    save('result',results);save('completed',{'training':True,'development':True,'final_opened':False,'production_adoption':False,'api_calls':0})
if __name__=='__main__':main()
