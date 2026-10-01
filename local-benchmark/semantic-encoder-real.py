"""Prepare blind actual-input review; infer each frozen model in a fresh CPU process."""
import argparse,collections,hashlib,html,importlib.util,json,re,time,unicodedata
from pathlib import Path
from urllib.parse import urlparse
s=importlib.util.spec_from_file_location('e',Path(__file__).with_name('semantic-encoder.py'))
e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
R=Path('.runtime/semantic-encoder-real-v1')

def prepare():
    assert not (R/'review-manifest.json').exists()
    rows=e.read(R/'inputs.json');train=e.v.readl(e.TRAIN)
    train_keys={e.v.canonical(r['input']) for r in train}
    train_hosts={urlparse(r.get('source_url','')).hostname for r in train}-{None}
    for item in e.read(R/'capture.json'):
        if 'file' in item:assert e.p.digest(R/item['file'])==item['sha256']
    selected=[];normal=[];later=[];seen=set()
    for r in rows:
        if r['page']==0 and re.search(r' > ul > li:nth-of-type\((\d+)\).* > p$',r['selector']) and len(r['raw'].strip())>=30:
            signature=e.v.norm(r['raw'])
            if signature in seen:continue
            seen.add(signature);number=int(re.search(r' > ul > li:nth-of-type\((\d+)\)',r['selector']).group(1))
            (normal if number<42 else later).append(r)
        if r['page']==4 and '> main > article' in r['selector'] and len(r['raw'].strip())>300:selected.append(r)
        if r['page']==6 and '> tbody > tr:nth-of-type(3) > td > p' in r['selector'] and len(r['raw'].strip())>40:selected.append(r)
    # Equal spacing through earlier agricultural comments, all distinct later comments.
    selected+= [normal[i] for i in sorted({round(j*(len(normal)-1)/5) for j in range(6)})]+later
    selected=[r for r in selected if e.v.canonical(r['input']) not in train_keys]
    selected.sort(key=lambda r:hashlib.sha256(r['id'].encode()).hexdigest())
    assert len({r['id'] for r in selected})==len(selected)
    audit=dict(input_sha256=e.p.digest(R/'inputs.json'),train_sha256=e.p.digest(e.TRAIN),
        total_rows=len(rows),selected=len(selected),predictions_used=False,labels_completed=0,
        source_hosts=sorted({urlparse(r['url']).hostname for r in selected}),
        training_host_overlap=sorted({urlparse(r['url']).hostname for r in selected}&train_hosts),
        normalized_training_overlap_all=sum(e.v.canonical(r['input']) in train_keys for r in rows),
        normalized_training_overlap_selected=0,selection='six earlier comments, distinct later comments, educational workshop body, press-release paragraphs; no prediction access',
        independent_human_labels=False,independent_campaigns_verified=False,source_prevalence_representative=False)
    e.save(R/'review-inputs.json',selected);e.save(R/'review-manifest.json',audit)
    answers={r['id']:dict(label=None,reason='',reviewed=False) for r in selected};e.save(R/'human-answers-template.json',answers)
    payload=json.dumps({'manifest':audit,'rows':selected},ensure_ascii=False).replace('<','\\u003c')
    page='''<!doctype html><html lang="ko"><meta charset="utf-8"><title>실수집 블라인드 검수</title>
<style>body{max-width:1000px;margin:32px auto;padding:20px;font:16px/1.6 system-ui;background:#f4f6f8;color:#13233a}article{background:white;padding:24px;margin:24px 0;border:1px solid #cbd5e1}pre{white-space:pre-wrap;overflow-wrap:anywhere}select,textarea,button{font:inherit;padding:8px}textarea{display:block;width:95%;height:70px}small{overflow-wrap:anywhere}button{position:sticky;top:8px;background:#164e63;color:white}a{color:#164e63}</style>
<h1>실제 수집 문맥 · 블라인드 검수</h1><p>모델 예측과 정답 초안은 표시하지 않습니다. 대상 자체의 행위를 문맥으로 판단하세요. 다른 댓글이나 작성자 이름의 광고를 대상에 옮기지 마세요. 링크 내용이 불명확하면 근거 부족을 고릅니다. 위험 단어·거래 표현만으로 불법 권유가 되지는 않습니다.</p><p>전체 입력을 검수합니다. 모델의 512토큰 잘림은 별도 계산되며 긴 입력을 정답 근거 없이 잘라 확정하지 않습니다. 본문에 적힌 외부 광고 링크는 방문할 필요가 없습니다.</p><button id="export">검수 JSON 저장</button><span id="progress"></span><main id="items"></main>
<script id="data" type="application/json">PAYLOAD</script><script>
const data=JSON.parse(document.getElementById('data').textContent),rows=data.rows,key='semantic-encoder-real-v1:'+data.manifest.input_sha256;let answers={};try{answers=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
function el(t,text){const x=document.createElement(t);if(text!==undefined)x.textContent=text;return x}
function persist(){try{localStorage.setItem(key,JSON.stringify(answers))}catch{}document.getElementById('progress').textContent=' 완료 '+rows.filter(r=>answers[r.id]?.label!==''&&answers[r.id]?.label!==undefined&&answers[r.id]?.reason?.trim()).length+'/'+rows.length}
for(const [i,r]of rows.entries()){const a=answers[r.id]||={label:'',reason:''},card=el('article');card.append(el('h2',String(i+1)),el('small',r.id+' · '+r.url),el('h3','대상'),el('pre',r.input.target),el('h3','실제 수집 문맥'),el('pre',r.input.context),el('small','원문 위치: '+r.selector));const select=el('select');select.setAttribute('aria-label','판정');for(const [v,t]of [['','미선택'],['1','1 광고 대상의 불법 이용/구매 유도'],['0','0 정상·보도·예방·합법 권유·피해 문의'],['uncertain','근거 부족'],['collection_error','수집/귀속 결함']]){const o=el('option',t);o.value=v;select.append(o)}select.value=a.label;select.onchange=()=>{a.label=select.value;persist()};const reason=el('textarea');reason.setAttribute('aria-label','판단 근거');reason.placeholder='판단 근거 (필수)';reason.value=a.reason;reason.oninput=()=>{a.reason=reason.value;persist()};card.append(select,reason);document.getElementById('items').append(card)}
document.getElementById('export').onclick=()=>{const obj={dataset:'semantic-encoder-real-v1',input_sha256:data.manifest.input_sha256,reviewer:'user',answers:rows.map(r=>({id:r.id,...answers[r.id],reviewed:!!(answers[r.id]?.label!==''&&answers[r.id]?.reason?.trim())}))};const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='semantic-encoder-real-human-answers.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};persist();</script></html>'''
    (R/'review.html').write_text(page.replace('PAYLOAD',payload),encoding='utf8')
    e.save(R/'prepared.json',{'review_inputs_sha256':e.p.digest(R/'review-inputs.json'),'review_html_sha256':e.p.digest(R/'review.html')});e.log(audit)

def infer(name):
    import psutil
    assert (R/'prepared.json').exists(),'Freeze blind review before seeing predictions'
    dest=R/name;dest.mkdir(exist_ok=False);e.torch.set_num_threads(8)
    candidates=e.read(e.R/'research-candidates.json')['models'];folder=Path(candidates[name]['folder'])
    assert e.p.digest(folder/'model.safetensors')==candidates[name]['sha256']
    data=e.read(R/'inputs.json');assert e.p.digest(R/'inputs.json')==e.read(R/'review-manifest.json')['input_sha256']
    start=time.perf_counter();tok=e.p.AutoTokenizer.from_pretrained(folder,local_files_only=True);model=e.p.AutoModelForSequenceClassification.from_pretrained(folder,local_files_only=True).to('cpu');load=time.perf_counter()-start
    start=time.perf_counter();enc,stats=e.encode(tok,data,512);encoding=time.perf_counter()-start
    truncated=set(stats['truncated_ids']);e.probabilities(model,tok,enc[:8],'cpu')
    probs,sec=e.probabilities(model,tok,enc,'cpu')
    output=[]
    for row,pr in zip(data,probs,strict=True):
        reason=['token_limit'] if row['id'] in truncated else []
        if row['collection_truncated']:reason.append('collection_context_truncated')
        output.append(dict(id=row['id'],p_ad=pr,raw_prediction=int(pr>=.5),safe_prediction=None if reason else int(pr>=.5),guard=reason,
            confidence_prediction=None if reason or .2<pr<.8 else int(pr>=.5)))
    e.save(dest/'predictions.json',output)
    result=dict(model=name,rows=len(data),load_seconds=load,tokenization_seconds=encoding,inference_seconds=sec,threads=8,batch=8,dtype='FP32',
        memory=psutil.Process().memory_info()._asdict(),lengths=stats,guarded=sum(bool(r['guard']) for r in output),
        raw_positive=sum(r['raw_prediction']==1 for r in output),safe_positive=sum(r['safe_prediction']==1 for r in output),
        model_sha256=candidates[name]['sha256'],input_sha256=e.p.digest(R/'inputs.json'),script_sha256=e.p.digest(__file__),labels_used=False)
    e.save(dest/'result.json',result);e.log({k:x for k,x in result.items() if k not in ('memory','lengths')})

if __name__=='__main__':
    cli=argparse.ArgumentParser();cli.add_argument('action',choices=['prepare','klue','kc','ko']);a=cli.parse_args()
    prepare() if a.action=='prepare' else infer(a.action)
