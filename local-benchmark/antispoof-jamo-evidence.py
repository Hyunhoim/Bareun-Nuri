"""Frozen prediction post-check. No model training, inference, or final-set access."""
import importlib.util,json,time
from pathlib import Path
s=importlib.util.spec_from_file_location('a',Path(__file__).with_name('antispoof-scope.py'));a=importlib.util.module_from_spec(s);s.loader.exec_module(a)
s=importlib.util.spec_from_file_location('e',Path(__file__).with_name('dual-technique-eval.py'));e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
R=Path('.runtime/antispoof-jamo-evidence-v1');read=a.read;save=a.save

def is_jamo(c):
 n=ord(c)
 return any(lo<=n<=hi for lo,hi in [(0x1100,0x11ff),(0x3130,0x318f),(0xa960,0xa97f),(0xd7b0,0xd7ff),(0xffa0,0xffdc)])

def unsupported_h(token):
 chars=[c for c in token if not c.isspace() and c not in '\u200b\u200c\u200d']
 return bool(chars) and all(is_jamo(c) for c in chars)

def adjust(rows,ps):
 result=[]
 for r,v in zip(rows,ps,strict=True):
  x=v.copy()
  if x[1]==0 and unsupported_h(r['token']):x[1]=2
  assert x[0]==v[0] and (x[1]!=0 or v[1]==0)
  result.append(x)
 return result

def main():
 R.mkdir(exist_ok=False)
 assert unsupported_h('ㅎ ㅏ\u200bㄱㄱㅛ') and unsupported_h('학교'.__class__('학교'))
 for token in ['','학교','ㅁl소','ㅁ口소','ㅎㅏㄱ0','ㅎㅏㄱ c0ral']:assert not unsupported_h(token)
 result={}
 for arm in ['baseline','scope']:
  folder=a.R/arm if arm=='baseline' else a.R/arm/f"epoch{read(a.R/arm/'selection.json')['epoch']}"
  result[arm]={}
  for name,(rows,gold) in a.panels().items():
   before=read(folder/(name+'-predictions.json'));after=adjust(rows,before)
   m=a.d.metric([g['labels'] for g in gold],after)
   m['H_tp_lost']=sum(g['labels'][1]==0 and b[1]==0 and n[1]!=0 for g,b,n in zip(gold,before,after,strict=True))
   m['demoted_to_uncertain']=sum(b[1]==0 and n[1]==2 for b,n in zip(before,after,strict=True));result[arm][name]=m
   save(R/(arm+'-'+name+'-predictions.json'),after)
  for name,(rows,gold) in e.regressions().items():
   before=read(a.R/'regression'/(arm+'-predictions.json'))[name];after=adjust(rows,before)
   m={'H':e.c.t.metric([g['label'] for g in gold],[v[1] for v in after]),'H_tp_lost':sum(g['label']==0 and b[1]==0 and n[1]!=0 for g,b,n in zip(gold,before,after,strict=True)),
      'demoted_to_uncertain':sum(b[1]==0 and n[1]==2 for b,n in zip(before,after,strict=True))}
   if name in ['old-dev','old-final']:
    split=name.removeprefix('old-');intent={r['node_id']:r['is_violation'] for r in read(Path('.runtime/technique-specialist-intent-v1')/f'{split}-decisions.json')};code={r['id']:r['label'] for r in read(Path('.runtime/technique-specialist-hcx-v1')/f'{split}-code.json')}
    truth={g['id'] for g in gold if g['is_ad'] and g['label']==0};found={r['id'] for r,v in zip(rows,after,strict=True) if intent[r['id']] and (v[1]==0 or code[r['id']]==0)};m['stored_hcx']=e.c.binary(truth,found)
   result[arm]['regression-'+name]=m;save(R/(arm+'-'+name+'-predictions.json'),after)
 audit=read(Path('.runtime/antispoof-jamo-audit-v2/predictions.json'));before=[r['labels'] for r in audit];after=adjust(audit,before)
 result['diagnostic']={mode:{'n':sum(r['context']==mode for r in audit),'H_present_before':sum(r['context']==mode and v[1]==0 for r,v in zip(audit,before,strict=True)),'H_present_after':sum(r['context']==mode and v[1]==0 for r,v in zip(audit,after,strict=True))} for mode in ['normal_neighbor','digit_neighbor','mark_digit','mark_both']}
 pins=read(a.R/'operating-before.json');assert all(a.p.digest(Path(f))==h for f,h in pins.items())
 save(R/'summary.json',result);save(R/'audit.json',{'operating_files_unchanged':len(pins),'plan_sha256':a.p.digest(Path('docs/antispoof-jamo-evidence-plan.md')),'script_sha256':a.p.digest(Path(__file__)),'training':0,'api_calls':0,'final860_access':False})
 print(json.dumps({arm:{name:{'H_F1':m.get('H',m.get('HOMOGLYPH'))['strict_f1'],'lost':m['H_tp_lost'],'demoted':m['demoted_to_uncertain']} for name,m in panels.items()} for arm,panels in result.items() if arm!='diagnostic'},ensure_ascii=False))
 print(json.dumps(result['diagnostic']))

if __name__=='__main__':main()
