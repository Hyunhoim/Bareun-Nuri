"""Combine existing blind review inputs; validate answers without training/evaluation writes."""
import argparse,collections,hashlib,json,re
from pathlib import Path

ROOT=Path('local-benchmark/semantic-review-queue-v1')
SOURCES=[('observed',Path('.runtime/semantic-encoder-real-v1')),('training_candidate',Path('local-benchmark/real-context-supplement-v1')),('training_candidate',Path('local-benchmark/real-context-supplement-v2'))]
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,x):Path(p).write_bytes(json.dumps(x,ensure_ascii=False,indent=2).encode('utf8'))
def build():
    assert not ROOT.exists();rows=[];sources={}
    for purpose,root in SOURCES:
        file=root/'review-inputs.json';expected=read(root/'prepared.json')['review_inputs_sha256'] if purpose=='observed' else read(root/'manifest.json')['outputs']['review-inputs.json']
        assert sha(file)==expected
        sources[str(file)]=expected
        for r in read(file):rows.append({**{k:r[k] for k in ['id','input','raw','url','selector','location']},'purpose':purpose,'source_file':str(file)})
    assert len(rows)==62 and len({r['id'] for r in rows})==62
    assert collections.Counter(r['purpose'] for r in rows)=={'observed':31,'training_candidate':31}
    ROOT.mkdir();save(ROOT/'review-inputs.json',rows)
    digest=sha(ROOT/'review-inputs.json');payload=json.dumps({'manifest':{'input_sha256':digest},'rows':rows},ensure_ascii=False).replace('<','\\u003c')
    template=SOURCES[0][1]/'review.html';page=template.read_text(encoding='utf8')
    page,n=re.subn(r'(<script id="data" type="application/json">).*?(</script>)',lambda m:m[1]+payload+m[2],page,count=1,flags=re.S);assert n==1
    page=page.replace('semantic-encoder-real-v1','semantic-review-queue-v1').replace('semantic-encoder-real-human-answers.json','semantic-review-queue-answers.json')
    page=page.replace('<title>실수집 블라인드 검수</title>','<title>실제 문맥 통합 검수</title>').replace('<h1>실제 수집 문맥 · 블라인드 검수</h1>','<h1>실제 문맥 통합 검수 · 62개</h1><p>관찰 평가31개와 훈련 후보31개입니다. 검수 후에도 용도를 바꾸거나 자동 학습하지 않습니다.</p>')
    page=page.replace('<main id="items"></main>','<p><label>보기 <select id="scope"><option value="all">전체 62개</option><option value="observed">관찰 평가 31개</option><option value="training_candidate">훈련 후보 31개</option></select></label></p><main id="items"></main>')
    page=page.replace("card.append(el('h2',String(i+1))","card.dataset.purpose=r.purpose;card.append(el('h2',String(i+1)+' · '+(r.purpose==='observed'?'관찰 평가':'훈련 후보'))")
    # Export only explicit human selections; keep source purpose in the signed-input contract.
    old="answers:rows.map(r=>({id:r.id,...answers[r.id],reviewed:!!(answers[r.id]?.label!==''&&answers[r.id]?.reason?.trim())}))"
    new="answers:rows.map(r=>({id:r.id,purpose:r.purpose,label:answers[r.id]?.label||'',reason:answers[r.id]?.reason||'',reviewed:!!(['0','1','uncertain','collection_error'].includes(answers[r.id]?.label)&&answers[r.id]?.reason?.trim())}))"
    assert old in page;page=page.replace(old,new)
    page=page.replace('};persist();</script>',"};document.getElementById('scope').onchange=ev=>{for(const card of document.querySelectorAll('article'))card.hidden=ev.target.value!=='all'&&card.dataset.purpose!==ev.target.value};persist();</script>")
    (ROOT/'review.html').write_bytes(page.encode('utf8'))
    save(ROOT/'manifest.json',dict(rows=62,purposes={'observed':31,'training_candidate':31},input_sha256=digest,sources=sources,template_sha256=sha(template),review_html_sha256=sha(ROOT/'review.html'),script_sha256=sha(__file__),model_predictions_included=False,provisional_labels_included=False,automatic_training=False))
    print('Built 62 blind review items: 31 observed / 31 training candidates.')

def validate(obj,rows,digest):
    if not isinstance(obj,dict) or obj.get('dataset')!='semantic-review-queue-v1' or obj.get('input_sha256')!=digest:raise ValueError('Dataset/input hash mismatch')
    if obj.get('reviewer')!='user':raise ValueError('Reviewer declaration missing')
    answers=obj.get('answers');expected={r['id']:r for r in rows}
    if not isinstance(answers,list) or len(answers)!=len(expected):raise ValueError('Missing/extra answers')
    seen=set();accepted=[]
    for a in answers:
        if not isinstance(a,dict):raise ValueError('Invalid answer record')
        id=a.get('id')
        if not isinstance(id,str) or id not in expected or id in seen:raise ValueError('Unknown/duplicate ID')
        seen.add(id)
        if a.get('purpose')!=expected[id]['purpose']:raise ValueError('Purpose changed')
        if type(a.get('reviewed')) is not bool or a.get('label') not in ('','0','1','uncertain','collection_error') or not isinstance(a.get('reason'),str):raise ValueError('Invalid label/review state')
        if a['reviewed']:
            if a['label']=='' or not a['reason'].strip():raise ValueError('Reviewed answer requires label and reason')
            accepted.append(a)
        elif a['label'] and a['reason'].strip():raise ValueError('Completed answer must declare reviewed')
    return dict(reviewed=len(accepted),pending=len(rows)-len(accepted),by_purpose={purpose:dict(collections.Counter(a['label'] for a in accepted if a['purpose']==purpose)) for purpose in ['observed','training_candidate']},identity_independence_verified=False,automatic_training=False)

def main():
    p=argparse.ArgumentParser();p.add_argument('--answers',type=Path);p.add_argument('--self-check',action='store_true');args=p.parse_args()
    if not args.answers and not args.self_check:build();return
    manifest=read(ROOT/'manifest.json');assert sha(ROOT/'review-inputs.json')==manifest['input_sha256'];rows=read(ROOT/'review-inputs.json')
    for f,h in manifest['sources'].items():assert sha(f)==h
    if args.self_check:
        obj=dict(dataset='semantic-review-queue-v1',input_sha256=manifest['input_sha256'],reviewer='user',answers=[dict(id=r['id'],purpose=r['purpose'],label='',reason='',reviewed=False) for r in rows])
        assert validate(obj,rows,manifest['input_sha256'])['reviewed']==0
        obj['answers'][0].update(label='uncertain',reason='TEST ONLY',reviewed=True);assert validate(obj,rows,manifest['input_sha256'])['reviewed']==1
        for key,value in [('purpose','training_candidate'),('label','AD'),('reason',''),('id',rows[1]['id']),('reviewed','true')]:
            bad=json.loads(json.dumps(obj));bad['answers'][0][key]=value
            try:validate(bad,rows,manifest['input_sha256'])
            except ValueError:pass
            else:raise AssertionError('Invalid answer accepted: '+key)
        print('PASS answer contract; test values stayed in memory.');return
    print(json.dumps(validate(read(args.answers),rows,manifest['input_sha256']),ensure_ascii=False,indent=2))
if __name__=='__main__':main()
