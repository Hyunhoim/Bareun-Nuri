"""Bounded mixed-intent training and frozen calibration; isolated from production."""
import importlib.util,json,random,time,math,gc,collections
from pathlib import Path
sp=importlib.util.spec_from_file_location('base',Path(__file__).with_name('filter10-train.py'));b=importlib.util.module_from_spec(sp);sp.loader.exec_module(b)
p=b.p;torch=p.torch;ROOT=Path('.runtime/filter11-v1');GRID=[0,.0001,.0005,.001,.002,.005,.01,.02,.05,.1,.2,.3,.4,.5]
def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def save(name,data):(ROOT/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
def safe_exclude(row,score,length,t):
    return (isinstance(row.get('input'),dict) and all(isinstance(row['input'].get(k),str) and row['input'][k].strip() for k in ['target','context']) and not row.get('collection_truncated',False) and 0<length<=512 and len(score)==2 and all(math.isfinite(v) and 0<=v<=1 for v in score) and abs(sum(score)-1)<1e-5 and score[1]<t)
def infer(model,tok,rows,device):
    inp,_=p.encoded(tok,rows);scores,secs=b.probs(model,tok,inp,device)
    lengths=[len(x) for x in tok(['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context'] for r in rows],truncation=False)['input_ids']]
    return [{'id':r['id'],'scores':s,'length':n} for r,s,n in zip(rows,scores,lengths)],secs
def stats(rows,scores,t):
    adapted=[[1,0] if safe_exclude(r,s['scores'],s['length'],t) else [0,1] for r,s in zip(rows,scores)]
    return b.stats(rows,adapted,.5)
def curve(rows,scores):return [{'t':t,**stats(rows,scores,t)} for t in GRID]
def choose(cur):return sorted([v for v in cur if v['must_pass_lost']==0],key=lambda v:(-v['normal_excluded'],v['t']))[0]
def main():
    ROOT.mkdir(exist_ok=False);torch.set_num_threads(8);assert torch.cuda.is_available()
    tr=b.load('train')+read('.runtime/filter-mixed-v1/train.json');va=b.load('validation')+read('.runtime/filter-mixed-v1/validation.json')
    assert not {r['group_id'] for r in tr}&{r['group_id'] for r in va}
    gold={r['id']:r for r in read('test-set-contest-v1/data/private/gold.json')}
    old2000=[{**r,'label':int(gold[r['id']]['is_violation']),'semantic_intent':'ad' if gold[r['id']]['is_violation'] else 'benign'} for r in read('.runtime/klue-input-audit-v2/corrected-inputs.json')]
    old221=[{**r,'label':0 if r['label'] in [1,2] else 1,'semantic_intent':'ad' if r['label']==0 else 'uncertain' if r['label']==3 else 'benign'} for r in read('.runtime/slm-three/inputs.json')]
    key=lambda r:json.dumps(r['input'],ensure_ascii=False,sort_keys=True)
    assert not {key(r) for r in tr}&{key(r) for r in va+old2000+old221}
    # Do not open new confirmation or sealed final before selection.
    sourcefiles=[Path(__file__),Path('docs/filter11-plan.md'),Path('.runtime/filter-mixed-v1/train.json'),Path('.runtime/filter-mixed-v1/validation.json'),Path('.runtime/filter-1.0-v1/model/model.safetensors')]
    hashes={str(x):p.digest(x) for x in sourcefiles};save('started',{'hashes':hashes,'train':len(tr),'development':len(va),'final_opened':False,'plan':'two candidates; no post-confirmation retuning'})
    tok=p.AutoTokenizer.from_pretrained('.runtime/klue-base',local_files_only=True);ti,tt=p.encoded(tok,tr);assert tt==0
    results={};cal=va+old221+old2000
    for name,source,lr,epochs in [('base','.runtime/filter-1.0-v1/model',0,0),('C','.runtime/filter-1.0-v1/model',5e-6,3),('F','.runtime/klue-base',2e-5,4)]:
        torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42)
        model=p.AutoModelForSequenceClassification.from_pretrained(source,local_files_only=True,num_labels=2,id2label={0:'EXCLUDE',1:'HCX'},label2id={'EXCLUDE':0,'HCX':1}).to('cuda')
        best=None;history=[];start=time.perf_counter();dest=ROOT/name;dest.mkdir()
        if epochs:
            opt=torch.optim.AdamW(model.parameters(),lr=lr,weight_decay=.01);groups=collections.Counter(r['group_id'] for r in tr)
            for epoch in range(1,epochs+1):
                model.train();ix=list(range(len(tr)));random.Random(41+epoch).shuffle(ix);losses=[]
                for i in range(0,len(ix),8):
                    assert time.perf_counter()-start<600;ids=ix[i:i+8];opt.zero_grad(set_to_none=True)
                    logits=model(**p.batches(tok,ti,ids,'cuda')).logits
                    loss=torch.nn.functional.cross_entropy(logits,torch.tensor([tr[j]['label'] for j in ids],device='cuda'),reduction='none')
                    w=torch.tensor([(2 if tr[j]['label'] else 1)/groups[tr[j]['group_id']] for j in ids],device='cuda');loss=(loss*w).sum()/w.sum();assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(loss.item())
                ss,_=infer(model,tok,va,'cuda');cur=curve(va,ss);sel=choose(cur);ce=sum(-math.log(max(s['scores'][r['label']],1e-30)) for r,s in zip(va,ss))/len(va);rank=(sel['normal_excluded'],-ce,-sel['t'],-epoch)
                history.append({'epoch':epoch,'train_loss':sum(losses)/len(losses),'ce':ce,'choice':sel,'curve':cur})
                if best is None or rank>best:best=rank;model.save_pretrained(dest/'model',safe_serialization=True);tok.save_pretrained(dest/'model');(dest/'selection.json').write_text(json.dumps(history[-1]),encoding='utf8')
                print(json.dumps({'candidate':name,'epoch':epoch,'choice':sel}),flush=True)
            del opt,model;torch.cuda.empty_cache();model=p.AutoModelForSequenceClassification.from_pretrained(dest/'model',local_files_only=True).to('cuda');checkpoint=str(dest/'model')
        else:checkpoint=source
        ss,secs=infer(model,tok,cal,'cuda');cur=curve(cal,ss);sel=choose(cur)
        save(name+'-calibration-scores',ss);save(name+'-history',history);results[name]={'checkpoint':checkpoint,'calibration':sel,'curve':cur,'seconds':time.perf_counter()-start,'model_hash':p.digest(Path(checkpoint)/'model.safetensors')}
        print(json.dumps({'candidate':name,'calibration':sel}),flush=True)
        del model;gc.collect();torch.cuda.empty_cache()
    chosen=max(results,key=lambda n:(results[n]['calibration']['normal_excluded'],-results[n]['calibration']['t'],n=='base'))
    save('selection',{'name':chosen,**results[chosen],'all_candidates':results});save('calibration-inputs',cal)
    assert all(p.digest(Path(x))==h for x,h in hashes.items());save('training-completed',{'selected':chosen,'confirmation_opened':False,'final_opened':False})
if __name__=='__main__':main()
