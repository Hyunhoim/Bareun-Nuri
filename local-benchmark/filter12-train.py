"""One heading-invariance data trial, no evaluation phrases in training."""
import importlib.util,json,random,time,math,collections,gc
from pathlib import Path
sp=importlib.util.spec_from_file_location('r',Path(__file__).with_name('filter11-run.py'));r=importlib.util.module_from_spec(sp);sp.loader.exec_module(r)
p=r.p;torch=p.torch;ROOT=Path('.runtime/filter12-v1')
def save(n,x):(ROOT/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
    ROOT.mkdir(exist_ok=False);torch.set_num_threads(8);torch.manual_seed(42);torch.cuda.manual_seed_all(42);assert torch.cuda.is_available()
    tr=r.read('.runtime/filter-title-v1/train.json');va=r.read('.runtime/filter-title-v1/validation.json');assert not {x['group_id'] for x in tr}&{x['group_id'] for x in va}
    hashes={f:p.digest(Path(f)) for f in [__file__,'docs/filter12-plan.md','.runtime/filter-title-v1/train.json','.runtime/filter-title-v1/validation.json']};save('started',{'hashes':hashes,'train':len(tr),'validation':len(va),'seed':42,'epochs':4,'new_final':False})
    tok=p.AutoTokenizer.from_pretrained('.runtime/klue-base',local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained('.runtime/klue-base',local_files_only=True,num_labels=2,id2label={0:'EXCLUDE',1:'HCX'},label2id={'EXCLUDE':0,'HCX':1}).to('cuda');ti,tt=p.encoded(tok,tr);assert tt==0
    opt=torch.optim.AdamW(model.parameters(),lr=2e-5,weight_decay=.01);groups=collections.Counter(x['group_id'] for x in tr);best=None;history=[];start=time.perf_counter()
    for epoch in range(1,5):
        model.train();ix=list(range(len(tr)));random.Random(41+epoch).shuffle(ix);losses=[]
        for i in range(0,len(ix),8):
            assert time.perf_counter()-start<600;ids=ix[i:i+8];opt.zero_grad(set_to_none=True);logits=model(**p.batches(tok,ti,ids,'cuda')).logits
            loss=torch.nn.functional.cross_entropy(logits,torch.tensor([tr[j]['label'] for j in ids],device='cuda'),reduction='none');w=torch.tensor([(2 if tr[j]['label'] else 1)/groups[tr[j]['group_id']] for j in ids],device='cuda');loss=(loss*w).sum()/w.sum();assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(loss.item())
        ss,_=r.infer(model,tok,va,'cuda');cur=r.curve(va,ss);sel=r.choose(cur);ce=sum(-math.log(max(s['scores'][x['label']],1e-30)) for x,s in zip(va,ss))/len(va);rank=(sel['normal_excluded'],-ce,-sel['t'],-epoch);rec={'epoch':epoch,'loss':sum(losses)/len(losses),'ce':ce,'choice':sel,'curve':cur};history.append(rec);save('history',history)
        if best is None or rank>best:best=rank;model.save_pretrained(ROOT/'model',safe_serialization=True);tok.save_pretrained(ROOT/'model');save('development-selection',rec)
        print(json.dumps({'epoch':epoch,'choice':sel}),flush=True)
    del model,opt;torch.cuda.empty_cache();model=p.AutoModelForSequenceClassification.from_pretrained(ROOT/'model',local_files_only=True).to('cuda')
    old=r.read('.runtime/filter11-v1/calibration-inputs.json');oldids={x['id'] for x in va};cal=va+[x for x in old if x['id'] not in oldids];assert len({x['id'] for x in cal})==len(cal)
    assert not {json.dumps(x['input'],sort_keys=True,ensure_ascii=False) for x in tr}&{json.dumps(x['input'],sort_keys=True,ensure_ascii=False) for x in cal}
    ss,_=r.infer(model,tok,cal,'cuda');cur=r.curve(cal,ss);sel=r.choose(cur);save('calibration-scores',ss);save('selection',{'checkpoint':str(ROOT/'model'),'threshold':sel['t'],'calibration':sel,'curve':cur,'model_hash':p.digest(ROOT/'model/model.safetensors')});save('training-completed',{'seconds':time.perf_counter()-start});print(json.dumps({'calibration':sel}),flush=True)
    # Previously observed confirmations are regression only, with no reselection.
    result={};t=sel['t']
    panels={'confirmation':r.read('.runtime/filter-mixed-v1/confirm.json')}
    d=Path('local-benchmark/filter-data-v1/sealed-final');a=[json.loads(l) for l in (d/'final-inputs.jsonl').read_text(encoding='utf8').splitlines()];b=[json.loads(l) for l in (d/'final-labels.jsonl').read_text(encoding='utf8').splitlines()];assert [x['id'] for x in a]==[x['id'] for x in b];panels['consumed_final_regression']=[{**x,**g} for x,g in zip(a,b)]
    for name,rows in panels.items():
        ss,_=r.infer(model,tok,rows,'cuda');save(name+'-scores',ss);result[name]=r.stats(rows,ss,t);print(json.dumps({name:result[name]}),flush=True)
    rows=r.read('.runtime/nuri10-filter-collected-v1/inputs.json');flags={}
    for src in r.read('.runtime/nuri10-filter-collected-v1/sources.json'):
        for c in r.read(src['path'])['candidates']:flags[(c['url'],c['selector'])]=bool(c.get('context_evidence',{}).get('truncated',False))
    for x in rows:x['collection_truncated']=flags[(x['url'],x['selector'])]
    model.to('cpu');ss,secs=r.infer(model,tok,rows,'cpu');save('collected-scores',ss);gone={x['id'] for x,s in zip(rows,ss) if r.safe_exclude(x,s['scores'],s['length'],t)};result['cpu_seconds']=secs;result['panels']={}
    for panel in ['real','replica']:
        ids=[i for i,x in enumerate(rows) if x['panel']==panel];ki=[i for i in ids if rows[i]['label'] is not None];known=[{**rows[i],'label':0 if rows[i]['label'] in [1,2] else 1,'semantic_intent':'ad' if rows[i]['label']==0 else 'uncertain' if rows[i]['label']==3 else 'benign'} for i in ki]
        result['panels'][panel]={'total':len(ids),'excluded':sum(rows[i]['id'] in gone for i in ids),'unknown_excluded':sum(rows[i]['id'] in gone and rows[i]['label'] is None for i in ids),'known':r.stats(known,[ss[i] for i in ki],t)}
    save('excluded-review',[dict(x,scores=s['scores']) for x,s in zip(rows,ss) if x['id'] in gone]);assert all(p.digest(Path(x))==h for x,h in hashes.items());save('result',result);save('completed',{'production_adoption':False,'source_unchanged':True,'new_final_evaluations':0});print(json.dumps(result,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
