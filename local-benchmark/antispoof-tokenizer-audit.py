"""Read-only tokenizer information-loss audit; no model inference or training."""
import importlib.util,json,collections
from pathlib import Path
s=importlib.util.spec_from_file_location('c',Path(__file__).with_name('antispoof-compact.py'));c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
a=c.a;R=Path('.runtime/antispoof-tokenizer-audit-v1')
def main():
 R.mkdir(exist_ok=False);tok=a.p.AutoTokenizer.from_pretrained(c.t.R/'scope/model',local_files_only=True);m=a.d.c.mapping();panels=a.panels();result={};chars=set()
 for name,(rows,gold) in panels.items():
  chars.update(''.join(r['token'] for r in rows));conditions={}
  for arm,fn in [('typed',c.t.evidence),('compact',c.evidence)]:
   enc,lens=c.encode(tok,rows,fn,m);groups=collections.defaultdict(list)
   for i,e in enumerate(enc):groups[tuple(e['input_ids'])].append(i)
   conflict=[v for v in groups.values() if len({tuple(gold[i]['labels']) for i in v})>1]
   conditions[arm]={'rows':len(rows),'unknown_rows':sum(tok.unk_token_id in e['input_ids'] for e in enc),'unknown_tokens':sum(e['input_ids'].count(tok.unk_token_id) for e in enc),'conflicting_input_groups':len(conflict),'conflicting_rows':sum(map(len,conflict)),'conflicts':[[{'id':rows[i]['id'],'labels':gold[i]['labels'],'token':rows[i]['token']} for i in v] for v in conflict]}
  result[name]=conditions
 probes=[];groups={k:collections.defaultdict(list) for k in ['literal','codepoint','typed','compact']}
 for ch in sorted(chars,key=ord):
  forms={'literal':ch,'codepoint':f'U+{ord(ch):04X}','typed':'판정대상: [표기]'+ch+'[/표기]'+c.t.evidence(ch,m),'compact':'판정대상: [표기]'+ch+'[/표기]'+c.evidence(ch,m)}
  row={'char':ch,'codepoint':f'U+{ord(ch):04X}','unicode_name':c.t.unicodedata.name(ch,'UNNAMED')}
  for k,v in forms.items():
   ids=tok(v,add_special_tokens=False)['input_ids'];groups[k][tuple(ids)].append(ch);row[k]={'ids':ids,'tokens':tok.convert_ids_to_tokens(ids),'unknown':tok.unk_token_id in ids}
  probes.append(row)
 collisions={k:[{'chars':v,'codepoints':[f'U+{ord(ch):04X}' for ch in v]} for v in g.values() if len(v)>1] for k,g in groups.items()}
 summary={'panels':result,'characters':len(chars),'probe_unknown_chars':{k:sum(r[k]['unknown'] for r in probes) for k in groups},'probe_collision_groups':{k:len(v) for k,v in collisions.items()},'probe_collisions':collisions,'normalizer':str(tok.backend_tokenizer.normalizer),'training':0,'api':0,'model_inference':0,'final860_access':False,'scope':'Existing development inputs and controlled character probes; not independent performance evaluation'}
 a.save(R/'summary.json',summary);a.save(R/'character-probes.json',probes)
 print(json.dumps(summary,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
