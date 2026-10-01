"""Paired format augmentation diagnostic; preserves targets, labels and final seal."""
import importlib.util, json, random, time
from pathlib import Path

s = importlib.util.spec_from_file_location('f', Path(__file__).with_name('nuri12-freeze.py'))
f = importlib.util.module_from_spec(s); s.loader.exec_module(f)
n, p, torch = f.n, f.p, f.torch
R = Path('.runtime/nuri-1.2-format-v1')

def save(name, value):
    (R/(name+'.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')

def encode(tok, rows, headers):
    texts = [a+r['input']['target']+'\n'+b+r['input']['context'] for r,(a,b) in zip(rows,headers,strict=True)]
    full = tok(texts, truncation=False, return_token_type_ids=False)
    short = tok(texts, truncation=True, max_length=512, return_token_type_ids=False)
    return [{k:v[i] for k,v in short.items()} for i in range(len(rows))], sum(len(x)>512 for x in full['input_ids'])

def main():
    R.mkdir(exist_ok=False); torch.set_num_threads(8); assert torch.cuda.is_available()
    start = time.perf_counter()
    tr = n.read('.runtime/nuri-1.2-label-contract-v1/train.json')
    panels = {'new40':n.norm(n.read('local-benchmark/a-ft-new-data.json')['development']),
              'broad120':n.norm(n.read('.runtime/klue-broad-development-v1/rows.json')),
              'ownership44':n.norm(n.read('.runtime/klue-retention-v1/development.json'))}
    real = n.read('.runtime/nuri-1.2-human-review-v1/review-items.json')
    answers = n.read('.runtime/nuri-1.2-human-review-v1/human-review-chat-answers.json')['answers']
    assert [r['id'] for r in real] == [r['id'] for r in answers]
    assert all(r['decision']==2 and r['reviewed'] for r in answers)
    key=lambda r:json.dumps(r['input'],ensure_ascii=False,sort_keys=True)
    assert not {key(r) for r in tr} & {key(r) for rows in [*panels.values(),real] for r in rows}
    files=[Path(__file__),Path('docs/nuri12-format-plan.md'),Path('.runtime/nuri-1.2-label-contract-v1/train.json'),n.BASE/'model.safetensors']
    hashes={str(x):p.digest(x) for x in files}; save('frozen',hashes)
    tok=p.AutoTokenizer.from_pretrained(n.BASE,local_files_only=True)
    original=('판정대상: ','문맥: '); unseen=('검사할 문구: ','주변 내용: ')
    choices=[original,('검사문구: ','관련내용: '),('대상텍스트: ','참고문맥: ')]
    rng=random.Random(904); augmentation=[choices[rng.randrange(3)] for _ in tr]
    ti,tt=encode(tok,tr,[original]*len(tr)); ai,at=encode(tok,tr,augmentation)
    assert tt==at==0 and ti==p.encoded(tok,tr)[0]
    save('augmentation',{'headers':choices,'assignment':[choices.index(h) for h in augmentation],'row_ids':[r['id'] for r in tr],'unchanged_targets_context_labels':True})
    enc={k:encode(tok,rs,[original]*len(rs))[0] for k,rs in panels.items()}
    alt={k:encode(tok,rs,[unseen]*len(rs))[0] for k,rs in panels.items()}
    ri,rt=encode(tok,real,[original]*len(real)); results={}
    def evaluate(model):
        out={}
        for k,rs in panels.items():
            ps,sec=p.predict(model,tok,enc[k],8,'cuda'); ap,asec=p.predict(model,tok,alt[k],8,'cuda')
            out[k]={'metrics':p.metrics([r['label'] for r in rs],ps),'seconds':sec,
                    'predictions':[{'id':r['id'],'prediction':v} for r,v in zip(rs,ps)],
                    'unseen_header_predictions':ap,'header_changes':sum(a!=b for a,b in zip(ps,ap)),
                    'unseen_header_metrics':p.metrics([r['label'] for r in rs],ap)}
        rp,sec=p.predict(model,tok,ri,8,'cuda')
        return {'panels':out,'summary':f.stats(out),'header_changes':sum(v['header_changes'] for v in out.values()),
                'real17':{'false_positives':rp.count(0),'predictions':rp,'seconds':sec,'truncated':rt,'binary_only':True}}
    for arm,inputs in [('control',ti),('format_aug',ai)]:
        torch.manual_seed(42);torch.cuda.manual_seed_all(42);random.seed(42)
        model=p.AutoModelForSequenceClassification.from_pretrained(n.BASE,local_files_only=True,num_labels=4).to('cuda')
        initial=f.tensor_hash(model,{k for k,_ in model.named_parameters()})
        assert initial==n.read(f.R/'fresh_freeze8-contract.json')['initial_hash']
        for module in [model.roberta.embeddings,*model.roberta.encoder.layer[:8]]:
            for v in module.parameters():v.requires_grad=False
        fixed={k for k,v in model.named_parameters() if not v.requires_grad}; before=f.tensor_hash(model,fixed)
        opt=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=2e-5,weight_decay=.01)
        order=list(range(len(tr)));random.Random(43).shuffle(order);model.train();begin=time.perf_counter()
        for step in range(250):
            assert time.perf_counter()-start<600
            ix=order[step*8:step*8+8];opt.zero_grad(set_to_none=True)
            out=model(**p.batches(tok,inputs,ix,'cuda'),labels=torch.tensor([tr[j]['label'] for j in ix],device='cuda'))
            assert torch.isfinite(out.loss);out.loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);opt.step()
        train_sec=time.perf_counter()-begin; assert before==f.tensor_hash(model,fixed)
        result=evaluate(model);result['training_seconds']=train_sec
        model.save_pretrained(R/arm);tok.save_pretrained(R/arm);del model,opt;torch.cuda.empty_cache()
        model=p.AutoModelForSequenceClassification.from_pretrained(R/arm,local_files_only=True).to('cuda');again=evaluate(model)
        assert all(again['panels'][k]['predictions']==result['panels'][k]['predictions'] for k in panels)
        results[arm]=result;save('results',results);print(json.dumps({'arm':arm,**result['summary'],'changes':result['header_changes'],'real_fp':result['real17']['false_positives']}),flush=True)
        del model;torch.cuda.empty_cache()
    for arm,path in [('old_freeze8',f.R/'fresh_freeze8/model'),('A',Path('.runtime/klue-cycle3-v1/frozen8/model'))]:
        model=p.AutoModelForSequenceClassification.from_pretrained(path,local_files_only=True).to('cuda');results[arm]=evaluate(model);del model;torch.cuda.empty_cache()
    save('results',results)
    old=n.read('.runtime/nuri-1.2-label-contract-v1/development.json')
    same=all(old[k]['predictions']==results['control']['panels'][k]['predictions'] for k in panels)
    b,c=results['control'],results['format_aug'];bs,cs=b['summary'],c['summary']
    eligible=cs['ad_f1']>=bs['ad_f1']+.02 and cs['tp']>=bs['tp'] and cs['uncertain_as_ad']<=bs['uncertain_as_ad'] and c['header_changes']<b['header_changes'] and c['real17']['false_positives']<=b['real17']['false_positives']
    for path,h in hashes.items():assert p.digest(path)==h
    save('completed',{'seconds':time.perf_counter()-start,'control_reproduced':same,'followup_eligible':eligible,'final_opened':False,'production_changed':False,'frozen_unchanged':True,'reload_verified':True})

if __name__=='__main__':main()
