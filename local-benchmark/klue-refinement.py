import importlib.util,json,random,time,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('klue-pilot.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
torch=p.torch;root=Path('.runtime/klue-refinement-v1');old=Path('.runtime/klue-pilot-v2')
def read(base,name):return json.loads((base/(name+'.json')).read_text(encoding='utf-8'))
def save(name,value):(root/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
def loss_for(logits,labels):
    logp=logits.log_softmax(-1);loss=[]
    for i,label in enumerate(labels):loss.append(-torch.logsumexp(logp[i,1:3],0) if label==-1 else -logp[i,label])
    return torch.stack(loss).mean()
def main():
    manifest=read(root,'manifest')
    for f,h in manifest['hashes'].items():assert p.digest(root/f)==h
    with (root/'started.json').open('x') as f:json.dump({'seed':42,'epochs':8,'patience':2},f)
    random.seed(42);torch.manual_seed(42);torch.cuda.manual_seed_all(42);torch.set_num_threads(8);assert torch.cuda.is_available()
    tok=p.AutoTokenizer.from_pretrained('.runtime/klue-base',local_files_only=True)
    model=p.AutoModelForSequenceClassification.from_pretrained('.runtime/klue-base',local_files_only=True,num_labels=4,id2label=dict(enumerate(p.LABELS)),label2id={x:i for i,x in enumerate(p.LABELS)},use_safetensors=True).to('cuda')
    tr,va=read(root,'train'),read(root,'validation');assert all(r['label']>=0 for r in va)
    ti,tt=p.encoded(tok,tr);vi,vt=p.encoded(tok,va);opt=torch.optim.AdamW(model.parameters(),lr=2e-5,weight_decay=.01)
    history=[];best=(-1,-1e9);stale=0;start=time.perf_counter()
    for epoch in range(8):
        model.train();ids=list(range(len(tr)));random.Random(42+epoch).shuffle(ids);losses=[]
        for i in range(0,len(ids),8):
            assert time.perf_counter()-start<1800
            batch=ids[i:i+8];opt.zero_grad(set_to_none=True);logits=model(**p.batches(tok,ti,batch,'cuda')).logits;loss=loss_for(logits,[tr[j]['label'] for j in batch]);assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(loss.item())
        pred,_=p.predict(model,tok,vi,8,'cuda');met=p.metrics([r['label'] for r in va],pred)
        with torch.inference_mode():vloss=sum(loss_for(model(**p.batches(tok,vi,list(range(i,min(i+8,len(vi)))),'cuda')).logits,[r['label'] for r in va[i:i+8]]).item()*len(va[i:i+8]) for i in range(0,len(vi),8))/len(vi)
        row={'epoch':epoch+1,'train_loss':sum(losses)/len(losses),'validation_loss':vloss,'metrics':met};history.append(row);save('history',history)
        key=(met['macro4_f1'],-vloss)
        if key>best:
            best=key;stale=0;model.save_pretrained(root/'model');tok.save_pretrained(root/'model');save('selected',row)
        else:stale+=1
        print(json.dumps(row),flush=True)
        if stale>=2:break
    save('training',{'seconds':time.perf_counter()-start,'epochs':len(history),'truncated_train':tt,'truncated_validation':vt,'gpu_peak_bytes':torch.cuda.max_memory_allocated()})
    freeze={str(f):p.digest(f) for f in [*list((root/'model').glob('*')),Path(__file__),Path('local-benchmark/klue-refinement-data.cjs'),Path('docs/klue-refinement-plan.md')] if f.is_file()};save('frozen',freeze)
    del model;torch.cuda.empty_cache();model=p.AutoModelForSequenceClassification.from_pretrained(root/'model',local_files_only=True).to('cpu');p.predict(model,tok,vi[:8])
    # Old final is now observed regression. Model selection has already ended.
    with (root/'regression-started.json').open('x') as f:json.dump({'frozen_sha':p.digest(root/'frozen.json')},f)
    final=read(old,'final-inputs');gold=read(old,'final-labels');fi,ft=p.encoded(tok,final);pred,sec=p.predict(model,tok,fi)
    save('old128-predictions',[{'id':r['id'],'prediction':y} for r,y in zip(final,pred,strict=True)])
    reg=read(old,'regression');ri,rt=p.encoded(tok,reg);rp,rs=p.predict(model,tok,ri);save('old137-predictions',[{'id':r['id'],'prediction':y} for r,y in zip(reg,rp,strict=True)])
    result={'old128':{'metrics':p.metrics([g['label'] for g in gold],pred),'seconds':sec,'truncated':ft},'old137':{'metrics':p.metrics([None if r['is_ad'] is None else 0 if r['is_ad'] else 2 for r in reg],rp),'seconds':rs,'truncated':rt},'selected_epoch':read(root,'selected')['epoch']}
    for name,rows in [('old128',final),('old137',reg)]:
        prev=read(old,'final-predictions' if name=='old128' else 'regression-predictions');new=read(root,name+'-predictions');by={r['id']:r['prediction'] for r in prev};labels={g['id']:g['label']==0 for g in gold} if name=='old128' else {r['id']:r['is_ad'] for r in reg}
        result[name]['lost_tp']=[r['id'] for r in new if labels[r['id']] is True and by[r['id']]==0 and r['prediction']!=0];result[name]['gained_tp']=[r['id'] for r in new if labels[r['id']] is True and by[r['id']]!=0 and r['prediction']==0]
    assert all(p.digest(f)==h for f,h in freeze.items());save('results',result);print(json.dumps(result),flush=True)
if __name__=='__main__':main()
