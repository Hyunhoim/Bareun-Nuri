// Synthetic ownership diagnostics. Gold labels are evaluator-only; no DOM collection is claimed.
// Collector links use {text,url} for descendant anchors only; a target anchor has links=[].
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function row(group, expected, raw, before = '', after = '', options = {}) {
  return {group, expected, raw, reading:raw, before, after, nearby:'', targetQuoted:false,
    targetTag:'p', scopeTag:'article', links:[], ...options};
}

const data = {
  dev: [
    row('metadata', false, '작성자: 바람개비', '', '무허가 경륜 도박에 돈을 거실 분은 제게 참가비를 보내세요.', {targetTag:'span', scopeTag:'div'}),
    row('metadata', false, '2026.08.03 14:20', '비동의 성인 녹화물을 유료 배송합니다.', '', {targetTag:'time', scopeTag:'li'}),
    row('metadata', false, '분류: 생활 나눔', '', '사설 숫자 도박의 유료 회원을 받습니다.', {targetTag:'dd', scopeTag:'section'}),
    row('metadata', false, '답글 목록', '', '', {targetTag:'span', scopeTag:'div', nearby:{after:'당사자 허락 없는 성인 동영상을 판매합니다.'}}),
    row('cta', true, '초대권 구입', '저희 무허가 경륜 도박장에 돈을 걸 분은 다음 링크에서 입장료를 내세요.', '', {targetTag:'a', scopeTag:'div'}),
    row('cta', true, '배송 요청', '비동의 성인 녹화물을 돈 받고 보내 드립니다. 결제한 구매자는 이 연결에서 신청하세요.', '', {targetTag:'a', scopeTag:'li'}),
    row('cta', true, '유료 회원 등록', '제가 여는 사설 숫자 도박의 참가 접수입니다.', '', {targetTag:'button', scopeTag:'section'}),
    row('cta', true, '주문서 작성', '당사자 허락 없는 성인 영상을 판매하는 제 게시물입니다.', '위 연결에서 구매 수량을 보내 주세요.', {targetTag:'a', scopeTag:'div'}),
    row('quote', true, '“현금을 걸고 사설 경주 도박에 들어오세요.”', '이 말 그대로 제가 운영하는 곳의 참가자를 구합니다.', '참가금을 제게 보내면 입장할 수 있습니다.', {targetTag:'blockquote', targetQuoted:true, scopeTag:'div'}),
    row('quote', false, '“현금을 걸고 사설 경주 도박에 들어오세요.”', '피해예방 교육에서 모집 수법을 보여 주는 사례입니다.', '이 권유에 응하거나 돈을 보내지 마세요.', {targetTag:'blockquote', targetQuoted:true, scopeTag:'div'}),
    row('quote', true, '“허락 없이 촬영한 성인 영상의 복사본을 팝니다.”', '거래 조건을 다시 인용합니다. 제가 직접 판매합니다.', '구입할 분은 개인 메시지를 주세요.', {targetTag:'q', targetQuoted:true, scopeTag:'p'}),
    row('quote', false, '“허락 없이 촬영한 성인 영상의 복사본을 팝니다.”', '수사자료에 첨부한 범죄 게시물 원문입니다.', '판매자를 신고한 기록이며 거래를 중개하지 않습니다.', {targetTag:'q', targetQuoted:true, scopeTag:'p'}),
    row('noun', true, '무허가 경륜 도박 참가권 판매', '개인 판매 목록입니다.', '계좌로 참가권 대금을 보내면 접속권을 드립니다.', {targetTag:'dt', scopeTag:'dl'}),
    row('noun', false, '무허가 경륜 도박 참가권 판매', '단속 통계의 위반 행위 항목입니다.', '이번 분기 적발 건수: 12건.', {targetTag:'dt', scopeTag:'dl'}),
    row('noun', true, '비동의 성인 영상 복사본 유료 배달', '제가 제공하는 상품입니다.', '구매 신청을 받습니다.', {targetTag:'td', scopeTag:'tr'}),
    row('noun', false, '비동의 성인 영상 복사본 유료 배달', '수강신청 목록: 디지털 범죄 사례 분석.', '수업에서 다룰 금지 거래의 명칭입니다.', {targetTag:'td', scopeTag:'tr'}),
    row('same_role', true, '사설 숫자 도박 가입비를 받고 회원을 모집합니다.', '', '', {targetTag:'span', scopeTag:'article', nearby:{before:'불법광고 발견 시 신고해 주세요.'}}),
    row('same_role', false, '숫자 카드로 배우는 어린이 수학 교실', '', '', {targetTag:'span', scopeTag:'article', nearby:{before:'사설 숫자 도박 가입비를 보내 주세요.'}}),
    row('same_role', true, '유출 성인 녹화물을 팝니다. 구매 문의를 남겨 주세요.', '', '', {targetTag:'a', scopeTag:'li'}),
    row('same_role', false, '마을 영화제 자원봉사 신청을 받습니다.', '', '', {targetTag:'a', scopeTag:'li'}),
    row('insufficient', null, '전용방 참가', '소개받은 분만 이용하는 곳입니다.', '', {targetTag:'a', scopeTag:'div'}),
    row('insufficient', null, '선납 금액 안내', '지난번에 말씀드린 건입니다.', '', {targetTag:'button', scopeTag:'section'}),
    row('insufficient', null, '비공개 묶음 구매', '확인하신 분은 연락 주세요.', '', {targetTag:'td', scopeTag:'tr'}),
    row('insufficient', null, '접속권 상담', '자세한 것은 따로 이야기합시다.', '', {targetTag:'p', scopeTag:'li'}),
  ],
  eval: [
    row('metadata', false, '글쓴이: 푸른나침반', '', '허가 없는 투견 베팅의 판돈을 받습니다. 유료로 참가하세요.', {targetTag:'strong', scopeTag:'li'}),
    row('metadata', false, '수정일 2026-07-11', '불법 촬영된 성인 사생활 자료를 돈 받고 제공합니다.', '', {targetTag:'small', scopeTag:'div'}),
    row('metadata', false, '게시판: 동네 소식', '', '불법 현금 마작장의 손님을 모집합니다.', {targetTag:'span', scopeTag:'article'}),
    row('metadata', false, '의견 3건', '', '', {targetTag:'h4', scopeTag:'section', nearby:{after:'동의 없이 유출된 성인 사생활 파일의 구독료를 받습니다.'}}),
    row('cta', true, '베팅 신청', '허가 없는 투견 도박을 운영합니다. 돈을 걸 분은 아래에서 참가를 신청하세요.', '', {targetTag:'a', scopeTag:'li'}),
    row('cta', true, '자료 구매하기', '불법 촬영된 성인 사생활 자료를 제공하는 유료 창구입니다.', '', {targetTag:'button', scopeTag:'div'}),
    row('cta', true, '자리 선점', '불법 현금 마작에 참여할 손님은 이 연결에서 판돈을 내고 예약하세요.', '', {targetTag:'a', scopeTag:'article'}),
    row('cta', true, '구독 대금 납부', '동의 없이 유출된 성인 사생활 파일을 정기 판매합니다.', '위 메뉴에서 제게 요금을 보내세요.', {targetTag:'a', scopeTag:'section'}),
    row('quote', true, '“불법 투견 도박에 판돈을 내고 합류하십시오.”', '우리 모임의 실제 초대 문구를 그대로 올립니다.', '제가 돈을 받아 참가 명단에 넣어 드립니다.', {targetTag:'q', targetQuoted:true, scopeTag:'span'}),
    row('quote', false, '“불법 투견 도박에 판돈을 내고 합류하십시오.”', '학교 신문이 보도한 불법 모집 메시지입니다.', '학생들에게 이 거래의 위험을 알리는 기사입니다.', {targetTag:'q', targetQuoted:true, scopeTag:'span'}),
    row('quote', true, '“불법 촬영된 성인 사생활 파일을 유료 제공합니다.”', '문의가 많아 제 판매 공지를 다시 옮겨 적습니다.', '파일 대금을 입금하면 받는 방법을 알려 드려요.', {targetTag:'blockquote', targetQuoted:true, scopeTag:'section'}),
    row('quote', false, '“불법 촬영된 성인 사생활 파일을 유료 제공합니다.”', '삭제 요청을 받은 글의 표현을 심의 문서에 인용합니다.', '판매 공지가 아니라 삭제 심의 대상의 기록입니다.', {targetTag:'blockquote', targetQuoted:true, scopeTag:'section'}),
    row('noun', true, '불법 현금 마작장 입장권 거래', '제가 올린 판매 물품명입니다.', '입장권 비용을 보내 주시면 위치를 안내합니다.', {targetTag:'th', scopeTag:'tr'}),
    row('noun', false, '불법 현금 마작장 입장권 거래', '법률 강의의 목차 항목입니다.', '불법 영업 중개의 처벌 사례를 공부합니다.', {targetTag:'th', scopeTag:'tr'}),
    row('noun', true, '유출 성인 사생활 파일 정기 구독', '제가 파는 상품의 이름입니다.', '구독료를 결제할 분을 찾습니다.', {targetTag:'dd', scopeTag:'dl'}),
    row('noun', false, '유출 성인 사생활 파일 정기 구독', '피해 지원 보고서의 유통 유형 분류입니다.', '피해 예방을 위해 조사한 범죄 형태를 뜻합니다.', {targetTag:'dd', scopeTag:'dl'}),
    row('same_role', true, '현금 마작장에 초대합니다. 불법 영업이지만 돈을 걸 수 있습니다.', '', '', {targetTag:'span', scopeTag:'div', nearby:{before:'도박 피해 예방 상담 주간입니다.'}}),
    row('same_role', false, '현금 대신 점수표를 쓰는 무료 보드게임 교실', '', '', {targetTag:'span', scopeTag:'div', nearby:{before:'불법 마작장에 입장료를 보내세요.'}}),
    row('same_role', true, '몰래 촬영된 성인 사생활 파일 구매자를 모집합니다.', '', '', {targetTag:'a', scopeTag:'article'}),
    row('same_role', false, '시민 영상제 상영작 해설 모임을 신청하세요.', '', '', {targetTag:'a', scopeTag:'article'}),
    row('insufficient', null, '별도 공간 입장', '미리 안내받은 분 대상입니다.', '', {targetTag:'button', scopeTag:'li'}),
    row('insufficient', null, '이용권 요금 문의', '어제 대화한 내용을 참고해 주세요.', '', {targetTag:'a', scopeTag:'article'}),
    row('insufficient', null, '자료 묶음 신청', '내용은 개별 연락으로만 알려 드립니다.', '', {targetTag:'dd', scopeTag:'dl'}),
    row('insufficient', null, '참여 금액 확인', '아시는 분에게만 설명하겠습니다.', '', {targetTag:'span', scopeTag:'section'}),
  ],
};

function buildPanel() {
  return Object.entries(data).flatMap(([split, rows]) => rows.map((r, i) => ({id:crypto.createHash('sha256').update(`attribution-next:${split}:${i}`).digest('hex').slice(0,16), split, ...r})));
}

if (require.main === module) {
  const rows = buildPanel();
  assert.equal(rows.length, 48);
  assert.equal(new Set(rows.map(r=>r.id)).size, 48);
  for (const split of ['dev','eval']) {
    const part = rows.filter(r=>r.split===split);
    assert.deepEqual([true,false,null].map(v=>part.filter(r=>r.expected===v).length), [10,10,4]);
    assert.equal(part.filter(r=>r.targetQuoted && r.expected===true).length,2);
    assert.equal(part.filter(r=>r.targetQuoted && r.expected===false).length,2);
    const roles=part.filter(r=>r.group==='same_role');
    assert.deepEqual(roles.map(r=>r.targetTag),['span','span','a','a']);
    assert.deepEqual(roles.map(r=>r.expected),[true,false,true,false]);
    for (const group of ['quote','noun']) {
      const pairs=part.filter(r=>r.group===group);
      for(let i=0;i<4;i+=2) { assert.equal(pairs[i].raw,pairs[i+1].raw);assert.notEqual(pairs[i].expected,pairs[i+1].expected);assert.equal(pairs[i].targetTag,pairs[i+1].targetTag); }
    }
  }
  assert(rows.every(r=>r.reading===r.raw));
  assert(rows.filter(r=>r.targetTag==='a').every(r=>r.links.length===0));
  console.log(JSON.stringify({cases:48,advertisements:20,normal:20,insufficient:8,checks:'passed'}));
}

module.exports = {buildPanel};
