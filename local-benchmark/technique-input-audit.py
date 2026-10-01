"""Diagnose length without deleting semantic evidence or touching model weights."""
import json,re
from pathlib import Path
from transformers import AutoTokenizer
ROOT=Path('.runtime/technique-collected-v1')
rows=json.loads((ROOT/'inputs.json').read_text(encoding='utf8'))
tok=AutoTokenizer.from_pretrained('.runtime/klue-base',local_files_only=True)
def size(text):return len(tok(text,truncation=False)['input_ids'])
def packed(a,b):return '판정대상: '+a+'\n문맥: '+b
out=[]
for r in rows:
    a,b=r['input']['target'],r['input']['context']
    # Whitespace-only diagnostic; never replace the saved raw text or offsets.
    aa,bb=(re.sub(r'\s+',' ',s).strip() for s in (a,b))
    assert re.sub(r'\s','',a)==re.sub(r'\s','',aa)
    assert re.sub(r'\s','',b)==re.sub(r'\s','',bb)
    out.append({'id':r['id'],'owner_id':r['owner_id'],'tokens':size(packed(a,b)),
      'target_tokens':size(a),'context_tokens':size(b),'space_normalized_tokens':size(packed(aa,bb)),
      'target_in_context':r['raw_text'] in b,'panel':r['panel']})
long=[r for r in out if r['tokens']>512]
summary={'queries':len(out),'long':len(long),'long_owners':len({r['owner_id'] for r in long}),
 'target_alone_long':sum(r['target_tokens']>512 for r in long),
 'context_alone_long':sum(r['context_tokens']>512 for r in long),
 'target_repeated_in_context':sum(r['target_in_context'] for r in long),
 'space_only_recovered':sum(r['space_normalized_tokens']<=512 for r in long)}
(ROOT/'input-length-audit.json').write_text(json.dumps({'summary':summary,'rows':out},indent=2),encoding='utf8')
print(json.dumps(summary))
