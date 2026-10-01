"""Separate development inputs, provisional labels, overlap audit and scoring."""
import argparse, collections, datetime, difflib, hashlib, json, random, unicodedata
from pathlib import Path

ROOT=Path('local-benchmark/semantic-validation-v1')
TRAIN=Path('local-benchmark/synthetic-extension-v2/combined-train-candidates.jsonl')

def digest(b):return hashlib.sha256(b if isinstance(b,bytes) else b.encode('utf-8')).hexdigest()
def readl(p):return [json.loads(l) for l in p.read_text(encoding='utf-8').splitlines() if l.strip()]
def writel(name,rows):(ROOT/name).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')
def save(name,x):(ROOT/name).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf-8')
def norm(s):
    s=unicodedata.normalize('NFKC',s).casefold().translate(str.maketrans({'а':'a','е':'e','о':'o','с':'c','р':'p','α':'a','β':'b','ε':'e'}))
    return ''.join(c for c in s if c.isalnum())
def joined(x):return x['target']+'\n'+x['context']
def canonical(x):return norm(x['target'])+'|'+norm(x['context'])
def grams(s):return {s[i:i+5] for i in range(max(0,len(s)-4))}

def perturb(s,kind):
    words=s.split(' ')
    candidates=[i for i,w in enumerate(words) if sum('가'<=c<='힣' for c in w)>=2]
    for i in candidates[1::4]:
        w=words[i]
        if kind=='jamo':words[i]=unicodedata.normalize('NFD',w)
        else:words[i]='\u200b'.join(w)
    return ' '.join(words)

def build():
    if (ROOT/'usage.json').exists():
        assert not json.loads((ROOT/'usage.json').read_text(encoding='utf-8'))['runs'],'Evaluated version must be preserved; create a new version explicitly'
    before=digest(TRAIN.read_bytes());training=readl(TRAIN)
    raw=json.loads((ROOT/'cases.json').read_text(encoding='utf-8'))['cases']
    assert len(raw)==50
    assert collections.Counter((c[0],c[2]) for c in raw)==collections.Counter({(cat,label):count for cat in {c[0] for c in raw} for label,count in [(1,2),(0,2),(None,1)]})
    rows=[];keys=[];audits=[];normalized_train={};train_ids={r['id'] for r in training}
    for t in training:normalized_train.setdefault(canonical(t['input']),t)
    comparison=[(t,norm(t['input']['target']),grams(norm(t['input']['target']))) for t in normalized_train.values()]
    for i,(cat,pattern,label,target,context,reason) in enumerate(raw):
        ident=digest('semantic-validation-v1:'+str(i))[:20]
        inp={'target':target,'context':context};group='validation-scenario-'+digest(str(i))[:12]
        assert canonical(inp) not in normalized_train,'Normalized training overlap'
        assert ident not in train_ids
        rows.append({'id':ident,'input':inp})
        key=dict(id=ident,label=label,category=cat,pattern=pattern,reason=reason,group_id=group,parent_id=None,
                 stratum='primary',origin='new_synthetic_validation',author_lineage='same_assistant_as_training',
                 human_reviewed=False,annotation_status='assistant_provisional',noise='none')
        keys.append(key)
        s=norm(target);sg=grams(s);nearest=[]
        for t,ts,tg in comparison:
            inter=len(sg&tg);j=inter/max(1,len(sg|tg));contain=inter/max(1,min(len(sg),len(tg)))
            nearest.append((j,contain,t,ts))
        nearest.sort(key=lambda x:x[0],reverse=True)
        audited=nearest[:3]+[a for a in nearest[3:] if a[0]>=.35 or (min(len(s),len(a[3]))>=40 and a[1]>=.65)]
        for j,contain,t,ts in audited:
            ratio=difflib.SequenceMatcher(None,s,ts,autojunk=False).ratio()
            audits.append(dict(validation_id=ident,training_id=t['id'],jaccard5=j,containment5=contain,sequence_ratio=ratio,
                               exact_target=s==ts,flag=j>=.35 or (min(len(s),len(ts))>=40 and contain>=.65) or ratio>=.70,
                               validation_target=target,training_target=t['input']['target']))
        if label is not None:
            kind='jamo' if i%5 in [0,2] else 'zero_width'
            ninput={k:perturb(v,kind) for k,v in inp.items()}
            assert ninput!=inp
            assert canonical(ninput)==canonical(inp),'Noise must preserve normalized content'
            nid=digest('variant:'+ident)[:20]
            rows.append({'id':nid,'input':ninput})
            keys.append(dict(key,id=nid,parent_id=ident,stratum='surface_consistency',noise=kind))
    assert len({r['id'] for r in rows})==len(rows)
    assert len({canonical(r['input']) for r,k in zip(rows,keys) if k['stratum']=='primary'})==50
    random.Random(94731).shuffle(rows)
    writel('inputs.jsonl',rows);writel('labels.jsonl',keys)
    writel('primary-inputs.jsonl',[r for r in rows if next(k for k in keys if k['id']==r['id'])['stratum']=='primary'])
    writel('overlap-audit.jsonl',audits)
    # This is a diagnostic set; sealing records its version, not independent authorship.
    info=dict(version='semantic-validation-v1',purpose='development_pattern_validation',total_rows=len(rows),primary_rows=50,
              primary_labels={'positive':20,'negative':20,'uncertain':10},surface_consistency_rows=40,categories=10,
              exact_normalized_train_overlaps=0,near_overlap_flags=sum(a['flag'] for a in audits),
              max_nearest_jaccard5=max(a['jaccard5'] for a in audits),max_nearest_sequence_ratio=max(a['sequence_ratio'] for a in audits),
              train_file=str(TRAIN),train_sha256=before,model_runs_at_creation=0,independent_real_holdout=False,
              author_independent=False,labels_human_reviewed=False,live_collection=False,
              same_training_semantic_categories_intentional=True,
              limitations=['shared synthetic author','shared task concepts','only two positive and two normal originals per category','not representative of real class prevalence'],
              files={f:digest((ROOT/f).read_bytes()) for f in ['cases.json','inputs.jsonl','labels.jsonl','primary-inputs.jsonl']})
    save('manifest.json',info)
    if not (ROOT/'usage.json').exists():save('usage.json',{'kind':'development_validation','runs':[],'training_use_forbidden':True})
    assert digest(TRAIN.read_bytes())==before
    print(json.dumps(info,ensure_ascii=False,indent=2))

def div(a,b):return a/b if b else None
def metrics(keys,pred):
    known=[k for k in keys if k['label'] is not None];unknown=[k for k in keys if k['label'] is None]
    tp=sum(k['label']==1 and pred[k['id']]==1 for k in known)
    fp=sum(k['label']==0 and pred[k['id']]==1 for k in known)
    tn=sum(k['label']==0 and pred[k['id']]==0 for k in known)
    fn=sum(k['label']==1 and pred[k['id']]!=1 for k in known)
    na=sum(k['label']==0 and pred[k['id']] is None for k in known)
    pa=sum(k['label']==1 and pred[k['id']] is None for k in known)
    return dict(binary_n=len(known),tp=tp,fp=fp,tn=tn,fn_including_positive_abstentions=fn,
                positive_abstentions=pa,negative_abstentions=na,precision=div(tp,tp+fp),recall=div(tp,tp+fn),
                f1=div(2*tp,2*tp+fp+fn),accuracy_abstentions_wrong=div(tp+tn,len(known)),
                specificity_abstentions_wrong=div(tn,tn+fp+na),coverage=div(len(known)-pa-na,len(known)),
                ambiguous_n=len(unknown),ambiguous_abstention_rate=div(sum(pred[k['id']] is None for k in unknown),len(unknown)),
                ambiguous_forced_positive=sum(pred[k['id']]==1 for k in unknown),ambiguous_forced_negative=sum(pred[k['id']]==0 for k in unknown))

def score(path,run_name):
    manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    for f,h in manifest['files'].items():assert digest((ROOT/f).read_bytes())==h,'Validation files changed; do not silently reuse this version'
    keys=readl(ROOT/'labels.jsonl');given=readl(path)
    assert all(set(x)=={'id','prediction'} for x in given),'Expected id and prediction only'
    assert all(x['prediction'] is None or (type(x['prediction']) is int and x['prediction'] in [0,1]) for x in given)
    assert len({r['id'] for r in given})==len(given),'Duplicate prediction IDs'
    pred={r['id']:r['prediction'] for r in given};expected={k['id'] for k in keys}
    assert set(pred)==expected,'All 90 predictions required; do not silently omit failed cases'
    primary=[k for k in keys if k['stratum']=='primary'];variants=[k for k in keys if k['parent_id']]
    result=dict(run_name=run_name,scope='synthetic_development_not_real_generalization',
                primary=metrics(primary,pred),per_category={c:metrics([k for k in primary if k['category']==c],pred) for c in sorted({k['category'] for k in primary})},
                surface_consistency=dict(n=len(variants),prediction_agreement=div(sum(pred[k['id']]==pred[k['parent_id']] for k in variants),len(variants)),
                                         correct_both=div(sum(pred[k['id']]==k['label'] and pred[k['parent_id']]==k['label'] for k in variants),len(variants))),
                errors=[{'id':k['id'],'prediction':pred[k['id']],'expected':k['label'],'stratum':k['stratum']} for k in keys if pred[k['id']]!=k['label']])
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    filename='score-'+stamp+'.json';save(filename,result)
    usage=json.loads((ROOT/'usage.json').read_text(encoding='utf-8'))
    usage['runs'].append({'at':stamp,'name':run_name,'predictions_sha256':digest(path.read_bytes()),'report':filename})
    save('usage.json',usage);print(json.dumps(result,ensure_ascii=False,indent=2))

def selftest():
    k=[{'id':'p','label':1},{'id':'n','label':0},{'id':'u','label':None}]
    m=metrics(k,{'p':None,'n':1,'u':0})
    assert m['fn_including_positive_abstentions']==1 and m['fp']==1 and m['ambiguous_forced_negative']==1
    assert m['coverage']==.5 and m['accuracy_abstentions_wrong']==0 and m['f1']==0
    m=metrics(k,{'p':1,'n':None,'u':None});assert m['specificity_abstentions_wrong']==0 and m['negative_abstentions']==1
    m=metrics(k,{'p':1,'n':0,'u':None});assert m['f1']==1 and m['ambiguous_abstention_rate']==1
    print('PASS scoring arithmetic on three artificial sentinel cases; no model evaluation')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['build','score','selftest']);p.add_argument('--predictions',type=Path);p.add_argument('--run-name');a=p.parse_args()
    if a.action=='build':build()
    elif a.action=='selftest':selftest()
    else:
        if not a.predictions or not a.run_name:p.error('score requires --predictions and --run-name')
        score(a.predictions,a.run_name)
