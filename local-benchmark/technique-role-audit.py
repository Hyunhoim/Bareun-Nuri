"""Observed regression only; compare frozen models and an unchanged agreement gate."""
import importlib.util,json
from pathlib import Path
s=importlib.util.spec_from_file_location('t',Path(__file__).with_name('technique-specialist-train.py'));t=importlib.util.module_from_spec(s);s.loader.exec_module(t);p=t.p
OLD=Path('.runtime/technique-specialist-eval-v1');NEW=Path('.runtime/technique-role-eval-v1');OUT=Path('.runtime/technique-agreement-eval-v1')
def agree(a,b):return a if a==b else 2
def main():
    OUT.mkdir(exist_ok=False);result={}
    for split in ['dev','final']:
        rows=t.read(t.DATA/(split+'-inputs.json'));gold=t.read(t.DATA/(split+'-gold.json'));ys=[x['label'] for x in gold];code={x['id']:x['label'] for x in t.read(Path('.runtime/technique-specialist-hcx-v1')/(split+'-code.json'))}
        for order in ['forward','reverse']:
            a={**code,**{x['id']:x['label'] for x in t.read(OLD/(split+'-'+order+'-predictions.json'))}};b={**code,**{x['id']:x['label'] for x in t.read(NEW/(split+'-'+order+'-predictions.json'))}}
            c={k:agree(a[k],b[k]) for k in code};pred=[c[x['id']] for x in rows]
            result[split+'-'+order]={'role':t.metric(ys,[b[x['id']] for x in rows]),'agreement':t.metric(ys,pred),'old_tp_lost':sum(y==0 and a[x['id']]==0 and c[x['id']]!=0 for x,y in zip(rows,ys))}
            (OUT/(split+'-'+order+'-predictions.json')).write_text(json.dumps([{'id':k,'label':v} for k,v in c.items()]),encoding='utf8')
    p.torch.set_num_threads(8);tok=p.AutoTokenizer.from_pretrained('.runtime/technique-role-model-v1/model',local_files_only=True);model=p.AutoModelForSequenceClassification.from_pretrained('.runtime/technique-role-model-v1/model',local_files_only=True).to('cpu')
    old={x['id']:x for x in t.read(OLD/'historical-regression.json')['rows']};preds=[]
    for split in ['dev','evaluation']:
        data=Path('.runtime/digit-generalization-data-v1');rows=t.read(data/(split+'-inputs.json'));gold={x['node_id']:x for x in t.read(data/(split+'-gold.json'))};adapt=[]
        for x in rows:
            text=x['target_text'];j=text.index(x['token']);adapt.append({'id':x['node_id'],'input':{'target':text[:j]+'[표기]'+x['token']+'[/표기]'+text[j+len(x['token']):],'context':''}})
        inputs,truncated=p.encoded(tok,adapt);assert not truncated;pred,seconds=p.predict(model,tok,inputs,device='cpu');ys=[['substitution','literal','uncertain'].index(gold[x['node_id']]['classification']) for x in rows];combined=[agree(old[x['id']]['pred'],v) for x,v in zip(adapt,pred)]
        result['historical-'+split]={'role':t.metric(ys,pred),'agreement':t.metric(ys,combined),'extra_cpu_seconds':seconds,'old_tp_lost':sum(y==0 and old[x['id']]['pred']==0 and c!=0 for x,y,c in zip(adapt,ys,combined))};preds.extend([{'id':x['id'],'role':v,'agreement':c,'gold':y} for x,v,c,y in zip(adapt,pred,combined,ys)])
    (OUT/'historical-predictions.json').write_text(json.dumps(preds),encoding='utf8');(OUT/'report.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))
if __name__=='__main__':main()
