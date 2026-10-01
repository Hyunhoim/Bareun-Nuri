"""Controlled character-model diagnostic. Never imported by the production agent."""
import argparse, gc, importlib.util, json, random, re, statistics, time, unicodedata, urllib.request
from pathlib import Path
s=importlib.util.spec_from_file_location('t',Path(__file__).with_name('technique-specialist-train.py'))
t=importlib.util.module_from_spec(s);s.loader.exec_module(t);p=t.p;torch=p.torch
ROOT=Path('.runtime/canine-technique-v1'); DATA=t.DATA
LABELS=['substitution','literal','uncertain']
ARMS=['existing','klue_uts','canine_plain','canine_uts']
def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def save(path,x):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
def prepare():
    from huggingface_hub import HfApi,snapshot_download
    ROOT.mkdir(exist_ok=True)
    assert not (ROOT/'sources.json').exists(), 'Sources already pinned'
    url='https://www.unicode.org/Public/security/16.0.0/confusables.txt'
    with urllib.request.urlopen(url,timeout=60) as r: raw=r.read()
    (ROOT/'confusables.txt').write_bytes(raw)
    assert b'# Version: 16.0.0' in raw
    rev=HfApi().model_info('google/canine-s').sha
    save(ROOT/'sources.json',{'model':'google/canine-s','revision':rev,'unicode_url':url,'unicode_sha256':p.digest(ROOT/'confusables.txt'),'transformers':'4.57.3'})
    snapshot_download('google/canine-s',revision=rev,local_dir=ROOT/'pretrained',allow_patterns=['config.json','model.safetensors','pytorch_model.bin','tokenizer_config.json','special_tokens_map.json'],max_workers=2)
    print('Prepared sources',flush=True)
def mapping():
    assert p.digest(ROOT/'confusables.txt')==read(ROOT/'sources.json')['unicode_sha256']
    result={}
    for line in (ROOT/'confusables.txt').read_text(encoding='utf-8-sig').splitlines():
        clean=line.split('#')[0].strip()
        if not clean:continue
        a,b,*_=clean.split(';');a=''.join(chr(int(x,16)) for x in a.split());b=''.join(chr(int(x,16)) for x in b.split())
        assert len(a)==1 and a not in result;result[a]=b
    return result
def evidence(token,m):
    # Auxiliary NFD skeleton, not a restoration or a complete UTS39 security validator.
    skeleton=unicodedata.normalize('NFD',''.join(m.get(c,c) for c in unicodedata.normalize('NFD',token)))
    pairs=[f'{i}:U+{ord(c):04X}->{" ".join(f"U+{ord(z):04X}" for z in m[c])}' for i,c in enumerate(token) if c in m]
    return '\nUnicode 문자 대응(위장 확정 아님): '+json.dumps({'원문':token,'skeleton':skeleton,'대응':pairs},ensure_ascii=False,separators=(',',':'))
def adapted(rows,arm,m):
    out=[]
    for r in rows:
        v=dict(r['input'])
        if arm.endswith('_uts'):v['context']+=evidence(r['token'],m)
        out.append({'input':v})
    return out
def encode(tok,rows,arm,m):
    texts=['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context'] for r in adapted(rows,arm,m)]
    full=tok(texts,truncation=False,return_token_type_ids=False)
    # Same conservative 512 budget as historical baseline; chars and subwords differ.
    lens=[len(x) for x in full['input_ids']]
    return [{k:v[i] for k,v in full.items()} for i in range(len(rows))],lens
def model_path(arm):return t.OUT/'model' if arm=='existing' else ROOT/arm/'model'
def train(arm):
    assert arm in ARMS[1:];out=ROOT/arm;out.mkdir(exist_ok=False)
    torch.set_num_threads(8);torch.manual_seed(42);random.seed(42);assert torch.cuda.is_available();torch.cuda.manual_seed_all(42)
    m=mapping();tr,ty=t.load('train');dev,dy=t.load('dev')
    assert not {r['group_id'] for r in tr}&{r['group_id'] for r in dev}
    base=ROOT/'pretrained' if arm.startswith('canine') else Path('.runtime/klue-base')
    tok=p.AutoTokenizer.from_pretrained(base,local_files_only=True)
    model=p.AutoModelForSequenceClassification.from_pretrained(base,local_files_only=True,num_labels=3,id2label=dict(enumerate(LABELS)),label2id={v:i for i,v in enumerate(LABELS)}).to('cuda')
    ti,tl=encode(tok,tr,arm,m);di,dl=encode(tok,dev,arm,m);assert max(tl+dl)<=512,(max(tl),max(dl))
    save(out/'started.json',{'params':sum(x.numel() for x in model.parameters()),'train_rows':len(tr),'dev_rows':len(dev),'max_length':max(tl+dl),'source':read(ROOT/'sources.json'),'hashes':{f:p.digest(DATA/f) for f in ['train-inputs.json','train-gold.json','dev-inputs.json','dev-gold.json']}})
    opt=torch.optim.AdamW(model.parameters(),lr=2e-5,weight_decay=.01);start=time.perf_counter();history=[];best=None
    for epoch in range(1,4):
        model.train();ix=list(range(len(tr)));random.Random(41+epoch).shuffle(ix);losses=[]
        for i in range(0,len(ix),8):
            assert time.perf_counter()-start<900,'training safety limit'
            ids=ix[i:i+8];opt.zero_grad(set_to_none=True)
            logits=model(**p.batches(tok,ti,ids,'cuda')).logits
            loss=torch.nn.functional.cross_entropy(logits,torch.tensor([ty[j] for j in ids],device='cuda'))
            assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step();losses.append(loss.item())
        pred,_=p.predict(model,tok,di,device='cuda');met=t.metric(dy,pred);rank=(met['macro_f1'],-met['uncertain_false'],-epoch)
        rec={'epoch':epoch,'loss':statistics.mean(losses),'development':met,'elapsed_sec':time.perf_counter()-start}
        history.append(rec);save(out/'history.json',history);print(arm,json.dumps(rec),flush=True)
        if best is None or rank>best:
            best=rank;model.save_pretrained(out/'model',safe_serialization=True);tok.save_pretrained(out/'model');save(out/'selection.json',rec)
    save(out/'frozen.json',{'model_sha256':p.digest(out/'model/model.safetensors'),'production_adoption':False})
def panels():
    out={split:read(DATA/(split+'-inputs.json')) for split in ['dev','final']}
    for split in ['dev','evaluation']:
        rows=read(Path('.runtime/digit-generalization-data-v1')/(split+'-inputs.json'));adapt=[]
        for r in rows:
            text=r['target_text'];j=text.index(r['token']);adapt.append({'id':r['node_id'],'token':r['token'],'input':{'target':text[:j]+'[표기]'+r['token']+'[/표기]'+text[j+len(r['token']):],'context':''}})
        out['historical-'+split]=adapt
    out['collected']=read('.runtime/technique-collected-v1/inputs.json');return out
def evaluate():
    out=ROOT/'evaluation';out.mkdir(exist_ok=False);torch.set_num_threads(8);m=mapping();data=panels()
    save(out/'manifest.json',{'sources':read(ROOT/'sources.json'),'data_hashes':{str(f):p.digest(f) for f in [*DATA.glob('*-inputs.json'),Path('.runtime/technique-collected-v1/inputs.json')]},'scope':'observed regression; no new holdout','api_calls':0})
    for arm in ARMS:
        path=model_path(arm);frozen=t.OUT/'frozen.json' if arm=='existing' else ROOT/arm/'frozen.json'
        assert p.digest(path/'model.safetensors')==read(frozen)['model_sha256']
        start=time.perf_counter();tok=p.AutoTokenizer.from_pretrained(path,local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cpu');load=time.perf_counter()-start
        allres={}
        warm,_=encode(tok,data['dev'][:8],arm,m);p.predict(model,tok,warm)
        for name,rows in data.items():
            code={r['id']:r['label'] for r in read(Path('.runtime/technique-specialist-hcx-v1')/(name+'-code.json'))} if name in ['dev','final'] else {}
            selected=[r for r in rows if code.get(r['id'])!=0];times=[];orders=[];predmap=None
            for repeat in range(3):
                ordered=selected if repeat!=1 else list(reversed(selected));start=time.perf_counter();encoded,lens=encode(tok,ordered,arm,m)
                valid=[i for i,r in enumerate(ordered) if lens[i]<=512 and not r.get('collection_truncated',False)]
                pred,secs=p.predict(model,tok,[encoded[i] for i in valid]);wall=time.perf_counter()-start
                found={r['id']:2 for r in ordered};found.update({ordered[i]['id']:v for i,v in zip(valid,pred,strict=True)});merged={**code,**found}
                if predmap is None:predmap=merged
                else:assert merged==predmap,'Order-dependent classifier decisions'
                times.append({'inference_seconds':secs,'tokenization_inference_seconds':wall});orders.append({'rows':len(ordered),'processed':len(valid),'protected':len(ordered)-len(valid),'max_length':max(lens)})
            allres[name]={'rows':[{'id':r['id'],'label':predmap[r['id']]} for r in rows],'timings':times,'length':orders[0],'median_inference':statistics.median(x['inference_seconds'] for x in times),'median_wall':statistics.median(x['tokenization_inference_seconds'] for x in times)}
        save(out/(arm+'.json'),{'load_seconds':load,'panels':allres});print('evaluated',arm,flush=True);del model;gc.collect()
    save(out/'completed.json',{'completed':True,'models_frozen_before_evaluation':True,'production_adoption':False})
def binary(true,found):
    tp=len(true&found);fp=len(found-true);fn=len(true-found)
    return {'tp':tp,'fp':fp,'fn':fn,'f1':2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0}
def gated_timing():
    assert read(ROOT/'evaluation/completed.json')['completed'];torch.set_num_threads(8);m=mapping();result={}
    for arm in ARMS:
        tok=p.AutoTokenizer.from_pretrained(model_path(arm),local_files_only=True)
        model=p.AutoModelForSequenceClassification.from_pretrained(model_path(arm),local_files_only=True).to('cpu');result[arm]={}
        for split in ['dev','final']:
            intent={r['node_id']:r['is_violation'] for r in read(Path('.runtime/technique-specialist-intent-v1')/(split+'-decisions.json'))}
            code={r['id']:r['label'] for r in read(Path('.runtime/technique-specialist-hcx-v1')/(split+'-code.json'))}
            rows=[r for r in read(DATA/(split+'-inputs.json')) if intent[r['id']] and code[r['id']]!=0]
            expected={r['id']:r['label'] for r in read(ROOT/'evaluation'/(arm+'.json'))['panels'][split]['rows']}
            warm,lens=encode(tok,rows,arm,m);assert max(lens)<=512;p.predict(model,tok,warm[:8]);times=[]
            for repeat in range(3):
                ordered=rows if repeat!=1 else list(reversed(rows));start=time.perf_counter();inp,_=encode(tok,ordered,arm,m);pred,sec=p.predict(model,tok,inp)
                times.append({'inference_seconds':sec,'wall_seconds':time.perf_counter()-start})
                assert all(v==expected[r['id']] for r,v in zip(ordered,pred,strict=True))
            result[arm][split]={'rows':len(rows),'runs':times,'median_wall_seconds':statistics.median(x['wall_seconds'] for x in times)}
        del model;gc.collect()
    save(ROOT/'gated-timing.json',result);print(json.dumps(result))
def score():
    out=ROOT/'evaluation';assert read(out/'completed.json')['completed'];result={};data=panels()
    for arm in ARMS:
        result[arm]={};records=read(out/(arm+'.json'))['panels']
        for name,rows in data.items():
            preds={r['id']:r['label'] for r in records[name]['rows']}
            rec={'median_cpu_seconds':records[name]['median_inference'],'median_wall_seconds':records[name]['median_wall'],'length':records[name]['length']}
            if name in ['dev','final']:
                gold=read(DATA/(name+'-gold.json'));assert [r['id'] for r in gold]==[r['id'] for r in rows]
                rec['technique_all']=t.metric([r['label'] for r in gold],[preds[r['id']] for r in rows])
                intent={r['node_id']:r['is_violation'] for r in read(Path('.runtime/technique-specialist-intent-v1')/(name+'-decisions.json'))}
                gated=[r for r in gold if intent[r['id']]]
                rec['hcx_positive_technique']=t.metric([r['label'] for r in gated],[preds[r['id']] for r in gated]);rec['hcx_positive_count']=len(gated)
                true={r['id'] for r in gold if r['is_ad'] and r['label']==0};found={r['id'] for r in rows if intent[r['id']] and preds[r['id']]==0}
                rec['hcx_combined']=binary(true,found)
                base={r['id']:r['label'] for r in read(out/'existing.json')['panels'][name]['rows']};base_tp={x for x in true if intent[x] and base[x]==0}
                rec['base_tp_lost']=len(base_tp-found);rec['base_tp_recovered']=len((found&true)-base_tp)
            elif name.startswith('historical'):
                gold={r['node_id']:r for r in read(Path('.runtime/digit-generalization-data-v1')/(name.removeprefix('historical-')+'-gold.json'))}
                rec['technique_all']=t.metric([LABELS.index(gold[r['id']]['classification']) for r in rows],[preds[r['id']] for r in rows])
                base={r['id']:r['label'] for r in read(out/'existing.json')['panels'][name]['rows']}
                rec['base_tp_lost']=sum(gold[r['id']]['classification']=='substitution' and base[r['id']]==0 and preds[r['id']]!=0 for r in rows)
            else:
                known=[r for r in rows if r.get('known_ad_label')==0 and 'HOMOGLYPH' in r.get('known_techniques',[])]
                rec['known_injected']={'count':len(known),'confirmed':sum(preds[r['id']]==0 for r in known),'rows':[{'id':r['id'],'token':r['token'],'prediction':preds[r['id']]} for r in known]}
                rec['unlabelled_not_scored']=True
            result[arm][name]=rec
    save(ROOT/'report.json',result)
    combined={}
    for arm in ARMS:
        totals={k:sum(result[arm][s]['hcx_combined'][k] for s in ['dev','final']) for k in ['tp','fp','fn']}
        totals['f1']=2*totals['tp']/(2*totals['tp']+totals['fp']+totals['fn']);combined[arm]=totals
    gates={}
    for arm in ARMS[1:]:
        gates[arm]={'combined_f1_gain_2pp':combined[arm]['f1']>=combined['existing']['f1']+.02,
          'gated_tp_preserved':all(result[arm][s]['base_tp_lost']==0 for s in ['dev','final']),
          'normal_uncertain_no_increase':all(result[arm][s]['technique_all'][k]<=result['existing'][s]['technique_all'][k] for s in ['dev','final','historical-dev','historical-evaluation'] for k in ['normal_false','uncertain_false']),
          'cpu_under_2x':all(result[arm][s]['median_wall_seconds']<=2*result['existing'][s]['median_wall_seconds'] for s in ['dev','final'])}
        gates[arm]['eligible_for_independent_confirmation']=all(gates[arm].values())
    save(ROOT/'decision.json',{'combined':combined,'gates':gates,'production_adoption':False,'new_holdout':False});print(json.dumps({'combined':combined,'gates':gates}),flush=True)
def selfcheck():
    m=mapping();assert m['0']=='O';a=evidence('B0nus',m);assert 'U+0030' in a and 'U+004F' in a
    r={'token':'B0nus','input':{'target':'[표기]B0nus[/표기]','context':'문의'},'label':0}
    r2={**r,'label':1,'id':'other'};assert adapted([r],'canine_uts',m)==adapted([r2],'canine_uts',m)
    assert adapted([r],'canine_uts',m)[0]['input']['target']==r['input']['target']
    print('mapping / no-label-leak / raw preservation checks passed')
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('action',choices=['prepare','train','evaluate','score','check','gated-timing']);ap.add_argument('--arm',choices=ARMS[1:]);a=ap.parse_args()
    if a.action=='train':train(a.arm)
    else:{'prepare':prepare,'evaluate':evaluate,'score':score,'check':selfcheck,'gated-timing':gated_timing}[a.action]()
