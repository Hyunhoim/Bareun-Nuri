"""Freeze observed diagnostic inputs; no training or sealed final reads."""
import json, hashlib, unicodedata
from pathlib import Path

root=Path('.runtime/slm-three')
read=lambda p:json.loads(Path(p).read_text(encoding='utf8'))
panels={'new40':read('local-benchmark/a-ft-new-data.json')['development'],
        'broad120':read('.runtime/klue-broad-development-v1/rows.json'),
        'ownership44':read('.runtime/klue-retention-v1/development.json')}
rows=[{'panel':panel,'id':r['id'],'input':{k:unicodedata.normalize('NFC',v) for k,v in r['input'].items()},'label':r['label']} for panel,rs in panels.items() for r in rs]
real=read('.runtime/nuri-1.2-human-review-v1/review-items.json')
answers=read('.runtime/nuri-1.2-human-review-v1/human-review-chat-answers.json')['answers']
assert [r['id'] for r in real]==[r['id'] for r in answers]
assert all(r['decision']==2 and r['reviewed'] for r in answers)
rows += [{'panel':'human17','id':r['id'],'input':r['input'],'label':2,'binary_only':True} for r in real]
assert len(rows)==221 and len({(r['panel'],r['id']) for r in rows})==221
dest=root/'inputs.json'
if dest.exists():
    assert read(dest)==rows, 'Preserve frozen inputs'
else:
    dest.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
for model in ['exaone','kanana','bllossom']:
    config=read(root/model/'source-tokenizer_config.json')
    template=config.get('chat_template')
    if template is not None:
        assert isinstance(template,str)
        (root/model/'source-template.jinja').write_text(template,encoding='utf8')
    else:
        assert (root/model/'source-template.jinja').is_file(), 'Fetch separate template from pinned official source'
print(json.dumps({'rows':len(rows),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}))
