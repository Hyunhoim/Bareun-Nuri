"""Curate observed source elements, with provisional labels outside model inputs."""
import collections,hashlib,html,importlib.util,json,re,unicodedata
from pathlib import Path
from urllib.parse import urlparse
s=importlib.util.spec_from_file_location('e',Path(__file__).with_name('semantic-encoder.py'))
e=importlib.util.module_from_spec(s);s.loader.exec_module(e)
R=Path('local-benchmark/real-context-supplement-v1')
SOURCES={'new':Path('.runtime/semantic-real-training-v1'),'known':Path('.runtime/semantic-real-recapture-v1')}
# IDs select evidence for annotation only; they never enter an inference rule.
CHOICES=[
 ('new','eec648f30e81254080e9aaa2',0,'PREVENTION','온라인 구매 성공이라는 표현을 부작용 경고와 구매 억제 포스터가 설명한다. 실제 구매 권유가 아니다.'),
 ('new','793bc7fcd2ac98631d20e796',0,'EDUCATION','의약품 안전관리 정책 설명회와 질의응답 자료 제공이다.'),
 ('new','3496fb9570a14566caf3db30',0,'PREVENTION','불법 구인광고 삭제 및 구직자 보호 대책을 설명하는 기관 해명이다.'),
 ('new','625d37d5751d0f9753a98036',0,'PUBLIC_SUPPORT','음식점 상호의 마약 용어를 바꾸도록 지원하는 안내이며 약물 판매가 아니다.'),
 ('new','addc663d719a5b37696e5f85',0,'BOOK_INFORMATION','마약 문제를 해설하는 도서 소개로, 약물 구매를 연결하는 글이 아니다.'),
 ('known','c91785b06eb8a93f01dd6375',1,'GAMBLING','피해 예방 설명을 곁들였지만 자기 제휴 베팅 환경과 이용을 권유한다.'),
 ('known','215f8a14a1ad4e5842ff15ed',None,'ADULT_PROMOTION_REVIEW','성인 영상 이용과 본인인증 생략을 홍보하지만 이 수집 입력만으로 영상의 위법 범위를 확정하지 않는다. 광고 의도와 불법성을 구분해 검수한다.'),
 ('known','f556c156538678eac93f4f7c',1,'DRUG_SALES','약물 품목과 판매자 연락 수단을 제시하며 직접 연결을 권유한다. 예방 인용이 아니다.'),
 ('known','278a75c083da588e84e99509',1,'CARD_CASHING','설명 형식으로 카드깡 서비스를 직접 소개하고 상담을 권유한다. 합법 업체라는 자기주장을 검증된 사실로 취급하지 않는다.'),
 ('known','0a120544633db1afb66c67b3',1,'GAMBLING','자기 서비스의 입출금과 배팅 이용을 직접 권유한다.'),
 ('known','28b531856a1496cb406b7a30',1,'GAMBLING','실제 베팅 서비스가 제약 없음을 장점으로 내세워 이용을 홍보한다.'),
 ('known','fc6036203aa0877c47711bdf',1,'GAMBLING','토토 서비스의 가입 추천과 충전 보상을 권유한다.'),
 ('known','de30a96eca90438be8c803af',1,'CARD_CASHING','카드깡을 자기 서비스로 명시하고 신용카드 한도의 현금 이용을 권유한다.'),
 ('known','d3a8663da3bde94aaf964678',None,'ACCOUNT_INFORMATION_REVIEW','계좌 정보 매입을 설명하나 수집된 대상과 짧은 문맥만으로 거래 범위와 위법성을 확정하기 어렵다.'),
 ('known','bb20743745b8f8c55186d70c',None,'INSUFFICIENT_CONTEXT','자기 업체를 홍보하지만 이 요소 입력에는 어떤 상품이나 행위인지 충분히 나타나지 않는다.'),
 ('known','149e717540063d2c1fc26971',None,'INSUFFICIENT_CONTEXT','출석 포인트 보상과 서비스명만으로 불법 서비스인지 확정하지 않는다. 다른 요소의 베팅 설명을 추가하지 않는다.'),
 ('known','8a6ad9b736eea40e253ef5f7',0,'BOARD_POLICY','게시물 삭제 기준에 광고/음란물/범죄를 열거한 게시판 운영 안내다.'),
 ('known','514a9d412a1de7dc4a385238',0,'SHOP_PAYMENT_HELP','일반 쇼핑몰의 결제창 이용 안내다. 다른 게시물의 광고를 여기에 귀속하지 않는다.'),
 ('known','59317d1b348fc6a35c4c3c74',0,'SHOP_OPERATOR_INFORMATION','일반 쇼핑몰 사업자/고객지원 정보다. 게시판에 삽입된 광고와 대상의 역할이 다르다.')
]

def main():
    assert not R.exists();R.mkdir();allrows={};hashes={}
    for name,root in SOURCES.items():
        assert e.p.digest(root/'inputs.json')==e.read(root/'captured.json')['inputs_sha256']
        for f,h in e.read(root/'manifest.json')['hashes'].items():assert e.p.digest(f)==h
        for item in e.read(root/'capture.json'):
            if 'file' in item:assert e.p.digest(root/item['file'])==item['sha256']
        allrows[name]={r['id']:r for r in e.read(root/'inputs.json')};hashes[str(root/'inputs.json')]=e.p.digest(root/'inputs.json')
    train=e.v.readl(e.TRAIN);dev=e.v.readl(e.v.ROOT/'inputs.jsonl');observed=e.read('.runtime/semantic-encoder-real-v1/review-inputs.json')
    observed_hosts={urlparse(r['url']).hostname for r in observed};trainkeys={e.v.canonical(r['input']) for r in train};devkeys={e.v.canonical(r['input']) for r in dev};observedkeys={e.v.canonical(r['input']) for r in observed}
    selected=[]
    for source,id,label,category,reason in CHOICES:
        row=dict(allrows[source][id]);assert urlparse(row['url']).hostname not in observed_hosts
        key=e.v.canonical(row['input']);assert key not in devkeys|observedkeys
        snap=e.read(SOURCES[source]/row['snapshot']);node=next(c for c in snap['candidates'] if c['node_id']==row['node_id'])
        assert row['raw']==node['raw_text'] and row['selector']==node['selector'] and row['location']==node['location']
        row.update(source_dataset=str(SOURCES[source]),proposed_label=label,category=category,annotation_reason=reason,annotation_status='assistant_provisional',human_reviewed=False,
            legal_status='not_adjudicated',rights_status='unverified_third_party_content',purpose='training_candidate_not_holdout',eligible_for_training=False,
            known_training_source=source=='known',exact_training_input_overlap=key in trainkeys,group_id=row.get('family_id','source:'+row['url']))
        if category in ['BOARD_POLICY','SHOP_PAYMENT_HELP','SHOP_OPERATOR_INFORMATION']:row['group_id']='site-common:'+urlparse(row['url']).hostname
        selected.append(row)
    assert len({e.v.canonical(r['input']) for r in selected})==len(selected)
    # Only tokenizers are loaded. No classifier prediction or paid API is used.
    candidates=e.read(e.R/'research-candidates.json')['models']
    for name,c in candidates.items():
        tok=e.p.AutoTokenizer.from_pretrained(c['folder'],local_files_only=True);_,stats=e.encode(tok,selected,512);limited=set(stats['truncated_ids'])
        for row in selected:row.setdefault('input_guards',{})[name]=(['token_limit'] if row['id'] in limited else [])+(['collection_context_truncated'] if row['collection_truncated'] else [])
    def grams(text):
        t=e.v.canonical(text);return {t[i:i+5] for i in range(max(0,len(t)-4))}
    comparison=[('development',r) for r in dev]+[('observed_real',r) for r in observed];near=[]
    for row in selected:
        a=grams(row['input']);scores=[]
        for scope,ref in comparison:
            b=grams(ref['input']);scores.append((len(a&b)/max(1,len(a|b)),scope,ref['id']))
        score,scope,id=max(scores);near.append(dict(id=row['id'],max_char5_jaccard=score,nearest_scope=scope,nearest_id=id))
    (R/'candidates.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in selected),encoding='utf8')
    public=[{k:r[k] for k in ['id','input','raw','url','selector','location','source_dataset','snapshot']} for r in selected];e.save(R/'review-inputs.json',public)
    cards=[]
    for i,r in enumerate(public):
        cards.append('<article><h2>'+str(i+1)+'</h2><small>'+html.escape(r['id']+' | '+r['url'])+'</small><h3>대상</h3><pre>'+html.escape(r['input']['target'])+'</pre><h3>실제 수집 문맥</h3><pre>'+html.escape(r['input']['context'])+'</pre><details><summary>원문 및 위치</summary><pre>'+html.escape(r['raw']+'\n'+r['selector'])+'</pre></details></article>')
    (R/'review.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><title>실제 학습 후보 검수</title><style>body{max-width:1000px;margin:30px auto;padding:20px;font:16px/1.6 system-ui;color:#17283c;background:#f3f5f8}article{background:white;padding:24px;margin:24px 0;border:1px solid #ddd}pre,small{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>실제 학습 후보19개</h1><p>모든 정답은 미검수입니다. 모델 예측과 잠정 라벨은 표시하지 않습니다. 대상과 문맥의 권유 행위 및 불법성 근거를 구분하고, 부족하면 보류하세요. 이전 평가31개와 별도 자료입니다. 광고 목적지에 방문할 필요가 없습니다.</p>'+''.join(cards)+'</html>',encoding='utf8')
    e.save(R/'human-answers-template.json',{r['id']:dict(label=None,reason='',reviewed=False) for r in selected})
    summary=dict(rows=len(selected),provisional_labels=dict(collections.Counter(str(r['proposed_label']) for r in selected)),groups=len({r['group_id'] for r in selected}),
        new_source_rows=sum(not r['known_training_source'] for r in selected),known_training_source_rows=sum(r['known_training_source'] for r in selected),
        exact_training_input_overlaps=sum(r['exact_training_input_overlap'] for r in selected),development_overlap=0,observed_real_overlap=0,observed_real_host_overlap=0,
        guard_counts={name:sum(bool(r['input_guards'][name]) for r in selected) for name in candidates},near_overlap=near,
        eligible_for_training=0,new_human_labels=0,model_predictions=0,api_calls=0,source_hashes=hashes,
        outputs={f.name:e.p.digest(f) for f in R.glob('*') if f.is_file()},script_sha256=e.p.digest(__file__))
    e.save(R/'manifest.json',summary);e.log({k:v for k,v in summary.items() if k not in ['near_overlap','outputs','source_hashes']})

if __name__=='__main__':main()
