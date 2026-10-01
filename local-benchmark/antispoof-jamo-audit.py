"""Frozen-model target/context diagnostic; no learning or final-set access."""
import hashlib
import importlib.util
import json
import unicodedata
import sys
from collections import Counter, defaultdict
from pathlib import Path
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

ROOT = Path('.runtime/dual-technique-v1')
OUT = Path('.runtime/antispoof-jamo-audit-v2' if '--crossed' in sys.argv else '.runtime/antispoof-jamo-audit-v1')


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    OUT.mkdir(exist_ok=False)
    spec = importlib.util.spec_from_file_location('data', Path(__file__).with_name('dual-technique-data.py'))
    data = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(data)
    spec = importlib.util.spec_from_file_location('service', Path('agent/antispoof/infer.py'))
    service = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(service)
    assets = Path('agent/models/kcelectra-antispoof-v1')
    manifest = read(assets / 'manifest.json')
    for name, sha in manifest['files'].items():
        assert hashlib.sha256((assets / name).read_bytes()).hexdigest() == sha
    mapping = {}
    for line in (assets / 'confusables.txt').read_text(encoding='utf-8-sig').splitlines():
        clean = line.split('#')[0].strip()
        if clean:
            a,b,*_ = clean.split(';')
            mapping[''.join(chr(int(x,16)) for x in a.split())] = ''.join(chr(int(x,16)) for x in b.split())
    rows = []
    words = [('train', '미술'), ('train', '시민'), ('train', '기념'),
             ('dev', '기린'), ('dev', '밀가루'), ('dev', '시골'),
             ('diagnostic', '학교'), ('diagnostic', '도서관'), ('diagnostic', '상담')]
    for source, word in words:
        jamo = data.decompose(word)
        forms = {'compat':jamo, 'nfd':unicodedata.normalize('NFD',word), 'plain':word}
        for form, token in forms.items():
            for context, target, side in [
                ('isolated', '[표기]'+token+'[/표기]', '이용 안내'),
                ('neighbor_plain', '[표기]'+token+'[/표기] coral', '이용 안내'),
                ('neighbor_digit', '[표기]'+token+'[/표기] c0ral', '이용 안내'),
                ('ad', '사설 도박방에서 [표기]'+token+'[/표기]라는 행사로 회원을 모읍니다. 입금하고 이용할 분은 쪽지 주세요.', '작성자가 올린 모집 글입니다.'),
                ('education', '오늘 수업 자료에는 [표기]'+token+'[/표기]가 나왔어요. 아이가 읽는 방법을 물어봅니다.', '학부모의 교육 문의입니다.'),
            ]:
                for use_unicode in [True,False]:
                    rows.append({'source':source,'word':word,'form':form,'context':context,'unicode':use_unicode,'token':token,
                                 'target':target,'side':side,'gold':[1 if form=='plain' else 0,1]})
    tok=AutoTokenizer.from_pretrained(assets,local_files_only=True)
    if '--crossed' in sys.argv:
        rows=[]
        for source,word in words:
            jamo=data.decompose(word)
            for plain,changed in [('alpine','4lpine'),('cypress','cypr3ss'),('badger','b4dger'),('dolphin','d0lphin'),('emerald','3merald'),('falcon','falc0n')]:
                for mode,token,target,gold in [
                    ('normal_neighbor',jamo,'[표기]'+jamo+'[/표기] '+plain,[0,1]),
                    ('digit_neighbor',jamo,'[표기]'+jamo+'[/표기] '+changed,[0,1]),
                    ('mark_digit',changed,jamo+' [표기]'+changed+'[/표기]',[1,0]),
                    ('mark_both',jamo+' '+changed,'[표기]'+jamo+' '+changed+'[/표기]',[0,0]),
                ]:
                    rows.append({'source':source,'word':word,'form':'crossed','context':mode,'neighbor':changed,'unicode':True,'token':token,'target':target,'side':'이용 안내','gold':gold})
    model=AutoModelForSequenceClassification.from_pretrained(assets,local_files_only=True).to('cpu').eval()
    torch.set_num_threads(8)
    for i in range(0,len(rows),8):
        batch=rows[i:i+8]
        texts=['판정대상: '+r['target']+'\n문맥: '+r['side']+(service.evidence(r['token'],mapping) if r['unicode'] else '') for r in batch]
        enc=tok(texts,padding=True,truncation=False,return_token_type_ids=False,return_tensors='pt')
        assert enc['input_ids'].shape[1]<=512
        with torch.inference_mode():
            probs=model(**enc).logits.reshape(-1,2,3).softmax(-1).tolist()
        for r,p in zip(batch,probs,strict=True):
            labels=[max(range(3),key=lambda j:v[j]) for v in p]
            r['argmax']=labels.copy()
            if p[1][0]>=.2:labels[1]=0
            r['labels']=labels;r['probabilities']=p
            ids=tok(r['token'],add_special_tokens=False)['input_ids']
            r['token_pieces']=tok.convert_ids_to_tokens(ids)
    counts=defaultdict(Counter)
    for r in rows:
        key=f"{r['form']}/{r['context']}/unicode={r['unicode']}"
        counts[key].update({'n':1,'H_present':r['labels'][1]==0,'H_argmax_present':r['argmax'][1]==0,'J_present':r['labels'][0]==0,'exact_correct':r['labels']==r['gold']})
    train_audit=defaultdict(Counter);contradictions=[]
    for split in ['base','extra']:
        for r,g in zip(read(ROOT/f'{split}-inputs.json'),read(ROOT/f'{split}-gold.json'),strict=True):
            if r['group_id']=='리본/silver':continue
            train_audit[g['kind']].update({'n':1,'H_present':g['labels'][1]==0,'H_absent':g['labels'][1]==1})
            if g['kind'] in ['compat_jamo','canonical_jamo','partial_jamo','spaced_jamo','zerowidth_jamo'] and g['labels'][1]!=1:
                contradictions.append(r['id'])
    example=[r for r in rows if r['word']=='학교' and r['form']=='compat' and r['unicode']]
    out={'rows':len(rows),'counts':dict(counts),'school':example,'training_label_audit':dict(train_audit),'pure_jamo_wrong_H_gold':contradictions,
         'unicode_school':service.evidence(data.decompose('학교'),mapping),'model_sha256':manifest['files']['model.safetensors'],
         'interpretation':'controlled interventions; no final evaluation or generalization claim','training':0,'api':0}
    (OUT/'predictions.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(out,ensure_ascii=False))


if __name__=='__main__':main()
