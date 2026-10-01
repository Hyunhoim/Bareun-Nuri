"""Save manually read assistant annotations, preserving their actual provenance."""
import collections,hashlib,html,json
from pathlib import Path
ROOT=Path('local-benchmark/semantic-review-assistant-v1')
SOURCE=Path('local-benchmark/semantic-review-queue-v1/review-inputs.json')
EXPECTED='bfdce88df2147150ca9d8699cd4fb36bc1e1fadfc6aa9f8933846ebd6caa444b'
# Annotation table for a frozen dataset, not an inference rule or model feature.
# n | label | category | explanation | literal evidence anchor in target/context
ANNOTATIONS='''1|1|GAMBLING_PROMOTION|슬롯 서비스의 검증·인기·당첨 가능성을 장점으로 내세우고 이용 주소를 반복 제공한다. 설명문 형식이지만 서비스 이용을 유도하는 대상이다.|인기있는 슬롯사이트를 소개합니다.
2|0|CRIME_REPORT|필로폰 판매책 검거를 알리는 보도 문장이다. 판매 주체를 수사 대상으로 서술하며 독자에게 구매를 권하지 않는다.|검거했다고 밝혔다.
3|0|PREVENTION|관계자의 마약 밀반입 차단 방침을 인용한다. 주변 문맥도 검거·수사이며 약물 거래 권유가 아니다.|밀반입을 원천차단
4|uncertain|LINK_DESTINATION_UNKNOWN|별명에 관한 영문 문장과 블로그 URL뿐이다. 무관한 링크 스팸은 의심되지만 저장 입력에 도박 등 불법 서비스의 대상·권유 근거가 없다.|nickname you choose.
5|0|CRIME_REPORT|마약 공급책의 검거와 구속 송치를 설명하는 보도다. 마약류 언급은 수사 경위에 속한다.|전원 구속 송치했다.
6|uncertain|TRUNCATED_SERVICE_NAME|영어 회화 연습 문구 뒤에 온라인포라는 불완전한 링크명이 붙었다. 주소 경로만 보고 포커·도박 서비스로 복원하지 않는다.|온라인포
7|0|INVESTIGATION_POLICY|약물 공급·판매·구매 관련자를 추적하겠다는 수사 방침이다. 거래를 권유하거나 판매자 연락을 제공하지 않는다.|추적, 검거해 일벌백계
8|0|AGRICULTURAL_ADVICE|난황유 제조 과정의 혼합 실패와 개선 경험을 공유한다. 상품 판매나 불법 거래로 연결하는 권유는 없다.|난황유는 제조해서
9|uncertain|LINK_DESTINATION_UNKNOWN|첫 만남의 외모에 대한 영문 비유와 gamer 링크가 있을 뿐이다. 스팸 가능성과 별개로 불법 서비스 목적을 확인할 정보가 부족하다.|gamer
10|1|GAMBLING_LINK_PROMOTION|카지노·바카라·온라인 도박 사이트 주소를 추천·안전성 표현과 함께 반복 노출한다. 보도나 피해 신고 문맥 없이 접속을 유도하는 링크 광고다.|카지노사이트 추천
11|uncertain|AUTHOR_NAME_NOT_TARGET|본문은 마케팅·블로그 관련 영문과 불명확한 URL이다. 앞 문맥의 카지노 표기를 대상 문구의 불법 권유로 곧바로 옮길 수 없어 보류한다.|know your marketing
12|1|BENIGN_PREFIX_GAMBLING|청소년 상담 봉사에 관한 정상 서두 뒤에 사설 토토 사이트 추천 링크를 붙였다. 서두가 정상이어도 대상 안의 실제 베팅 서비스 홍보는 남는다.|사설토토
13|0|EDUCATION_EVENT|성상담 실무자의 교육·예방 워크숍 모집이다. 성매매·성관계 등의 어휘와 참가비·입금계좌는 교육 프로그램의 내용과 접수 절차에 속한다.|청소년 현장 실무자들의 성상담 기법 트레이닝
14|0|AGRICULTURAL_OPINION|안전한 먹거리와 친환경 농업을 위한 노력을 독려한다. 불법 서비스나 거래를 권유하지 않는다.|안전한 먹거리 생산
15|uncertain|AUTHOR_NAME_NOT_TARGET|영어 수업 다운로드를 권하는 영문과 목적이 불분명한 링크다. 앞 문맥에 카지노 이름이 있어 의심되지만 대상·링크의 불법 목적을 독립적으로 확정하기 어렵다.|Improve your English speaking
16|0|AGRICULTURAL_ADVICE|한지창호지와 접착력을 이용한 해충 유입 방지 방법을 설명한다. 구매처 홍보나 불법 거래 유도가 없다.|한지창호지가 접착력이 더 있어
17|1|BENIGN_PREFIX_GAMBLING|그림·블로그에 관한 영문 뒤에 스포츠토토사이트라는 목적이 명시된 링크를 배치했다. 무관한 서두와 별개로 베팅 사이트 접속을 홍보한다.|스포츠토토사이트
18|1|GAMBLING_PLATFORM_PROMOTION|특정 온라인 홀덤 서비스를 업계 상위·검증된 안전 사이트라고 반복 소개하고 접속 주소를 제공한다. 게임 일반 설명이나 교육이 아닌 플랫폼 이용 홍보다.|온라인홀덤 안전사이트를 소개
19|0|CRIME_REPORT|피의자들의 필로폰·야바 판매·투약 혐의를 설명하는 검거 보도다. 독자에게 이용을 권하는 발화가 아니다.|판매·투약해 온 것으로 밝혀졌다.
20|1|GAMBLING_LINK_PROMOTION|여러 카지노와 바카라 이름을 실제 접속 링크의 표제로 나열한다. 예방·인용 설명 없이 도박 서비스로 트래픽을 유도하는 대상이다.|바카라사이트
21|0|AGRICULTURAL_ENCOURAGEMENT|친환경 먹거리 생산을 응원하는 댓글이다. 홍보 대상이나 불법 이용 권유가 없다.|좋은 결과 있으시길 응원합니다.
22|1|BENIGN_SUFFIX_GAMBLING|토토 사이트·안전놀이터 링크를 반복 배치한 뒤 노랫말을 붙였다. 뒤의 일반 문구가 앞의 도박 사이트 홍보를 없애지 않는다.|오래된 토토사이트
23|1|GAMBLING_PLATFORM_PROMOTION|머니 이동·베팅 무제재·쿠폰을 장점으로 내세우고 특정 카지노 이용을 직접 권한다. 목적이 명확한 도박 서비스 광고다.|우리카지노에서 기적을 노리세요
24|uncertain|LINK_DESTINATION_UNKNOWN|짧은 영문과 URL만 있어 어떤 상품·행위를 권하는지 불명확하다. 작성자 표기의 일부 단어만으로 도박 광고를 확정하지 않는다.|First-rate An orderly paper
25|0|AGRICULTURAL_ENCOURAGEMENT|해충 퇴치와 친환경 농사의 노고를 격려하는 댓글이다. 사업 번창이라는 인사만으로 광고가 되지 않는다.|친환경농사 자부심이 대단하고
26|0|AGRICULTURAL_EXPERIENCE|농가 문제 해결 결과를 공유하겠다는 경험담이다. 불법 상품이나 사이트 이용 권유는 없다.|무화과농가
27|1|GAMBLING_LINK_PROMOTION|토토 사이트와 안전놀이터 표기를 접속 주소와 반복 결합한다. 단순 도메인 언급이 아니라 베팅 서비스 홍보용 목록이다.|토토사이트
28|1|OBFUSCATED_GAMBLING_PROMOTION|소프트하이픈으로 쪼개진 카지노·바카라·슬롯사이트 명칭과 동일 주소를 반복한다. 커뮤니티·검증 표현을 섞었지만 대상은 도박 관련 접속 유도 목록이다.|온­라인­카지­노
29|0|INVESTIGATION_POLICY|마약수사 전담요원과 탐지 장비 확충을 설명한다. 마약 관련 용어는 단속 역량 강화의 대상이다.|마약수사 전담요원을 배치
30|1|GAMBLING_LINK_PROMOTION|카지노·바카라·슬롯 추천 문구와 목적 URL을 대량 반복한다. 중계 URL 형식과 긴 목록은 근거의 표기 방식이며 실제 대상은 도박 사이트 접속 홍보다.|안전한 카지노사이트 추천
31|uncertain|LINK_DESTINATION_UNKNOWN|블로그 댓글의 프로필 이미지에 관한 영문 뒤에 블로그 주소가 붙었다. 홍보성 스팸은 의심되나 불법 상품·서비스 근거는 입력에 없다.|blog comments
32|0|PREVENTION|온라인 의약품 구매 성공이라는 문구를 부작용 경고의 반어적 예시로 사용한다. 전체 대상은 구매 억제 홍보물이며 판매 광고가 아니다.|의약품 온라인 구매 NO!
33|0|POLICY_EDUCATION|의약품 안전관리 정책설명회와 질의응답 자료 제공 안내다. 의약품 거래나 구매를 유도하지 않는다.|정책설명회 자료 및 질의응답집
34|0|PREVENTION_POLICY|성매매성 불법 구인광고의 점검·삭제와 구직자 보호를 설명한다. 관련 기사를 인용한 부분도 정책 대응의 근거다.|의심 광고에 대해서는 지도·점검
35|0|PUBLIC_SUPPORT|음식점 상호의 마약류 표현을 바꾸는 간판·메뉴판 지원 사업이다. 금액과 신청 절차는 공공 지원이며 약물 판매가 아니다.|간판 변경 비용을 지원
36|0|BOOK_INFORMATION|마약 확산·정책·중독 대응을 다루는 도서 소개다. 약물 이름과 생산·판매 과정은 분석 대상이며 실제 약물 구매를 권하지 않는다.|마약 해설서
37|1|PREVENTION_DISGUISED_GAMBLING|먹튀 위험을 경고한 뒤 자기 추천망의 베팅·환전·가입 코드와 접속을 적극 권한다. 예방 서술이 자기 도박 서비스의 이용 권유를 정당화하는 구조다.|깔끔한 스포츠 베팅을 경험해 보세요.
38|uncertain|ADULT_PROMOTION_LEGALITY_UNRESOLVED|성인 영상 서비스 홍보 의도는 분명하고 인증 생략·우회 주소도 내세운다. 다만 저장 문구만으로 제공 영상의 위법 범위까지 확인하지 못해 불법광고 이진 정답은 보류한다. 합법 주장 역시 사실로 인정하지 않는다.|귀찮은 본인인증 100% 생략
39|1|DRUG_SALES|약물 품목·판매 가능 지역·판매자 연결 수단을 제시하며 즉시 연결을 권한다. 보도나 피해 경험이 아닌 직접 판매 유도다.|망설이지 말고 바로 연결하세요.
40|1|CARD_CASHING_PROMOTION|카드깡을 자기 업체의 서비스로 명시하고 한도 현금화 조건과 상담 연락을 홍보한다. 합법·인증 업체라는 자기주장 때문에 일반 정보로 바꾸지 않는다.|카드현금화(카드깡) 인증 업체
41|1|GAMBLING_PLATFORM_PROMOTION|자기 서비스의 보증금·안전성·입출금을 내세워 실제 베팅 경험을 권한다. 예방 또는 피해 신고가 아니다.|자유로운 배팅을 경험해 보세요.
42|1|GAMBLING_PLATFORM_PROMOTION|카지노·슬롯 등의 베팅 방식에 제재가 없다는 점을 자기 서비스의 장점으로 홍보한다. 이용 조건을 강조하는 광고 발화다.|강력한 무제재 환경을 보장
43|1|GAMBLING_REFERRAL|특정 토토 서비스 가입코드와 지인 초대·충전에 따른 보상을 안내한다. 실제 가입과 이용 확대를 직접 유도한다.|리워드 및 추천 보너스
44|1|CARD_CASHING_PROMOTION|카드깡 서비스와 카드 한도의 현금 이용을 직접 권하고 빠른 처리·낮은 수수료를 내세운다. 일반 카드 결제 안내와 구분된다.|24시 카드깡 서비스
45|uncertain|ACCOUNT_DATA_PURPOSE_UNCLEAR|사이트 측 입금 계좌 정보의 매입과 보안을 설명한다. 본인 계좌 양도인지 제보 정보 거래인지 등 대상·행위 범위가 불명확해 위법 거래로 단정하지 않는다.|사이트 측의 입금 계좌 정보
46|uncertain|MISSING_PRODUCT_CONTEXT|자기 업체의 안전성을 홍보하지만 어떤 상품·서비스를 거래하는지 대상과 수집 문맥에 없다. 다른 요소의 정보를 보충해 불법으로 정하지 않는다.|하지만 저희는 다릅니다.
47|uncertain|MISSING_PRODUCT_CONTEXT|출석 포인트와 개근 보너스라는 홍보는 확인된다. 이 입력만으로 보상 대상이 도박 서비스인지 일반 회원 서비스인지 특정할 수 없다.|매일 출석체크만 해도 포인트
48|0|BOARD_POLICY|광고·음란물·범죄 관련 게시물 등의 삭제 기준을 열거한 운영 안내다. 금지하는 내용을 실제 권유로 오인하지 않는다.|게시물의 삭제 또는 비공개 대상
49|0|PAYMENT_HELP|쇼핑몰 결제 완료 전 창을 닫지 말라는 일반 사용 안내다. 결제 언급만 있고 불법 상품의 구매 유도는 없다.|결제 완료 될 때 까지
50|0|OPERATOR_INFORMATION|일반 유아용품 쇼핑몰의 사업자·연락처 고지다. 별도 게시물에 있는 광고를 사이트 운영 정보에 전가하지 않는다.|통신판매신고번호
51|0|VICTIM_QUESTION|성매매 유도 사기 피해와 수사종결 이유를 문의한다. 메신저 응답 가능성은 피해 진술의 일부이며 독자에게 거래를 권하는 말이 아니다.|수사종결을 하는 이유가 궁금
52|0|VICTIM_REPORT|금전 지불·강요·업소 위치·URL을 언급하지만 전체 발화는 피해 호소와 신고다. 인용된 성적 제안이나 가해 주장 자체를 게시자의 광고로 보지 않는다.|너무 억울합니다.
53|0|PREVENTION_EVENT|성착취 문제를 논의하는 북콘서트 참여를 모집한다. 신청 링크와 연락처는 예방·교육 행사 참여를 위한 것이며 성매매 서비스 권유가 아니다.|성매매 뿌리뽑기
54|0|POLICY_OPINION|성매매 합법화에 관한 정책 의견이다. 특정 업소나 성매매 거래를 연결하지 않는다. 글의 통계·법률 주장이 사실인지와 광고 여부는 별개다.|성매매합법화 찬성합니다
55|1|GAMBLING_REFERRAL|사설 토토 사이트 추천과 특정 업체·추천코드를 제목에 명시한다. 정보 탐색 일반론이 아닌 가입 유도형 홍보다.|추천코드 KK14
56|1|GAMBLING_REFERRAL|가입 시 추천코드를 입력해야 충전 혜택을 받는다고 안내한다. 수집 문맥의 도박 서비스와 직접 이어지는 이용 유도다.|가입 시 추천코드
57|1|GAMBLING_BONUS|신규·반복 충전 보상과 롤링 조건을 자기 사이트의 이점으로 설명한다. 베팅 자금 투입을 유도하는 서비스 광고다.|시드 보존율을 자랑
58|1|GAMBLING_BONUS|첫 충전·매 충전 보상을 제시하고, 문맥의 제목이 특정 토토 사이트 추천코드와 연결한다. 문화 해설이라는 외피와 별개인 보상 홍보다.|신규첫충 50%
59|0|SEPARATE_NEIGHBOR_POST|대상은 별도 협회 협력 소식의 제목이다. 앞의 도박 제목과 페이지 제목은 주변 다른 내용이며 해당 대상이 베팅을 권하지 않는다.|협력방안 협의
60|0|SITE_FOOTER|협회 소개·개인정보·이메일 수집 거부 등의 공통 푸터다. 광고가 있는 페이지라도 운영 안내 자체를 광고로 판정하지 않는다.|개인정보처리방침
61|1|PROMOTIONAL_DISCLAIMER|본 리포트라는 자기지시로 같은 가입·보너스 홍보를 비권유 정보라고 포장한다. 문맥의 추천코드와 실제 권유가 분명해 광고를 정당화하는 면책 성분으로 판정한다. 면책 문구만의 문자적 부정으로 정상화하지 않는다.|본 리포트
62|1|INFORMATION_DISGUISED_PROMOTION|이 글이라는 자기지시가 특정 베팅 서비스·추천코드를 내건 제목과 연결된다. 별개 게시물이 아닌 동일 광고의 정보형 서두로 해석한다. 문화 해설 문장만 따로 떼면 정상일 수 있어 문맥 의존 경계 사례로 표시한다.|이 글은 특정 서비스를 추천'''

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def save(path,obj):Path(path).write_bytes(json.dumps(obj,ensure_ascii=False,indent=2).encode('utf8'))
def main():
    assert sha(SOURCE)==EXPECTED and not ROOT.exists()
    rows=json.loads(SOURCE.read_text(encoding='utf8'));answers=[]
    for line in ANNOTATIONS.splitlines():
        n,label,category,reason,anchor=line.split('|',4);n=int(n);r=rows[n-1]
        assert label in ('0','1','uncertain') and reason.strip()
        text=r['input']['target'];start=text.find(anchor);assert start>=0,(n,anchor)
        answers.append(dict(number=n,id=r['id'],purpose=r['purpose'],label=label,category=category,reason=reason,
            evidence={'target_spans':[{'start':start,'end':start+len(anchor)}],'uses_context':True},
            reviewed=True,reviewed_by='assistant',human_label_reviewed=False,
            boundary_case=n in [18,28,38,45,61,62],applies_to='full_stored_target_and_context',eligible_for_automatic_training=False))
    assert [x['number'] for x in answers]==list(range(1,63))
    assert len({x['id'] for x in answers})==62
    obj=dict(dataset='semantic-review-queue-v1',input_sha256=EXPECTED,reviewer='assistant',annotation_status='assistant_annotated_at_user_request',
        user_attestation={'read_all_items_reported':True,'individual_labels_supplied':False,'individual_rationales_supplied':False},
        independent_human_gold=False,model_predictions_consulted_this_pass=False,prior_context_exposure=True,legal_adjudication=False,
        label_schema={'1':'불법 서비스 이용·판매 유도 의심 광고의 의미 라벨','0':'대상에 불법 서비스 권유 없음; 일반 홍보·피해·예방·교육 포함','uncertain':'입력만으로 불법 대상·귀속을 확정하기 어려움'},
        answers=answers)
    ROOT.mkdir();save(ROOT/'answers.json',obj)
    counts=dict(collections.Counter(a['label'] for a in answers));splits={p:dict(collections.Counter(a['label'] for a in answers if a['purpose']==p)) for p in ['observed','training_candidate']}
    records=[]
    names={'1':'광고','0':'정상','uncertain':'근거 부족'}
    for a,r in zip(answers,rows,strict=True):
        assert a['id']==r['id']
        records.append('<article class="c'+a['label']+'"><h2>'+str(a['number'])+' · '+names[a['label']]+'</h2><small>'+html.escape(a['id']+' · '+('관찰 평가' if a['purpose']=='observed' else '훈련 후보'))+'</small><p>'+html.escape(a['reason'])+'</p><details><summary>원문·문맥 확인</summary><h3>대상</h3><pre>'+html.escape(r['input']['target'])+'</pre><h3>수집 문맥</h3><pre>'+html.escape(r['input']['context'])+'</pre></details></article>')
    page='<!doctype html><html lang="ko"><meta charset="utf-8"><title>62개 광고 판정 라벨과 근거</title><style>body{max-width:1050px;margin:28px auto;padding:16px;font:16px/1.6 system-ui;color:#17283c;background:#f5f7fa}article{padding:20px;background:white;border-left:5px solid #64748b;margin:18px 0}.c1{border-color:#c2410c}.c0{border-color:#15803d}.cuncertain{border-color:#a16207}pre,small{white-space:pre-wrap;overflow-wrap:anywhere}h2{font-size:20px;margin:0}summary{cursor:pointer}</style><h1>62개 광고 판정 라벨과 근거</h1><p>광고 '+str(counts.get('1',0))+' · 정상 '+str(counts.get('0',0))+' · 근거 부족 '+str(counts.get('uncertain',0))+'</p><p>사용자께서 전체를 읽었다고 말씀하셨고, 요청에 따라 AI가 개별 라벨·근거를 작성했습니다. 사람의 개별 라벨 확정이나 독립 정답셋으로 표기하지 않습니다. 대상과 실제 문맥을 함께 판정했으며 모델 예측은 이번 작성에서 조회하지 않았습니다.</p>'+''.join(records)+'</html>'
    (ROOT/'labels.html').write_bytes(page.encode('utf8'))
    save(ROOT/'audit.json',dict(passed=True,rows=62,labels=counts,by_purpose=splits,source_sha256=sha(SOURCE),answers_sha256=sha(ROOT/'answers.json'),html_sha256=sha(ROOT/'labels.html'),script_sha256=sha(__file__),unique_ids=62,nonempty_reasons=62,evidence_spans_found=62,human_gold_created=False,automatic_training=False))
    print(json.dumps({'rows':62,'labels':counts,'by_purpose':splits},ensure_ascii=False))
if __name__=='__main__':main()
