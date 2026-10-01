"""Fixed-input surface sensitivity; predictions are not new ground truth."""
import argparse,collections,gc,html,importlib.util,json,re,time
from html.parser import HTMLParser
from pathlib import Path

s=importlib.util.spec_from_file_location('encoder',Path(__file__).with_name('semantic-encoder.py'))
e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
R=Path('.runtime/semantic-format-diagnostic-v1')
FROZEN=Path('.runtime/semantic-real-addition-gpu-v1/evaluation-contract.json')
PLAN=Path('docs/semantic-format-diagnostic-plan.md')
SHORT='https://a.example.invalid/p'
LONG='https://b.example.invalid/view?document=482&section=7'

class Text(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.parts=[]
    def handle_data(self,data):self.parts.append(data)

def visible(text):
    p=Text();p.feed(text);p.close();return ''.join(p.parts)

def variants(inp):
    paragraph=dict(inp,target='<p>'+html.escape(inp['target'],quote=False)+'</p>')
    assert visible(paragraph['target'])==inp['target'] and paragraph['context']==inp['context']
    out={'paragraph':paragraph}
    if any('[URL]' in text for text in inp.values()):
        out['url_short']={k:v.replace('[URL]',SHORT) for k,v in inp.items()}
        out['url_long']={k:v.replace('[URL]',LONG) for k,v in inp.items()}
        anchor={k:v.replace('[URL]','<a href="'+SHORT+'">[URL]</a>') for k,v in inp.items()}
        assert all(visible(anchor[k])==v for k,v in inp.items())
        out['anchor']=anchor
    return out

def prepare():
    assert not R.exists()
    train=e.v.readl(e.TRAIN);parents=[r for r in train if r.get('augmentation')=='none'];assert len(parents)==210
    assert not any(re.search(r'https?://',e.v.joined(r['input'])) for r in parents)
    rows=[dict(id='base:'+r['id'],parent_id=r['id'],mode='baseline',input=r['input'],label=r['label'],family_id=r['family_id']) for r in parents]
    for r in parents:
        rows.extend(dict(id=mode+':'+r['id'],parent_id=r['id'],mode=mode,input=inp,label=r['label'],family_id=r['family_id']) for mode,inp in variants(r['input']).items())
    assert len({r['id'] for r in rows})==len(rows)
    scope=[r for r in parents if r['origin']=='real_web_excerpt' and '성인물 광고 선별 양성 후보' in r['reason']]
    assert len(scope)==4
    source_ids={r['source_id'] for r in scope}
    R.mkdir();e.save(R/'inputs.json',rows)
    manifest=dict(files={str(f):e.p.digest(f) for f in [e.TRAIN,FROZEN,PLAN,Path(__file__),Path('local-benchmark/semantic-encoder.py'),Path('local-benchmark/klue-pilot.py'),R/'inputs.json']},
        frozen=e.read(FROZEN)['frozen'],parents=210,rows=len(rows),modes=dict(collections.Counter(r['mode'] for r in rows)),
        raw_http_rows=0,placeholder_rows={str(y):sum(r['label']==y and '[URL]' in e.v.joined(r['input']) for r in parents) for y in [0,1]},
        scope_review=[dict(id=r['id'],source_id=r['source_id'],reason=r['reason'],source_url=r['source_url']) for r in scope],
        related_originals=[dict(id=r['id'],label=r['label'],origin=r['origin'],source_id=r.get('source_id')) for r in parents if r.get('source_id') in source_ids],
        related_augmented_rows=sum(r.get('source_id') in source_ids for r in train),
        independent_holdout=False,labels_changed=False,training=False,api_calls=0,time_limit_seconds=600)
    e.save(R/'manifest.json',manifest);e.log({k:manifest[k] for k in ['parents','rows','modes','related_augmented_rows']})

def verify():
    m=e.read(R/'manifest.json')
    for f,h in m['files'].items():assert e.p.digest(f)==h,f
    return m

def run(name,arm):
    m=verify();dest=R/(arm+'-'+name);dest.mkdir(exist_ok=False)
    frozen=m['frozen'][arm+'/'+name];folder=Path(frozen['folder'])/'model'
    assert e.p.digest(folder/'model.safetensors')==frozen['sha256']
    rows=e.read(R/'inputs.json');e.torch.set_num_threads(8)
    tok=e.p.AutoTokenizer.from_pretrained(folder,local_files_only=True)
    model=e.p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cpu')
    enc,stats=e.encode(tok,rows,512);e.probabilities(model,tok,enc[:8],'cpu')
    probs,seconds=e.probabilities(model,tok,enc,'cpu')
    assert seconds<600
    truncated=set(stats['truncated_ids'])
    pred=[dict(id=r['id'],parent_id=r['parent_id'],mode=r['mode'],p_ad=p,prediction=int(p>=.5),token_limit=r['id'] in truncated) for r,p in zip(rows,probs,strict=True)]
    e.save(dest/'predictions.json',pred);e.save(dest/'completed.json',dict(seconds=seconds,lengths=stats,model_sha256=frozen['sha256'],manifest_sha256=e.p.digest(R/'manifest.json')))
    e.log({'completed':dest.name,'rows':len(rows),'seconds':seconds});del model;gc.collect()

def audit():
    m=verify();rows=e.read(R/'inputs.json');parents={r['parent_id']:r for r in rows if r['mode']=='baseline'};result={}
    for model in m['frozen']:
        folder=R/model.replace('/','-');pred=e.read(folder/'predictions.json');byid={r['id']:r for r in pred}
        assert len(byid)==len(rows)==len(pred)
        done=e.read(folder/'completed.json');assert done['model_sha256']==m['frozen'][model]['sha256']
        info={}
        for mode in ['paragraph','url_short','url_long','anchor']:
            pairs=[];omitted=[]
            for r in rows:
                if r['mode']!=mode:continue
                b=byid['base:'+r['parent_id']];p=byid[r['id']]
                assert p['prediction']==int(p['p_ad']>=.5)
                if b['token_limit'] or p['token_limit']:
                    omitted.append(r['parent_id']);continue
                pairs.append(dict(parent_id=r['parent_id'],label=r['label'],family_id=r['family_id'],before=b['prediction'],after=p['prediction'],before_p=b['p_ad'],after_p=p['p_ad'],absolute_delta=abs(p['p_ad']-b['p_ad'])))
            flips=[x for x in pairs if x['before']!=x['after']]
            info[mode]=dict(pairs=len(pairs),groups=len({x['family_id'] for x in pairs}),omitted=omitted,flips=flips,flip_count=len(flips),
                positive_to_normal=sum(x['before']==1 and x['after']==0 for x in flips),normal_to_positive=sum(x['before']==0 and x['after']==1 for x in flips),
                inherited_positive_flips=sum(x['label']==1 for x in flips),inherited_normal_flips=sum(x['label']==0 for x in flips),
                max_absolute_delta=max((x['absolute_delta'] for x in pairs),default=0),mean_absolute_delta=sum(x['absolute_delta'] for x in pairs)/len(pairs) if pairs else None)
        result[model]=info
    total=sum(e.read(R/model.replace('/','-')/'completed.json')['seconds'] for model in m['frozen'])
    e.save(R/'comparison.json',dict(models=result,total_cpu_inference_seconds=total,independent_holdout=False,accuracy_claimed=False,labels_changed=False))
    e.save(R/'audit.json',dict(passed=True,models=6,rows_per_model=len(rows),total_cpu_inference_seconds=total,time_limit_met=total<=600,
        prediction_hashes={model:e.p.digest(R/model.replace('/','-')/'predictions.json') for model in m['frozen']},script_sha256=e.p.digest(__file__)))
    e.log({name:{mode:dict(pairs=v['pairs'],flips=v['flip_count'],max_delta=v['max_absolute_delta']) for mode,v in info.items()} for name,info in result.items()})

def check():
    inp={'target':'안내 & 인용 <x> [URL]','context':'피해 신고입니다.'}
    out=variants(inp)
    assert visible(out['paragraph']['target'])==inp['target']
    assert out['url_short']['target'].replace(SHORT,'[URL]')==inp['target']

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['prepare','run','audit']);p.add_argument('--model',choices=['klue','kc','ko']);p.add_argument('--arm',choices=['control','addition']);args=p.parse_args()
    # Separate plain paragraph round-trip from inputs containing literal markup.
    assert visible('<p>'+html.escape('안내 & <x>',quote=False)+'</p>')=='안내 & <x>'
    assert variants({'target':'안내 [URL]','context':'피해 신고'})['url_short']['target']=='안내 '+SHORT
    if args.action=='prepare':prepare()
    elif args.action=='audit':audit()
    else:
        assert args.model and args.arm
        run(args.model,args.arm)
