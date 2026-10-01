"""One frozen-candidate confirmation and collection diagnostic; never train here."""
import importlib.util,json,math,time
from pathlib import Path
sp=importlib.util.spec_from_file_location('r',Path(__file__).with_name('filter11-run.py'));r=importlib.util.module_from_spec(sp);sp.loader.exec_module(r)
p=r.p;torch=r.torch;ROOT=r.ROOT
def main():
    assert not (ROOT/'verification-started.json').exists();torch.set_num_threads(8)
    selected=r.read(ROOT/'selection.json');checkpoint=selected['checkpoint'];t=selected['calibration']['t']
    assert p.digest(Path(checkpoint)/'model.safetensors')==selected['model_hash'];r.save('verification-started',{'model_hash':selected['model_hash'],'threshold':t,'time':time.time()})
    tok=p.AutoTokenizer.from_pretrained(checkpoint,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(checkpoint,local_files_only=True).to('cuda')
    new=r.read('.runtime/filter-mixed-v1/confirm.json');ss,secs=r.infer(model,tok,new,'cuda');confirm=r.stats(new,ss,t);r.save('confirmation-scores',ss)
    result={'selection':{'name':selected['name'],'threshold':t},'confirmation':confirm,'final_evaluated':False}
    print(json.dumps({'confirmation':confirm}),flush=True)
    if confirm['must_pass_lost']==0:
        data=Path('local-benchmark/filter-data-v1/sealed-final');r.save('final-started',{'model_hash':selected['model_hash'],'threshold':t,'time':time.time(),'one_use':True})
        # First final read in this experiment; freeze model and threshold above.
        inputs=[json.loads(l) for l in (data/'final-inputs.jsonl').read_text(encoding='utf8').splitlines()]
        ss,secs=r.infer(model,tok,inputs,'cuda');r.save('final-scores',ss)
        labels=[json.loads(l) for l in (data/'final-labels.jsonl').read_text(encoding='utf8').splitlines()];assert [x['id'] for x in labels]==[x['id'] for x in inputs]
        final=[{**x,**g} for x,g in zip(inputs,labels)];result['final']=r.stats(final,ss,t);result['final_evaluated']=True
        print(json.dumps({'final':result['final']}),flush=True)
    # Structural protection is derived from saved collector evidence, never gold.
    rows=r.read('.runtime/nuri10-filter-collected-v1/inputs.json');flags={}
    for source in r.read('.runtime/nuri10-filter-collected-v1/sources.json'):
        for c in r.read(source['path'])['candidates']:flags[(c['url'],c['selector'])]=bool(c.get('context_evidence',{}).get('truncated',False))
    for row in rows:row['collection_truncated']=flags[(row['url'],row['selector'])]
    model.to('cpu');ss,secs=r.infer(model,tok,rows,'cpu');r.save('collected-scores',ss);removed={x['id'] for row,x in zip(rows,ss) if r.safe_exclude(row,x['scores'],x['length'],t)}
    result['cpu_seconds']=secs;result['collection_flags']=sum(x['collection_truncated'] for x in rows);result['long_inputs']=sum(x['length']>512 for x in ss);result['panels']={}
    for panel in ['real','replica']:
        ids=[i for i,x in enumerate(rows) if x['panel']==panel];known=[i for i in ids if rows[i]['label'] is not None]
        ks=[{**rows[i],'label':0 if rows[i]['label'] in [1,2] else 1,'semantic_intent':'ad' if rows[i]['label']==0 else 'uncertain' if rows[i]['label']==3 else 'benign'} for i in known]
        result['panels'][panel]={'total':len(ids),'excluded':sum(rows[i]['id'] in removed for i in ids),'unknown_excluded':sum(rows[i]['id'] in removed and rows[i]['label'] is None for i in ids),'known':r.stats(ks,[ss[i] for i in known],t)}
    r.save('excluded-review',[dict(row,scores=s['scores']) for row,s in zip(rows,ss) if row['id'] in removed])
    # Deterministic routing audit: partial prefix persisted, then resume on suffix.
    def route(items,scores):
        return [{'id':x['id'],'route':'EXCLUDE' if r.safe_exclude(x,s['scores'],s['length'],t) else 'HCX','input_hash':__import__('hashlib').sha256(json.dumps(x['input'],sort_keys=True,ensure_ascii=False).encode()).hexdigest()} for x,s in zip(items,scores)]
    allroutes=route(rows,ss);r.save('routing-prefix',{'signature':selected['model_hash']+':'+str(t),'completed':allroutes[:73]})
    saved=r.read(ROOT/'routing-prefix.json');assert saved['signature']==selected['model_hash']+':'+str(t)
    assert saved['completed']+route(rows[73:],ss[73:])==allroutes;assert len({x['id'] for x in allroutes})==len(rows)
    probe={'input':{'target':'안내','context':'게시판'}}
    assert not r.safe_exclude(probe,[.99,.01],513,t)
    assert not r.safe_exclude({**probe,'collection_truncated':True},[1,0],10,t)
    assert not r.safe_exclude(probe,[float('nan'),0],10,t)
    assert not r.safe_exclude({'input':{'target':'안내'}},[1,0],10,t)
    assert not r.safe_exclude(probe,[1,1],10,t)
    assert saved['signature']!=selected['model_hash']+':'+str(t+.01)
    result['routing_audit']={'passed':True,'rows':len(rows),'resume_prefix':73,'long_invalid_missing_context_pass':True,'scope':'saved-score replay; not backend integration'}
    result['production_adoption']=False
    r.save('verification-result',result);print(json.dumps(result,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
