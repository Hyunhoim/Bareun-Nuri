"""Audit real capture/inference coverage; never score unreviewed inputs as normal."""
import hashlib,json,math,collections
from pathlib import Path
R=Path('.runtime/semantic-encoder-real-v1')
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
    rows=read(R/'inputs.json');byid={r['id']:r for r in rows};review=read(R/'review-inputs.json');manifest=read(R/'manifest.json')
    assert len(byid)==len(rows)==2003
    for file,h in manifest['hashes'].items():assert sha(file)==h,file
    for entry in read(R/'capture.json'):
        if 'file' in entry:
            assert sha(R/entry['file'])==entry['sha256']
            snap=read(R/entry['file']);candidates={(c['url'],c['location']):c for c in snap['candidates']}
            for row in [r for r in rows if r['snapshot']==entry['file']]:
                c=candidates[row['url'],row['location']];assert row['raw']==c['raw_text'] and row['selector']==c['selector']
    assert sha(R/'inputs.json')==read(R/'captured.json')['inputs_sha256']
    assert sha(R/'review-inputs.json')==read(R/'prepared.json')['review_inputs_sha256']
    assert sha(R/'review.html')==read(R/'prepared.json')['review_html_sha256']
    assert all(r==byid[r['id']] for r in review)
    pred={};output={}
    for name in ['klue','kc','ko']:
        result=read(R/name/'result.json');rs=read(R/name/'predictions.json');truncated=set(result['lengths']['truncated_ids'])
        assert result['input_sha256']==sha(R/'inputs.json') and result['script_sha256']==sha('local-benchmark/semantic-encoder-real.py')
        assert set(x['id'] for x in rs)==set(byid) and len(rs)==len(rows)
        assert (R/'prepared.json').stat().st_mtime<(R/name/'predictions.json').stat().st_mtime
        for x in rs:
            assert math.isfinite(x['p_ad']) and 0<=x['p_ad']<=1 and x['raw_prediction']==int(x['p_ad']>=.5)
            reasons=(['token_limit'] if x['id'] in truncated else [])+(['collection_context_truncated'] if byid[x['id']]['collection_truncated'] else [])
            assert x['guard']==reasons and x['safe_prediction']==(None if reasons else x['raw_prediction'])
        pred[name]={x['id']:x for x in rs}
        output[name]={k:result[k] for k in ['inference_seconds','load_seconds','tokenization_seconds','raw_positive','safe_positive','guarded']}
        output[name].update(rss_mib=result['memory']['rss']/1048576,peak_working_set_mib=result['memory']['peak_wset']/1048576,
            private_commit_mib=result['memory']['private']/1048576,token_truncated=len(truncated),collection_truncated=sum(r['collection_truncated'] for r in rows),
            review_guarded=sum(bool(pred[name][r['id']]['guard']) for r in review))
    findings=[{'id':r['id'],'raw':r['raw'],'input':r['input'],'page':r['page'],'predictions':{name:pred[name][r['id']] for name in pred}} for r in review]
    (R/'restricted-review-predictions.json').write_text(json.dumps(findings,ensure_ascii=False,indent=2),encoding='utf8')
    report=dict(passed=True,rows=len(rows),review_rows=len(review),model_metrics=output,
        all_model_raw_agreement=sum(len({pred[n][r['id']]['raw_prediction'] for n in pred})==1 for r in rows),
        review_raw_disagreements=sum(len({pred[n][r['id']]['raw_prediction'] for n in pred})>1 for r in review),
        human_gold_received=False,accuracy_scored=False,api_calls=0,production_changed=False,
        limitation='purposefully chosen three usable pages; English link destinations unresolved; actual positive campaigns not independently grouped')
    (R/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
