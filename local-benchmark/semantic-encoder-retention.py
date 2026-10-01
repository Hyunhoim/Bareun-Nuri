"""One observed four-technique regression of already selected checkpoints."""
import importlib.util,gc
from pathlib import Path
s=importlib.util.spec_from_file_location('e',Path(__file__).with_name('semantic-encoder.py'))
e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
R=e.R/'retention';INPUT=Path('.runtime/klue-contest-v1/inputs.json');GOLD=Path('test-set-contest-v1/data/private/gold.json')

def main():
    assert (e.R/'regression/completed.json').exists();R.mkdir(exist_ok=False);e.torch.set_num_threads(8)
    chosen=e.read(e.R/'regression/selected-before-regression.json')
    chosen['Nuri1.0']='.runtime/klue-cycle3-v1/frozen8'
    training={e.v.canonical(r['input']) for r in e.v.readl(e.TRAIN)}
    original=e.read(INPUT);rows=[r for r in original if e.v.canonical(r['input']) not in training]
    gold={r['id']:r for r in e.read(GOLD)};keys=[{'id':r['id'],'label':int(gold[r['id']]['is_violation'])} for r in rows]
    e.save(R/'manifest.json',dict(files={str(f):e.p.digest(f) for f in [INPUT,GOLD,Path(__file__),Path('docs/semantic-encoder-retention-plan.md')]},
        rows=len(rows),excluded_train_overlap=len(original)-len(rows),selected=chosen,new_holdout=False,api_calls=0))
    predictions={};result={}
    for name,path in chosen.items():
        folder=Path(path);tok=e.p.AutoTokenizer.from_pretrained(folder/'model',local_files_only=True)
        model=e.p.AutoModelForSequenceClassification.from_pretrained(folder/'model',local_files_only=True).to('cpu')
        limit=512 if name=='Nuri1.0' else e.read(folder/'contract.json')['max_tokens']
        if 'context-v1' in str(folder):enc,lengths=e.module('ctx','semantic-encoder-context.py').encode(tok,rows,limit)
        else:enc,lengths=e.encode(tok,rows,limit)
        e.p.predict(model,tok,enc[:8],8,'cpu')
        if name=='Nuri1.0':
            yp,sec=e.p.predict(model,tok,enc,8,'cpu');pred={r['id']:None if y==3 else int(y==0) for r,y in zip(rows,yp,strict=True)}
            old={r['id']:r['prediction'] for r in e.read('.runtime/encoder-comparison-v1/A/regression-predictions.json')}
            assert all(old[r['id']]==y for r,y in zip(rows,yp,strict=True)),'Historical Nuri predictions changed'
        else:
            probs,sec=e.probabilities(model,tok,enc,'cpu');pred={r['id']:int(y>=.5) for r,y in zip(rows,probs,strict=True)}
        predictions[name]=pred;e.save(R/(name+'-predictions.json'),pred)
        result[name]=dict(overall=e.v.metrics(keys,pred),techniques={t:e.v.metrics([k for k in keys if gold[k['id']]['technique']==t],pred) for t in sorted({gold[k['id']]['technique'] for k in keys})},cpu_seconds=sec,lengths=lengths)
        e.save(R/'report.json',result);e.log({'retention':name,**result[name]['overall'],'seconds':sec});del model;gc.collect()
    base=predictions['Nuri1.0']
    for name,pred in predictions.items():
        result[name]['vs_nuri']=dict(lost_tp=sum(k['label']==1 and base[k['id']]==1 and pred[k['id']]!=1 for k in keys),
            recovered_fn=sum(k['label']==1 and base[k['id']]!=1 and pred[k['id']]==1 for k in keys),
            new_fp=sum(k['label']==0 and base[k['id']]!=1 and pred[k['id']]==1 for k in keys),
            resolved_fp=sum(k['label']==0 and base[k['id']]==1 and pred[k['id']]!=1 for k in keys))
    e.save(R/'report.json',result);e.save(R/'completed.json',{'models':4,'historical_nuri_predictions_match':True})

if __name__=='__main__':main()
