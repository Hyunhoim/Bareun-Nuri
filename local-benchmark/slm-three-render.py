"""Render official templates before llama.cpp; assert all evidence is preserved."""
import json, hashlib, subprocess
from pathlib import Path
from transformers.utils.chat_template_utils import _compile_jinja_template

root=Path('.runtime/slm-three')
read=lambda p:json.loads(p.read_text(encoding='utf8'))
# Read the same instruction from the runner without starting a server.
system=subprocess.check_output(['node','-e',"process.stdout.write(require('./local-benchmark/slm-three.cjs').body({input:{target:'',context:''}}).messages[0].content)"],encoding='utf8')
rows=read(root/'inputs.json')
smoke={'id':'smoke','panel':'smoke','input':{'target':'도서관은 오늘 오후 여섯 시에 문을 닫습니다.','context':'도서관 운영 안내'}}
audit={}
for model in ['exaone','kanana','bllossom']:
    config=read(root/model/'source-tokenizer_config.json')
    template=_compile_jinja_template((root/model/'source-template.jinja').read_text(encoding='utf8'))
    special={k:v if isinstance(v,str) else v['content'] for k,v in config.items() if k in ['bos_token','eos_token','pad_token'] and isinstance(v,(str,dict))}
    result=[]
    for row in [smoke,*rows]:
        content=json.dumps(row['input'],ensure_ascii=False,separators=(',',':'))
        prompt=template.render(messages=[{'role':'system','content':system},{'role':'user','content':content}],add_generation_prompt=True,tools=None,enable_thinking=False,skip_think=True,thinking_mode='no_think',**special)
        assert system in prompt and content in prompt
        result.append({'id':row['id'],'panel':row['panel'],'prompt':prompt})
    dest=root/model/'rendered-inputs.json'
    if dest.exists():assert read(dest)==result, 'Frozen rendered inputs changed'
    else:dest.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    audit[model]={'count':len(result),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'system_and_evidence_preserved':True}
(root/'render-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf8')
print(json.dumps(audit))
