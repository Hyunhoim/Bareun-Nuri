"""Audit every converted prediction against frozen sources and written metrics."""
import hashlib,importlib.util,json,math
from pathlib import Path
s=importlib.util.spec_from_file_location('q',Path(__file__).with_name('semantic-encoder-onnx.py'))
q=importlib.util.module_from_spec(s);s.loader.exec_module(q);e=q.e

def main():
    for f,h in e.read(e.R/'retention/manifest.json')['files'].items():assert e.p.digest(f)==h
    for f,h in e.read(e.v.ROOT/'manifest.json')['files'].items():assert e.p.digest(e.v.ROOT/f)==h
    assert e.p.digest('.runtime/slm-three/inputs.json')==e.read(e.R/'regression/manifest.json')['inputs_sha256']
    assert e.p.digest(q.REAL/'inputs.json')==e.read(q.REAL/'review-manifest.json')['input_sha256']
    total=0;summary={};files={}
    for name in ['klue','kc','ko']:
        folder,c=q.source(name);ex=e.read(q.R/name/'export.json');assert ex['model']['sha256']==c['sha256']
        assert ex['script_sha256']==e.p.digest(Path(__file__).with_name('semantic-encoder-onnx.py'))
        for f,h in ex['files'].items():assert e.p.digest(q.R/name/f)==h['sha256']
        summary[name]={}
        for kind in ['fp32','int8']:
            dest=q.R/name/kind;report=e.read(dest/'report.json');done=e.read(dest/'completed.json')
            assert done['script_sha256']==ex['script_sha256'] and done['model_sha256']==ex['files'][kind+'.onnx']['sha256']
            for panel,rows,keys,base in q.panels(name):
                f=dest/(panel+'-predictions.json');data=e.read(f);total+=len(data)
                assert [r['id'] for r in data]==[r['id'] for r in rows]
                assert all(math.isfinite(r['p_ad']) and 0<=r['p_ad']<=1 and r['prediction']==int(r['p_ad']>=.5) for r in data)
                pred={r['id']:r['prediction'] for r in data};met=report[panel]
                assert met['input_sha256']==hashlib.sha256(json.dumps(rows,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
                assert met['changed_ids']==[r['id'] for r in rows if pred[r['id']]!=base[r['id']]['prediction']]
                if keys is not None:
                    assert met['metrics']==e.v.metrics(keys,pred)
                    assert met['lost_tp']==[k['id'] for k in keys if k['label']==1 and base[k['id']]['prediction']==1 and pred[k['id']]!=1]
                    assert met['new_fp']==[k['id'] for k in keys if k['label']==0 and base[k['id']]['prediction']!=1 and pred[k['id']]==1]
                if panel=='real':
                    assert all(r['guard']==base[r['id']]['guard'] and r['safe_prediction']==(None if r['guard'] else r['prediction']) for r in data)
                files[str(f)]=e.p.digest(f)
            preserve=all(not v['changed_ids'] and (v['max_probability_delta'] is None or v['max_probability_delta']<=1e-4) for v in report.values()) if kind=='fp32' else all(not v['lost_tp'] and not v['new_fp'] for v in report.values()) and not report['real']['changed_ids']
            assert done['preservation_gate']==preserve
            summary[name][kind]=dict(preservation_gate=preserve,speed_ratio=done['speed_ratio_to_prior_pytorch'],real_seconds=report['real']['seconds'],
                all_changes=sum(len(x['changed_ids']) for x in report.values()),lost_tp=sum(len(x['lost_tp']) for x in report.values()),new_fp=sum(len(x['new_fp']) for x in report.values()),
                real_changes=len(report['real']['changed_ids']),confidence_changes=report['real']['confidence_changes'],peak_wset_MiB=done['memory']['peak_wset']/1048576)
    assert total==25782
    e.save(q.R/'audit.json',dict(passed=True,rows=total,prediction_files=files,summary=summary,new_api_calls=0,new_holdout=False,human_review_completed=False))
    e.log({'passed':True,'rows':total,'summary':summary})

if __name__=='__main__':main()
