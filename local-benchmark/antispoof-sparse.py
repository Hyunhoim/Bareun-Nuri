"""Single-substitution training-data intervention; same trainer and held settings."""
import importlib.util,copy,hashlib
from pathlib import Path
s=importlib.util.spec_from_file_location('a',Path(__file__).with_name('antispoof-scope.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
R=Path('.runtime/antispoof-sparse-v1')
def main():
 R.mkdir(exist_ok=False);rows=a.read(a.R/'train-inputs.json');gold=a.read(a.R/'train-gold.json');mapping=dict(zip('oeaisbt','0341587'));changes=0
 for r in rows:
  plain=r['group_id'].split('/')[1];dense=a.data.changed(plain,mapping);positions=[i for i,c in enumerate(plain) if c in mapping]
  assert positions
  idx=positions[int(hashlib.sha256(plain.encode()).hexdigest(),16)%len(positions)];sparse=plain[:idx]+mapping[plain[idx]]+plain[idx+1:]
  if dense in r['input']['target']:
   changes+=1;r['input']['target']=r['input']['target'].replace(dense,sparse);r['token']=r['token'].replace(dense,sparse)
   r['raw_text']=r['input']['target'].replace('[표기]','').replace('[/표기]','');r['start']=r['raw_text'].index(r['token']);r['end']=r['start']+len(r['token'])
  assert r['raw_text'][r['start']:r['end']]==r['token']
  r['id']=hashlib.sha256((r['input']['target']+r['input']['context']).encode()).hexdigest()[:20]
 assert changes==216 and len(set(r['id'] for r in rows))==len(rows)
 for r,g in zip(rows,gold,strict=True):g['id']=r['id']
 a.save(R/'train-inputs.json',rows);a.save(R/'train-gold.json',gold);a.save(R/'manifest.json',{'plan_sha256':a.p.digest(Path('docs/antispoof-sparse-plan.md')),'trainer_sha256':a.p.digest(Path('local-benchmark/antispoof-scope.py')),'script_sha256':a.p.digest(Path(__file__)),'changes':changes,'rows':len(rows),'observed_evaluation_used_for_training':False})
 a.run('scope',out_root=R,extra_pairs=list(zip(rows,gold,strict=True)))
if __name__=='__main__':main()
