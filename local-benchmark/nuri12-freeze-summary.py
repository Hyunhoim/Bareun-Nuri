"""Audit frozen comparison and apply the predeclared expansion condition."""
import json,hashlib
from pathlib import Path
R=Path('.runtime/nuri-1.2-freeze-v1')
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def main():
 assert read(R/'completed.json')['reload_verified']
 for f,h in read(R/'frozen.json').items():assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h
 candidates=read(R/'candidates.json');out={'selection':read(R/'selection.json'),'baselines':read(R/'baselines.json'),'candidates':{a:{k:v[k] for k in ['epoch','step','score','summary']} for a,v in candidates.items()},'pairs':{}}
 for pair in ['continue','fresh']:
  a=read(R/(pair+'_full-history.json'));b=read(R/(pair+'_freeze8-history.json'));assert len(a)==len(b)==6;comparisons=[]
  for x,y in zip(a,b,strict=True):
   assert (x['epoch'],x['step'])==(y['epoch'],y['step']);xs=x['summary'];ys=y['summary'];delta={k:ys[k]-xs[k] for k in ['ad_f1','macro4_mean','uncertain_as_ad','tp','fp','fn']};signal=delta['ad_f1']>=.02 and delta['macro4_mean']>=.03 and delta['uncertain_as_ad']<=0;comparisons.append({'epoch':x['epoch'],'step':x['step'],'delta_freeze_minus_full':delta,'signal':signal})
  count=sum(v['signal'] for v in comparisons);expand=count>=2 and bool(candidates[pair+'_freeze8']['score'][1]);out['pairs'][pair]={'comparisons':comparisons,'signal_count':count,'expand':expand}
  assert read(R/(pair+'_full-contract.json'))['initial_hash']==read(R/(pair+'_freeze8-contract.json'))['initial_hash']
  for arm in [pair+'_full',pair+'_freeze8']:assert read(R/(arm+'-complete.json'))['frozen_equal']
 out['final_opened']=False;(R/'summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in out.items() if k!='pairs'},ensure_ascii=False));print(json.dumps({k:{'signals':v['signal_count'],'expand':v['expand']} for k,v in out['pairs'].items()}))
if __name__=='__main__':main()
