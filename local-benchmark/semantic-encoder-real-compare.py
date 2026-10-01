"""Same saved actual inputs: classifier vs HCX disagreement, never a gold score."""
import argparse,importlib.util,json,time
from pathlib import Path
s=importlib.util.spec_from_file_location('e',Path(__file__).with_name('semantic-encoder.py'))
e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
R=Path('.runtime/semantic-encoder-real-hcx-v1');REAL=Path('.runtime/semantic-encoder-real-v1')

def cpu(name):
    import psutil
    dest=R/name;dest.mkdir(exist_ok=False);e.torch.set_num_threads(8)
    c=e.read(e.R/'research-candidates.json')['models'][name];folder=Path(c['folder']);assert e.p.digest(folder/'model.safetensors')==c['sha256']
    rows=e.read(REAL/'review-inputs.json');assert e.p.digest(REAL/'review-inputs.json')==e.read(REAL/'prepared.json')['review_inputs_sha256']
    old={r['id']:r for r in e.read(REAL/name/'predictions.json')}
    start=time.perf_counter();tok=e.p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=e.p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cpu');load=time.perf_counter()-start
    start=time.perf_counter();enc,stats=e.encode(tok,rows,512);encoding=time.perf_counter()-start
    e.probabilities(model,tok,enc[:8],'cpu');probs,sec=e.probabilities(model,tok,enc,'cpu');truncated=set(stats['truncated_ids']);output=[]
    for row,p in zip(rows,probs,strict=True):
        guard=(['token_limit'] if row['id'] in truncated else [])+(['collection_context_truncated'] if row['collection_truncated'] else [])
        assert guard==old[row['id']]['guard']
        output.append(dict(id=row['id'],p_ad=p,raw_prediction=int(p>=.5),guard=guard,safe_prediction=None if guard else int(p>=.5),confidence_prediction=None if guard or .2<p<.8 else int(p>=.5)))
    e.save(dest/'predictions.json',output)
    result=dict(rows=31,seconds=sec,load_seconds=load,tokenization_seconds=encoding,guarded=sum(bool(x['guard']) for x in output),
        changed_from_2003=[r['id'] for r in output if r['raw_prediction']!=old[r['id']]['raw_prediction']],
        max_probability_delta=max(abs(r['p_ad']-old[r['id']]['p_ad']) for r in output),memory=psutil.Process().memory_info()._asdict(),model_sha256=c['sha256'],
        input_sha256=e.p.digest(REAL/'review-inputs.json'),script_sha256=e.p.digest(__file__))
    e.save(dest/'completed.json',result);e.log({'cpu':name,**{k:result[k] for k in ['seconds','guarded','changed_from_2003']}})

def audit():
    import subprocess
    m=e.read(R/'manifest.json');assert e.read(R/'completion.json')['status']=='completed'
    for f,h in m['files'].items():assert e.p.digest(f)==h
    trace=[json.loads(line) for line in (R/'trace.jsonl').read_text(encoding='utf8').splitlines()];requests=[x for x in trace if x['event']=='llm_request'];responses=[x for x in trace if x['event']=='llm_response'];calls=e.read(R/'calls.json')
    assert len(requests)==len(responses)==len(calls)==len(m['plans'])==6
    inputs=e.read(REAL/'review-inputs.json');original={r['id']:r for r in inputs};replayed={'forward':{},'reverse':{}};token_sum=0;usage={}
    # Replay with the exact frozen operating parser, including its fenced-JSON support.
    decoded=json.loads(subprocess.run(['node','-e',"const fs=require('node:fs'),{parseEnvelope}=require('./agent/src/core/json-envelope.cjs');console.log(JSON.stringify(Array.from({length:6},(_,i)=>parseEnvelope(JSON.parse(JSON.parse(fs.readFileSync('.runtime/semantic-encoder-real-hcx-v1/'+i+'-raw-response.json','utf8')).text).result.message.content))));"],capture_output=True,text=True,encoding='utf8',check=True).stdout)
    for i,plan in enumerate(m['plans']):
        raw=e.read(R/f'{i}-raw-response.json');assert raw['status']==200
        data=json.loads(raw['text']);assert data['status']['code']=='20000';r=data['result'];assert r['finishReason']=='stop'
        content=decoded[i];assert set(content)=={'decisions'}
        ids={x['node_id']:x['id'] for x in plan['rows']};assert set(content['decisions'])==set(ids)
        assert requests[i]['body']==plan['body'];payload=json.loads(plan['body']['messages'][1]['content'])['candidates']
        assert len(payload)==len(plan['rows'])
        for item,row in zip(payload,plan['rows'],strict=True):assert item==dict(node_id=row['node_id'],**original[row['id']]['input'])
        assert responses[i]['data']['choices'][0]['message']['content']==r['message']['content']
        assert calls[i]['status']=='ok' and calls[i]['http_status']==200 and calls[i]['usage']['total_tokens']==r['usage']['totalTokens']
        token_sum+=r['usage']['totalTokens'];usage.setdefault(plan['order'],dict(input_tokens=0,output_tokens=0))
        usage[plan['order']]['input_tokens']+=r['usage']['promptTokens'];usage[plan['order']]['output_tokens']+=r['usage']['completionTokens']
        for nid,value in content['decisions'].items():
            assert set(value)=={'label'} and type(value['label']) is int and value['label'] in range(4)
            assert ids[nid] not in replayed[plan['order']];replayed[plan['order']][ids[nid]]=value['label']
    assert token_sum==e.read(R/'completion.json')['confirmed_tokens']
    for order,pred in replayed.items():assert pred=={r['id']:r['label'] for r in e.read(R/f'{order}-predictions.json')} and set(pred)==set(original)
    classifier={name:{r['id']:r for r in e.read(R/name/'predictions.json')} for name in ['klue','kc','ko']}
    common=[k for k in original if all(not p[k]['guard'] for p in classifier.values())];assert len(common)==23
    changed4=[k for k in original if replayed['forward'][k]!=replayed['reverse'][k]]
    binary=lambda y:None if y==3 else int(y==0)
    changed_binary=[k for k in original if binary(replayed['forward'][k])!=binary(replayed['reverse'][k])]
    result=dict(rows=31,common_unguarded=len(common),guarded=len(original)-len(common),hcx_order_label_changes=len(changed4),hcx_order_binary_changes=len(changed_binary),
        hcx_order_label_changed_ids=changed4,hcx_order_binary_changed_ids=changed_binary,usage=usage,confirmed_tokens=token_sum,
        hcx={o:dict(seconds=e.read(R/f'{o}-completion.json')['seconds'],labels={str(y):sum(v==y for v in p.values()) for y in range(4)}) for o,p in replayed.items()},models={},human_labels_used=False,accuracy_calculated=False)
    for name,pred in classifier.items():
        done=e.read(R/name/'completed.json');assert done['input_sha256']==e.p.digest(REAL/'review-inputs.json') and done['script_sha256']==e.p.digest(R/'inference-source.py')
        info=dict(cpu_seconds=done['seconds'],changed_from_2003=done['changed_from_2003'],orders={})
        for order,hcx in replayed.items():
            determinate=[k for k in common if binary(hcx[k]) is not None];diff=[k for k in determinate if pred[k]['raw_prediction']!=binary(hcx[k])]
            confident=[k for k in determinate if pred[k]['confidence_prediction'] is not None]
            info['orders'][order]=dict(common_rows=len(common),hcx_determinate=len(determinate),hcx_review=len(common)-len(determinate),
                binary_agreement=len(determinate)-len(diff),disagree_ids=diff,classifier_ad_hcx_nonad=sum(pred[k]['raw_prediction']==1 and binary(hcx[k])==0 for k in determinate),
                classifier_nonad_hcx_ad=sum(pred[k]['raw_prediction']==0 and binary(hcx[k])==1 for k in determinate),
                classifier_confident_rows=len(confident),confident_disagreements=sum(pred[k]['confidence_prediction']!=binary(hcx[k]) for k in confident))
        result['models'][name]=info
    e.save(R/'comparison.json',result)
    e.save(R/'audit.json',dict(passed=True,requests=6,responses=6,replayed_decisions=62,confirmed_tokens=token_sum,
        prediction_files={str(p):e.p.digest(p) for p in R.glob('**/*predictions.json')},review_html_sha256=e.p.digest(REAL/'review.html'),human_gold_created=False,
        inference_script_sha256=e.p.digest(R/'inference-source.py'),audit_script_sha256=e.p.digest(__file__),parser_sha256=e.p.digest('agent/src/core/json-envelope.cjs')))
    e.log(result)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['klue','kc','ko','audit']);a=p.parse_args()
    audit() if a.action=='audit' else cpu(a.action)
