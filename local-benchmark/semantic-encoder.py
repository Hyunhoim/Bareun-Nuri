"""Bounded three-encoder experiment on the frozen real/synthetic corpus."""
import argparse, collections, contextlib, gc, importlib.util, io, json, random, statistics, time, traceback, unicodedata
from pathlib import Path

def module(name, file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj

p=module('pilot','klue-pilot.py');v=module('validation','semantic-validation.py');torch=p.torch
R=Path('.runtime/semantic-encoder-v1')
TRAIN=v.TRAIN
BASES={'klue':Path('.runtime/klue-base'),
       'kc':Path('.runtime/encoder-comparison-v1/kcelectra/pretrained'),
       'ko':R/'ko-pretrained'}

def save(file,data):
    file=Path(file);file.parent.mkdir(parents=True,exist_ok=True)
    tmp=file.with_suffix(file.suffix+'.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8');tmp.replace(file)

def read(file):return json.loads(Path(file).read_text(encoding='utf8'))
def log(data):print(json.dumps(data,ensure_ascii=False),flush=True)
def rows():
    train=v.readl(TRAIN);dev=v.readl(v.ROOT/'inputs.jsonl');keys=v.readl(v.ROOT/'labels.jsonl')
    assert len(train)==956 and len(dev)==90
    assert not {v.canonical(r['input']) for r in train}&{v.canonical(r['input']) for r in dev}
    assert all(type(r['label']) is int and r['label'] in (0,1) for r in train)
    return train,dev,keys

def weights(train):
    counts=collections.Counter(r['family_id'] for r in train)
    return [len(train)/(len(counts)*counts[r['family_id']]) for r in train]

def encode(tok,rs,limit):
    texts=['판정대상: '+unicodedata.normalize('NFC',r['input']['target'])+'\n문맥: '+unicodedata.normalize('NFC',r['input']['context']) for r in rs]
    full=tok(texts,truncation=False,return_token_type_ids=False)
    short=tok(texts,truncation=True,max_length=limit,return_token_type_ids=False)
    prefixes=tok([s.split('\n문맥: ',1)[0] for s in texts],truncation=False,return_token_type_ids=False)['input_ids']
    lengths=sorted(map(len,full['input_ids']))
    return [{k:val[i] for k,val in short.items()} for i in range(len(rs))],dict(
        n=len(rs),limit=limit,max_tokens=max(lengths),p50_tokens=statistics.median(lengths),p95_tokens=lengths[int(.95*(len(lengths)-1))],
        truncated=sum(n>limit for n in lengths),target_truncated=sum(len(x)>limit for x in prefixes),
        context_absent=sum(len(x)>=limit for x in prefixes),
        truncated_ids=[r['id'] for r,x in zip(rs,full['input_ids']) if len(x)>limit])

def probabilities(model,tok,enc,device):
    model.eval();out=[];start=time.perf_counter()
    with torch.inference_mode():
        for i in range(0,len(enc),8):
            logits=model(**p.batches(tok,enc,list(range(i,min(i+8,len(enc)))),device)).logits
            out.extend(logits.softmax(-1)[:,1].cpu().tolist())
    return out,time.perf_counter()-start

def assessment(keys,dev,probs):
    pred={r['id']:int(pr>=.5) for r,pr in zip(dev,probs,strict=True)}
    primary=v.metrics([k for k in keys if k['stratum']=='primary'],pred)
    surface=[k for k in keys if k['parent_id']]
    variant=v.metrics(surface,pred)
    agreement=sum(pred[k['id']]==pred[k['parent_id']] for k in surface)/len(surface)
    rank=(min(primary['f1'] or 0,variant['f1'] or 0),((primary['f1'] or 0)+(variant['f1'] or 0))/2,-primary['fp'])
    return dict(primary=primary,variant=variant,agreement=agreement,rank=rank,
                followup_gate=rank[0]>=.85 and primary['fp']<=2 and agreement>=.9)

def record(out,name,dev,probs):
    path=out/(name+'-predictions.jsonl')
    path.write_text(''.join(json.dumps({'id':r['id'],'prediction':int(pr>=.5)})+'\n' for r,pr in zip(dev,probs,strict=True)),encoding='utf8')
    with contextlib.redirect_stdout(io.StringIO()):v.score(path,out.name+'/'+name)
    save(out/(name+'-probabilities.json'),[dict(id=r['id'],p_ad=pr) for r,pr in zip(dev,probs,strict=True)])

def prepare():
    from huggingface_hub import HfApi,snapshot_download
    R.mkdir(exist_ok=False)
    train,dev,keys=rows();assert p.digest(TRAIN)=='46e86fc999dd351e33b7fd9fd4917218bdf4e8136b8379c096d41bd09125e685'
    revision=HfApi().model_info('monologg/koelectra-base-v3-discriminator').sha
    save(R/'ko-source.json',dict(repo='monologg/koelectra-base-v3-discriminator',revision=revision))
    log({'download':'koelectra','revision':revision})
    snapshot_download('monologg/koelectra-base-v3-discriminator',revision=revision,local_dir=BASES['ko'],
        allow_patterns=['config.json','model.safetensors','pytorch_model.bin','tokenizer*','vocab.txt','special_tokens_map.json'])
    manifest=dict(files={str(f):p.digest(f) for f in [TRAIN,v.ROOT/'inputs.jsonl',v.ROOT/'labels.jsonl',Path(__file__),Path('docs/semantic-encoder-plan.md')]},
                  train_rows=len(train),families=len({r['family_id'] for r in train}),torch=torch.__version__,models={},api_calls=0)
    for name,folder in BASES.items():
        tok=p.AutoTokenizer.from_pretrained(folder,local_files_only=True)
        manifest['models'][name]={'folder':str(folder),'hashes':{str(f):p.digest(f) for f in folder.glob('*') if f.is_file()},
            'lengths':{str(limit):{part:encode(tok,rs,limit)[1] for part,rs in [('train',train),('development',dev)]} for limit in (256,512)}}
    save(R/'manifest.json',manifest);log({'prepared':True,'train_rows':len(train),'families':manifest['families']})

def verify():
    m=read(R/'manifest.json')
    for file,h in m['files'].items():assert p.digest(file)==h, file
    for model in m['models'].values():
        for file,h in model['hashes'].items():assert p.digest(file)==h,file

def train_one(name,freeze,limit):
    import psutil
    out=R/f'{name}-f{freeze}-t{limit}'
    if (out/'completed.json').exists():return
    out.mkdir(exist_ok=False)
    assert torch.cuda.is_available();torch.set_num_threads(8);random.seed(42);torch.manual_seed(42);torch.cuda.manual_seed_all(42)
    torch.cuda.reset_peak_memory_stats();train,dev,keys=rows();w=weights(train)
    tok=p.AutoTokenizer.from_pretrained(BASES[name],local_files_only=True)
    ti,tt=encode(tok,train,limit);di,dt=encode(tok,dev,limit)
    model=p.AutoModelForSequenceClassification.from_pretrained(BASES[name],local_files_only=True,num_labels=2,
        id2label={0:'NORMAL',1:'AD'},label2id={'NORMAL':0,'AD':1}).to('cuda')
    backbone=model.base_model;assert len(backbone.encoder.layer)==12
    if freeze:
        for block in [backbone.embeddings,*backbone.encoder.layer[:freeze]]:
            for param in block.parameters():param.requires_grad=False
    else:model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False})
    params=[a for a in model.parameters() if a.requires_grad]
    opt=torch.optim.AdamW(params,lr=1e-5,weight_decay=.01)
    save(out/'contract.json',dict(model=name,freeze=freeze,max_tokens=limit,seed=42,epochs=3,lr=1e-5,dtype='FP32',micro=2,effective_batch=8,
        trainable=sum(a.numel() for a in params),total_parameters=sum(a.numel() for a in model.parameters()),train_lengths=tt,dev_lengths=dt,
        gpu=torch.cuda.get_device_name(0),family_balanced_loss=True,manifest_sha256=p.digest(R/'manifest.json')))
    best=None;history=[];start=time.perf_counter()
    for epoch in range(1,4):
        model.train();order=list(range(len(train)));random.Random(41+epoch).shuffle(order);total_loss=0
        for i in range(0,len(order),8):
            assert time.perf_counter()-start<2400,'40 minute run safety limit'
            batch=order[i:i+8];opt.zero_grad(set_to_none=True)
            for j in range(0,len(batch),2):
                ids=batch[j:j+2]
                logits=model(**p.batches(tok,ti,ids,'cuda')).logits
                losses=torch.nn.functional.cross_entropy(logits,torch.tensor([train[k]['label'] for k in ids],device='cuda'),reduction='none')
                loss=(losses*torch.tensor([w[k] for k in ids],device='cuda')).sum()/len(batch)
                assert torch.isfinite(loss);loss.backward();total_loss+=loss.item()*len(batch)
            torch.nn.utils.clip_grad_norm_(params,1);opt.step()
            if i%240==0:log({'run':out.name,'epoch':epoch,'seen':i+len(batch),'seconds':round(time.perf_counter()-start,1)})
        probs,_=probabilities(model,tok,di,'cuda');met=assessment(keys,dev,probs)
        row=dict(epoch=epoch,loss=total_loss/len(train),seconds=time.perf_counter()-start,**met)
        history.append(row);save(out/'history.json',history);record(out,'epoch-'+str(epoch),dev,probs)
        if best is None or tuple(met['rank'])>best:
            best=tuple(met['rank']);model.save_pretrained(out/'model');tok.save_pretrained(out/'model');save(out/'selection.json',row)
        log({'epoch_complete':out.name,**row})
    train_seconds=time.perf_counter()-start;peak=torch.cuda.max_memory_allocated()
    del model,opt,logits,loss,losses,params,backbone;gc.collect();torch.cuda.empty_cache()
    start=time.perf_counter();model=p.AutoModelForSequenceClassification.from_pretrained(out/'model',local_files_only=True).to('cpu');load=time.perf_counter()-start
    start=time.perf_counter();di,_=encode(tok,dev,limit);encoding=time.perf_counter()-start
    probabilities(model,tok,di[:8],'cpu');times=[]
    for _ in range(3):probs,sec=probabilities(model,tok,di,'cpu');times.append(sec)
    record(out,'selected-cpu',dev,probs)
    hard=assessment(keys,dev,probs)
    assert tuple(hard['rank'])==best,'CPU and selected GPU hard decisions differ'
    abst={r['id']:None if .2<pr<.8 else int(pr>=.5) for r,pr in zip(dev,probs,strict=True)}
    save(out/'cpu.json',dict(seconds=times,median_seconds=statistics.median(times),batch=8,threads=8,rows=len(dev),
        load_seconds=load,encoding_seconds=encoding,rss_bytes=psutil.Process().memory_info().rss,
        hard=hard,uncalibrated_abstention_diagnostic=v.metrics([k for k in keys if k['stratum']=='primary'],abst)))
    save(out/'completed.json',dict(train_seconds=train_seconds,gpu_peak_bytes=peak,model_sha256=p.digest(out/'model/model.safetensors'),production_changed=False))
    log({'completed':out.name,'cpu_median':statistics.median(times),'rank':best});del model;gc.collect()

def train_all():
    import subprocess,os
    verify()
    # Do not compete with another CUDA training process in this shared workspace.
    start=time.monotonic()
    while True:
        result=subprocess.run(['nvidia-smi','--query-compute-apps=pid,process_name','--format=csv,noheader,nounits'],capture_output=True,text=True,check=True)
        # Windows WDDM lists desktop graphics apps in this query too.
        active=[line for line in result.stdout.splitlines() if line.rsplit('\\',1)[-1].strip().lower() in ('python.exe','pythonw.exe') and int(line.split(',')[0])!=os.getpid()]
        if not active:break
        assert time.monotonic()-start<3600,'Another GPU job still active after one hour; no competing training started'
        log({'waiting_for_existing_gpu_processes':active});time.sleep(15)
    for freeze,limit in [(8,512),(8,256),(0,512)]:
        for name in BASES:train_one(name,freeze,limit)
    save(R/'completed.json',{'runs':9,'production_changed':False,'independent_final_evaluation':False})

def check():
    a=[{'family_id':'x'},{'family_id':'x'},{'family_id':'y'}];w=weights(a)
    assert sum(w)==3 and w[0]+w[1]==w[2]
    rs=[{'id':'p','input':{'target':'문구','context':'설명'}},{'id':'n','input':{'target':'다른 문구','context':'다른 설명'}}]
    keys=[{'id':r['id'],'label':i,'stratum':'primary','parent_id':None} for i,r in enumerate(rs)]
    keys += [{'id':'np','label':0,'stratum':'surface_consistency','parent_id':'p'},{'id':'nn','label':1,'stratum':'surface_consistency','parent_id':'n'}]
    assert assessment(keys,rs+[{'id':'np'},{'id':'nn'}],[.1,.9,.1,.9])['rank']==(1,1,0)
    v.selftest();rows();log({'check':'PASS family weighting, metrics, input separation and corpus overlap'})

if __name__=='__main__':
    cli=argparse.ArgumentParser();cli.add_argument('action',choices=['prepare','train','check']);a=cli.parse_args()
    try:{'prepare':prepare,'train':train_all,'check':check}[a.action]()
    except Exception:
        if R.exists():save(R/('error-'+str(time.time_ns())+'.json'),{'traceback':traceback.format_exc()})
        raise
