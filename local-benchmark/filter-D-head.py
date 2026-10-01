"""One frozen-encoder D trial with output preservation; no production import."""
import importlib.util,json,random,time,collections
from pathlib import Path
def module(name,file):
    sp=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m);return m
b=module('base','filter10-train.py');r=module('runner','filter11-run.py');f=module('frontier','filter-D-frontier.py')
p=b.p;torch=p.torch;ROOT=Path('.runtime/filter-D-head-v1')
def save(name,obj):(ROOT/(name+'.json')).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8')
def convert(rows):return [dict(x,label=0 if x.get('semantic_intent')=='ad' else 3 if x.get('semantic_intent')=='uncertain' else 2,collection_truncated=False) for x in rows]
def main():
    ROOT.mkdir(exist_ok=False);torch.set_num_threads(8);torch.manual_seed(42);random.seed(42);assert torch.cuda.is_available();torch.cuda.manual_seed_all(42)
    tr=b.load('train')+r.read('.runtime/filter-mixed-v1/train.json');va=b.load('validation')+r.read('.runtime/filter-mixed-v1/validation.json')
    assert not {x['group_id'] for x in tr}&{x['group_id'] for x in va}
    cal=r.read('.runtime/filter11-v1/calibration-inputs.json')
    keys=lambda rows:{json.dumps(x['input'],sort_keys=True,ensure_ascii=False) for x in rows}
    assert not keys(tr)&keys(cal)
    checkpoint=Path('.runtime/klue-audit-learning-v1/run-cpu/model');source_hash=p.digest(checkpoint/'model.safetensors')
    tok=p.AutoTokenizer.from_pretrained(checkpoint,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(checkpoint,local_files_only=True).to('cuda')
    for x in model.roberta.parameters():x.requires_grad=False
    inputs,_=p.encoded(tok,tr);teacher,_=b.probs(model,tok,inputs,'cuda');teacher=torch.tensor(teacher,device='cuda')
    counts=collections.Counter(x['group_id'] for x in tr);opt=torch.optim.AdamW(model.classifier.parameters(),lr=1e-5,weight_decay=.01)
    start=time.perf_counter();history=[]
    save('started',{'source_hash':source_hash,'train':len(tr),'frozen_encoder':True,'epochs':3,'plan':'docs/filter-D-head-plan.md'})
    for epoch in range(1,4):
        model.eval();model.classifier.train();ix=list(range(len(tr)));random.Random(41+epoch).shuffle(ix);losses=[]
        for i in range(0,len(ix),8):
            assert time.perf_counter()-start<900;ids=ix[i:i+8];opt.zero_grad(set_to_none=True)
            logits=model(**p.batches(tok,inputs,ids,'cuda')).logits;logp=logits.log_softmax(-1)
            pass_log=torch.logsumexp(logp[:,[0,1,3]],dim=-1)
            y=torch.tensor([tr[j]['label'] for j in ids],device='cuda',dtype=torch.bool)
            ce=-torch.where(y,pass_log,logp[:,2]);kl=torch.nn.functional.kl_div(logp,teacher[ids],reduction='none').sum(-1)
            w=torch.tensor([(2 if tr[j]['label'] else 1)/counts[tr[j]['group_id']] for j in ids],device='cuda')
            loss=((ce+kl)*w).sum()/w.sum();assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.classifier.parameters(),1);opt.step();losses.append(loss.item())
        history.append({'epoch':epoch,'loss':sum(losses)/len(losses)});print(json.dumps(history[-1]),flush=True)
    model.save_pretrained(ROOT/'model',safe_serialization=True);tok.save_pretrained(ROOT/'model');save('history',history)
    ss,secs=r.infer(model,tok,cal,'cuda');cr=convert(cal)
    eligible=[s['scores'][0] for x,s in zip(cr,ss) if x['label'] in [0,3] and f.eligible(x,s) and s['scores'][2]>=.9]
    assert eligible;gate={'mode':'ad','threshold':.8*min(eligible)}
    save('calibration-scores',ss);save('frozen',{'gate':gate,'calibration':f.stats(cr,ss,gate),'model_sha256':p.digest(ROOT/'model/model.safetensors'),'training_seconds':time.perf_counter()-start})
    rows=r.read('.runtime/nuri10-filter-collected-v1/inputs.json');flags={}
    for source in r.read('.runtime/nuri10-filter-collected-v1/sources.json'):
        for c in r.read(source['path'])['candidates']:flags[(c['url'],c['selector'])]=bool(c.get('context_evidence',{}).get('truncated',False))
    for row in rows:row['collection_truncated']=flags[(row['url'],row['selector'])]
    ss,secs=r.infer(model,tok,rows,'cuda');save('collected-scores',ss);results={'gpu_inference_seconds':secs,'panels':{}}
    for panel in ['real','replica']:
        ix=[i for i,x in enumerate(rows) if x['panel']==panel];results['panels'][panel]=f.stats([rows[i] for i in ix],[ss[i] for i in ix],gate)
    save('excluded',[dict(x,scores=s['scores']) for x,s in zip(rows,ss) if f.removed(x,s,gate)])
    newer=r.read('.runtime/filter-mixed-v1/confirm.json');ns,_=r.infer(model,tok,newer,'cuda');save('confirmation-scores',ns);results['observed32']=f.stats(convert(newer),ns,gate)
    assert p.digest(checkpoint/'model.safetensors')==source_hash
    results['production_adoption']=False;save('result',results);print(json.dumps(results),flush=True)
if __name__=='__main__':main()
