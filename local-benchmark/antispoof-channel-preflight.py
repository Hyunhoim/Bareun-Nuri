"""Input feasibility only: context text plus exact numeric character evidence."""
import importlib.util,json,statistics
from pathlib import Path
s=importlib.util.spec_from_file_location('t',Path(__file__).with_name('antispoof-typed.py'));t=importlib.util.module_from_spec(s);s.loader.exec_module(t)
a=t.a;R=Path('.runtime/antispoof-channel-preflight-v1')
def character_evidence(token,m):
 # Integer codepoints preserve unknown/control characters without text tokenization.
 rows=[{'position':i,'source':ord(ch),'mapping':[ord(c) for c in m[ch]] if ch in m else None} for i,ch in enumerate(token)]
 assert ''.join(chr(r['source']) for r in rows)==token
 for r in rows:assert r['mapping']==([ord(c) for c in m[chr(r['source'])]] if chr(r['source']) in m else None)
 return rows
def main():
 R.mkdir(exist_ok=False);tok=a.p.AutoTokenizer.from_pretrained(t.R/'scope/model',local_files_only=True);m=a.d.c.mapping()
 panels={n:rows for n,(rows,g) in a.panels().items()}
 panels.update(live=a.read(Path('.runtime/antispoof-compact-v1/live-inputs.json')),collected=a.read(Path('.runtime/technique-collected-v1/inputs.json')),automatic=a.read(Path('.runtime/antispoof-auto-models-v1/inputs.json')))
 out={}
 for name,rows in panels.items():
  contexts=['판정대상: '+r['input']['target']+'\n문맥: '+r['input']['context'] for r in rows]
  before=tok([s+t.evidence(r['token'],m) for s,r in zip(contexts,rows,strict=True)],truncation=False)['input_ids'];after=tok(contexts,truncation=False)['input_ids'];numeric=[character_evidence(r['token'],m) for r in rows]
  assert all(len(x)==len(r['token']) for x,r in zip(numeric,rows,strict=True))
  values=[{'id':r['id'],'typed_tokens':len(b),'context_tokens':len(c),'character_positions':len(n),'mapped_codepoints':sum(len(p['mapping'] or []) for p in n),'collection_truncated':bool(r.get('collection_truncated'))} for r,b,c,n in zip(rows,before,after,numeric,strict=True)]
  out[name]={'rows':len(rows),'typed_over512':sum(len(v)>512 for v in before),'context_over512':sum(len(v)>512 for v in after),'collection_truncated':sum(v['collection_truncated'] for v in values),'previously_protected_but_context_fits':sum(v['typed_tokens']>512>=v['context_tokens'] and not v['collection_truncated'] for v in values),'mean_context_tokens':statistics.mean(map(len,after)),'max_character_positions':max(map(len,numeric)),'max_mapped_codepoints':max(v['mapped_codepoints'] for v in values)}
  a.save(R/(name+'-lengths.json'),values)
 # These distinct source values must remain distinct even when their text IDs collide.
 probes=a.read(Path('.runtime/antispoof-tokenizer-audit-v1/character-probes.json'))
 channels=[json.dumps(character_evidence(p['char'],m),sort_keys=True) for p in probes];assert len(set(channels))==len(probes)
 pins=a.read(a.R/'operating-before.json');assert all(a.p.digest(Path(f))==h for f,h in pins.items())
 summary={'panels':out,'probe_identity_preserved':len(probes),'api':0,'training':0,'model_inference':0,'scope':'Representation feasibility only: no trained numeric branch, no prediction/runtime benefit established','script_sha256':a.p.digest(Path(__file__))};a.save(R/'summary.json',summary);print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()
