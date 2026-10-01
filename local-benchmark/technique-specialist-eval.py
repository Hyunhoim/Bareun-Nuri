"""Frozen CPU predictions; scoring opens final gold only after all arms finish."""
import importlib.util,json,time
from pathlib import Path
s=importlib.util.spec_from_file_location('t',Path(__file__).with_name('technique-specialist-train.py'));t=importlib.util.module_from_spec(s);s.loader.exec_module(t)
p=t.p;DATA=t.DATA;ROOT=Path('.runtime/technique-specialist-eval-v1');HCX=Path('.runtime/technique-specialist-hcx-v1')
def save(name,x):(ROOT/(name+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def main():
    ROOT.mkdir(exist_ok=False);assert p.digest(t.OUT/'model/model.safetensors')==t.read(t.OUT/'frozen.json')['model_sha256']
    p.torch.set_num_threads(8);start=time.perf_counter();tok=p.AutoTokenizer.from_pretrained(t.OUT/'model',local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(t.OUT/'model',local_files_only=True).to('cpu');load=time.perf_counter()-start
    result={}
    for split in ['dev','final']:
        rows=t.read(DATA/(split+'-inputs.json'));code={x['id']:x['label'] for x in t.read(HCX/(split+'-code.json'))}
        for reverse in [False,True]:
            eligible=[x for x in rows if code[x['id']]!=0]
            if reverse:eligible.reverse()
            start=time.perf_counter();inp,truncated=p.encoded(tok,eligible);assert truncated==0;pred,secs=p.predict(model,tok,inp,device='cpu');wall=time.perf_counter()-start
            name=split+('-reverse' if reverse else '-forward');save(name+'-predictions',[{'id':x['id'],'label':v} for x,v in zip(eligible,pred)]);result[name]={'cpu_inference_seconds':secs,'tokenization_and_inference_seconds':wall,'rows':len(eligible),'truncated':truncated}
    save('completion',{'completed':True,'load_seconds':load,'conditions':result,'final_gold_opened':False});print(json.dumps(result))
def score():
    assert t.read(ROOT/'completion.json')['completed'] and t.read(HCX/'completion.json')['completed']
    assert not (ROOT/'final-evaluation-started.json').exists();save('final-evaluation-started',{'one_campaign':True,'time':time.time(),'orders':['forward','reverse']})
    result={}
    for split in ['dev','final']:
        rows=t.read(DATA/(split+'-inputs.json'));gold=t.read(DATA/(split+'-gold.json'));assert [x['id'] for x in rows]==[x['id'] for x in gold];ys=[x['label'] for x in gold];code={x['id']:x['label'] for x in t.read(HCX/(split+'-code.json'))}
        result[split]={}
        for method in ['code','hcx','classifier']:
            for order in (['forward'] if method=='code' else ['forward','reverse']):
                pred=dict(code)
                if method=='hcx':pred.update({x['node_id']:['substitution','literal','uncertain'].index(x['classification']) for x in t.read(HCX/(split+'-'+order)/'decisions.json')})
                if method=='classifier':pred.update({x['id']:x['label'] for x in t.read(ROOT/(split+'-'+order+'-predictions.json'))})
                values=[pred[x['id']] for x in rows];m=t.metric(ys,values)
                true={x['id'] for x in gold if x['is_ad'] and x['label']==0};found={x['id'] for x in gold if x['is_ad'] and pred[x['id']]==0};tp=len(true&found);fp=len(found-true);fn=len(true-found)
                m['oracle_intent_submission']={'tp':tp,'fp':fp,'fn':fn,'f1':2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0,'scope':'gold intent fixed, not actual HCX intent'}
                result[split][method+'-'+order]=m
    save('report',result);print(json.dumps(result))
if __name__=='__main__':
    import sys
    score() if '--score' in sys.argv else main()
