"""Provisional, source-preserving training candidates; no model predictions."""
import collections,html,importlib.util,json
from pathlib import Path
from urllib.parse import urlparse
s=importlib.util.spec_from_file_location('previous',Path(__file__).with_name('semantic-real-training-prepare.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
e=p.e
ROOT=Path('local-benchmark/real-context-supplement-v2')
SOURCES={'primary':Path('.runtime/semantic-real-supplement2-v1'),'extra':Path('.runtime/semantic-real-supplement2-extra-v1')}
# Annotation selectors only; never model inputs or inference rules.
CHOICES=[
('primary','9634c8194d989cc565ba07c9',0,'VICTIM_QUESTION','피해금액과 신고 후 수사종결을 문의한다. 메신저 연락 가능성을 언급하지만 구매 권유가 아니다.'),
('primary','ba9d5eab0634fbec6dfb44a1',0,'VICTIM_REPORT','거래 금액·성적 행위·업소 주소·URL을 서술하나 강요와 피해를 호소하며 신고한다. 게시자의 주장 진위를 인증한 것은 아니다.'),
('primary','da343c057902f7d1173d3d75',0,'PREVENTION_EVENT','성매매 예방 북콘서트의 참여 신청을 권유한다. 신청 링크와 연락처는 불법 서비스 구매 권유가 아니다.'),
('primary','592c14a72a569cc65bef6c5b',0,'POLICY_OPINION','성매매 합법화에 관한 정책 의견이다. 특정 거래나 판매자 이용을 연결하지 않으며 게시자의 통계·법률 주장은 검증하지 않았다.'),
('extra','c774542dcc722907f0eca61a',1,'GAMBLING','사설 스포츠 베팅 사이트와 가입 추천코드를 직접 홍보하는 게시글 제목이다.'),
('extra','c3ddaf54ceb9953bf6fa7528',1,'GAMBLING','도박 가입 추천코드를 입력해야 보너스를 받는다고 권유한다. 문맥의 비권유 면책문만으로 정상화하지 않는다.'),
('extra','37869d613da0098487244e37',1,'GAMBLING','베팅 충전 혜택과 보상을 장점으로 제시하며 이용을 유도한다.'),
('extra','182e364e82163d8c994a6f67',1,'GAMBLING','문화 해설 형식의 게시글에 충전 보상 혜택을 직접 제시한다.'),
('extra','a5241e7f3aa1bde60494b761',0,'UNRELATED_NEIGHBOR','같은 페이지의 별도 협회 협력 소식 제목이다. 앞쪽 광고 및 페이지 제목을 이 대상의 광고 의도로 전가하지 않는다.'),
('extra','4a1ac3975aa378db8b1273ae',0,'SITE_FOOTER','협회 소개·개인정보·메일 안내 푸터로 광고 게시자의 권유와 별개다.'),
('extra','138a7d80c6027e9c066723e4',None,'DISCLAIMER_ATTRIBUTION','가입 권유 사이의 비권유 면책 문구다. 게시물 전체 광고성과 이 대상 단독의 제출 귀속을 구분해야 하므로 검수 전 이진 확정하지 않는다.'),
('extra','b89fd34ff3506ada9530b480',None,'EXPLANATION_ATTRIBUTION','대상은 문화 해설이라고 설명하지만 페이지 제목은 가입코드를 홍보한다. 다른 요소의 광고를 대상에 귀속할지 검수 필요하다.')]

def main():
    ROOT.mkdir(exist_ok=False);data={};hashes={};archived=[]
    for scope,root in SOURCES.items():
        assert e.p.digest(root/'inputs.json')==e.read(root/'captured.json')['inputs_sha256']
        for f,h in e.read(root/'manifest.json')['hashes'].items():
            actual=Path(f)
            if e.p.digest(actual)!=h:
                assert scope=='primary' and f=='docs/semantic-real-supplement2-plan.md'
                actual=root/'initial-plan.md';assert e.p.digest(actual)==h;archived.append(str(actual))
        for item in e.read(root/'capture.json'):
            if 'file' in item:assert e.p.digest(root/item['file'])==item['sha256']
        data[scope]={x['id']:x for x in e.read(root/'inputs.json')};hashes[str(root/'inputs.json')]=e.p.digest(root/'inputs.json')
    refs={'train':e.v.readl(e.TRAIN),'development':e.v.readl(e.v.ROOT/'inputs.jsonl'),'observed':e.read('.runtime/semantic-encoder-real-v1/review-inputs.json'),'previous_supplement':e.v.readl(Path('local-benchmark/real-context-supplement-v1/candidates.jsonl'))}
    keys={name:{e.v.canonical(x['input']) for x in rows} for name,rows in refs.items()}
    hosts={name:{urlparse(x.get('source_url') or x.get('url') or '').hostname for x in rows} for name,rows in refs.items()}
    def grams(x):
        a=e.v.canonical(x);return {a[i:i+5] for i in range(max(0,len(a)-4))}
    gramrefs=[(scope,row['id'],grams(row['input'])) for scope,rows in refs.items() for row in rows]
    selected=[]
    for scope,id,label,category,reason in CHOICES:
        x=dict(data[scope][id]);snap=e.read(SOURCES[scope]/x['snapshot']);node=next(c for c in snap['candidates'] if c['node_id']==x['node_id'])
        assert all(x[k]==node[v] for k,v in [('raw','raw_text'),('selector','selector'),('location','location')])
        canonical=e.v.canonical(x['input']);assert all(canonical not in values for values in keys.values())
        host=urlparse(x['url']).hostname;assert host not in hosts['observed']
        g=grams(x['input']);score,near_scope,near_id=max((len(g&a)/max(1,len(g|a)),n,j) for n,j,a in gramrefs)
        group='campaign:queenbee-kk14' if scope=='extra' and category not in ['UNRELATED_NEIGHBOR','SITE_FOOTER'] else ('site-common:'+host if category=='SITE_FOOTER' else 'source:'+x['url']+'#'+category)
        x.update(source_dataset=str(SOURCES[scope]),proposed_label=label,category=category,annotation_reason=reason,annotation_status='assistant_provisional',human_reviewed=False,eligible_for_training=False,legal_status='not_adjudicated',rights_status='unverified_third_party_content',purpose='training_candidate_not_holdout',group_id=group,source_host_overlap={n:host in hs for n,hs in hosts.items()},nearest_reference=dict(char5_jaccard=score,scope=near_scope,id=near_id))
        selected.append(x)
    assert len({e.v.canonical(x['input']) for x in selected})==len(selected)
    candidates=e.read(e.R/'research-candidates.json')['models']
    for name,c in candidates.items():
        tok=e.p.AutoTokenizer.from_pretrained(c['folder'],local_files_only=True);_,stats=e.encode(tok,selected,512);limited=set(stats['truncated_ids'])
        for x in selected:x.setdefault('input_guards',{})[name]=(['token_limit'] if x['id'] in limited else [])+(['collection_context_truncated'] if x['collection_truncated'] else [])
    (ROOT/'candidates.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in selected),encoding='utf8')
    public=[{k:x[k] for k in ['id','input','raw','url','selector','location','source_dataset','snapshot']} for x in selected];e.save(ROOT/'review-inputs.json',public)
    e.save(ROOT/'human-answers-template.json',{x['id']:dict(label=None,reason='',reviewed=False) for x in selected})
    cards=['<article><h2>'+str(i+1)+'</h2><small>'+html.escape(x['id']+' | '+x['url'])+'</small><h3>대상</h3><pre>'+html.escape(x['input']['target'])+'</pre><h3>실제 수집 문맥</h3><pre>'+html.escape(x['input']['context'])+'</pre><details><summary>원문·위치</summary><pre>'+html.escape(x['raw']+'\n'+x['selector'])+'</pre></details></article>' for i,x in enumerate(public)]
    (ROOT/'review.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><title>실제 문맥 검수 2차</title><style>body{max-width:1000px;margin:30px auto;padding:20px;font:16px/1.6 system-ui;background:#f3f5f8;color:#17283c}article{background:white;padding:24px;margin:24px 0;border:1px solid #ddd}pre,small{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>실제 문맥 검수 후보 12개</h1><p>모델 예측과 잠정 라벨은 표시하지 않습니다. 대상의 권유 행위와 주변 별개 글을 구분하세요. 정보가 부족하면 보류하세요. 게시자의 주장을 사실로 인증한 자료가 아닙니다. 광고 목적지를 방문할 필요가 없습니다.</p>'+''.join(cards)+'</html>',encoding='utf8')
    summary=dict(rows=len(selected),groups=len({x['group_id'] for x in selected}),provisional_labels=dict(collections.Counter(str(x['proposed_label']) for x in selected)),guard_counts={n:sum(bool(x['input_guards'][n]) for x in selected) for n in candidates},host_overlaps={n:sum(x['source_host_overlap'][n] for x in selected) for n in hosts},exact_overlaps={n:0 for n in keys},max_char5_jaccard=max(x['nearest_reference']['char5_jaccard'] for x in selected),model_predictions=0,api_calls=0,eligible_for_training=0,new_human_labels=0,source_hashes=hashes,archived_plan=archived,script_sha256=e.p.digest(__file__),outputs={f.name:e.p.digest(f) for f in ROOT.iterdir() if f.is_file()})
    e.save(ROOT/'manifest.json',summary);print(json.dumps(summary,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
