"""Recompute counts and verify frozen models/data; no inference or API calls."""
import importlib.util,json
from pathlib import Path
s=importlib.util.spec_from_file_location('c',Path(__file__).with_name('canine-technique.py'));c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
c.selfcheck();r=c.ROOT;e=r/'evaluation';assert c.read(e/'completed.json')['completed']
manifest=c.read(c.DATA/'manifest.json')
for f,entry in manifest['splits'].items():assert c.p.digest(c.DATA/f)==entry['sha256']
for f,digest in c.read(e/'manifest.json')['data_hashes'].items():assert c.p.digest(Path(f))==digest
hashes={}
for arm in c.ARMS:
    file=c.model_path(arm)/'model.safetensors';hashes[arm]=c.p.digest(file)
    assert hashes[arm]==c.read(c.t.OUT/'frozen.json' if arm=='existing' else r/arm/'frozen.json')['model_sha256']
    if arm!='existing':
        history=c.read(r/arm/'history.json');selected=max(history,key=lambda h:(h['development']['macro_f1'],-h['development']['uncertain_false'],-h['epoch']))
        assert selected==c.read(r/arm/'selection.json')
    records=c.read(e/(arm+'.json'))['panels']
    for name,rows in c.panels().items():
        assert [x['id'] for x in rows]==[x['id'] for x in records[name]['rows']]
        assert len({x['id'] for x in rows})==len(rows)
    for split in ['dev','final']:
        if arm=='existing':
            actual={x['id']:x['label'] for x in records[split]['rows']}
            historical={x['id']:x['label'] for x in c.read(Path('.runtime/technique-specialist-hcx-v1')/(split+'-code.json'))}
            historical.update({x['id']:x['label'] for x in c.read(Path('.runtime/technique-specialist-eval-v1')/(split+'-forward-predictions.json'))})
            assert actual==historical,'Baseline prediction drift'
    # The public feature builder never receives reference readings or gold labels.
    train=c.read(c.DATA/'train-inputs.json');features=c.adapted(train,arm,c.mapping())
    for source,feature in zip(train,features,strict=True):
        assert set(feature)=={'input'} and set(feature['input'])=={'target','context'}
        assert source['input']['target']==feature['input']['target']
        assert source['input']['context']==feature['input']['context'][:len(source['input']['context'])]
export=c.read(r/'export-audit.json')['results'];report=c.read(r/'report.json')
for arm in c.ARMS:
    for split in ['dev','final']:assert export[arm][split]==report[arm][split]['hcx_combined']
c.save(r/'audit.json',{'passed':True,'baseline_192_predictions_equal':True,'six_dataset_hashes_valid':True,'model_hashes':hashes,'no_gold_in_feature_input':True,'export_counts_equal':True,'api_calls':0,'production_adoption':False})
print('AUDIT PASSED')
