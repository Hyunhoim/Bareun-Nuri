// Experiment only. Judge intent from attributable language; retain DOM observations separately.
const assert = require('node:assert/strict');
const { contract: priorContract, sources } = require('./semantic-intent-contract.cjs');

const SCOPE = `판정 단위는 원문에 등장하는 서비스가 아니라 이 위치에서 게시자가 수행하는 의사소통 행위다.
대상 원문과 그 대상을 직접 설명하는 앞뒤 문맥을 함께 읽는다. 위험한 서비스를 비판·보도·교육하기 위해 광고 문구를 재현한 것은 이용 권유가 아니다. 인용 안에 가입·송금 명령이 있어도 그것을 게시자의 권유와 동일시하지 않는다.
반대로 따옴표·blockquote·예방이라는 단어가 있다는 이유만으로 정상은 아니다. 인용을 이용해 실제 이용을 권하거나 연락·가입으로 유도하면 광고다.
문맥을 적용할 때 그 설명이 바로 이 대상을 가리키는지 확인한다. 다른 댓글·게시글의 경고는 현재 광고를 무효화하지 않고, 주변의 광고는 현재 정상 문장을 광고로 만들지 않는다. DOM상 가까움은 같은 작성자나 의도의 증명이 아니다.
짧은 버튼·링크 문구는 그것이 연결하는 서비스의 설명을 함께 판단하되 관계가 확인된 범위만 사용한다. 일반 인사·메뉴·명확한 공공 안내는 정상이다. 용도가 생략된 이용 유도 문구에서 불법 서비스인지 정상 서비스인지 가를 핵심 문맥이 없으면 uncertain이다.
최종 선택 전, (가) 대상 자체의 행위, (나) 그 대상에 귀속되는 설명, (다) 설명 속 인용과 실제 이용 유도의 차이를 점검한다. 검토 과정 전체를 출력하지 않고 reason_code와 실제 판단을 지지하는 evidence_ids만 낸다.
citation은 대상 인용과 이를 설명하는 문맥을 함께 근거로 삼는다. invitation은 현재 위치가 실제 이용을 권한다는 근거를 선택한다. information은 확인되는 정상 용도, insufficient는 현재 원문에서 확인되지 않는 핵심 내용을 기준으로 선택한다. 정답 사례·인접 후보의 판정을 재사용하지 않는다.`;

// Illustrations are written independently of evaluation sentences and are never scored.
const EXAMPLES = `다음은 문구를 외우기 위한 목록이 아니라 귀속 관계를 구분하는 예시다. 실제 입력의 내용으로 다시 판단한다.
1) 대상 t="비공식 배당 경기에 참가하려면 참가비를 송금하세요." 앞 설명 c0="수사 보고서에 수록된 모집 메시지를 아래에 옮깁니다. 송금하면 사기 피해를 당할 수 있습니다." → citation/benign, 근거 t와 c0. 위험한 권유 문장을 보고 목적으로 재현했다.
2) 같은 대상 t 앞에 "별도 이용자의 게시물"만 있고, 다른 댓글에만 범죄 예방 경고가 있다 → invitation/violation, 근거 t. 다른 사람이 쓴 경고는 이 모집 행위의 목적을 바꾸지 않는다.
3) 대상 t="비공식 배당 경기에 참가하려면 참가비를 송금하세요."가 따옴표 안에 있어도, 직접 설명 c0="위 서비스를 제가 운영합니다. 원하는 분은 지금 신청하세요." → invitation/violation, 근거 t와 c0. 인용 형식으로 실제 이용을 유도했다.
4) 대상 t="참여 신청"을 직접 설명하는 c0="도서관 낭독 모임 신청 버튼입니다." → information/benign, 근거 t와 c0.
5) 같은 대상 t="참여 신청"을 직접 설명하는 c0="허가 없이 운영하는 현금 배당 경기의 참가 창구입니다." → invitation/violation, 근거 t와 c0.
6) 대상 t="참여 신청"만 있고 어떤 서비스의 신청인지 보여주는 문맥·링크 목적 정보가 전혀 없다 → insufficient/uncertain, 근거 t. 생략된 용도를 상상하지 않는다.`;

function compactEvidence(c) {
  const list = sources(c), context = c.context_evidence;
  let i = 0, inserted = false;
  const passage = (context?.units || []).flatMap(unit => {
    if (unit.relation === 'target') {
      if (inserted) return [];
      inserted = true;
      return [{ id: 't', position: 'target', in_quote: context.target_quoted, field: 'target.raw_text' }];
    }
    if (typeof unit.text !== 'string') return [];
    return [{ ...list[++i], tag: unit.tag }];
  });
  if (!inserted) passage.push({ id: 't', position: 'target', field: 'target.raw_text' });
  return {
    node_id: c.node_id,
    source_ids: list.map(s => s.id),
    page_title: c.page_title,
    target: { raw_text: c.raw_text, normalized_text: c.normalized_text, tag: context?.target_tag || c.own_style?.tag, links: c.links },
    local_context: { boundary: context?.scope || null, boundary_is_authorship_proof: false,
      target_in_quote: context?.target_quoted ?? null, truncated: context?.truncated ?? null, passage },
    unscoped_nearby: c.nearby,
    frame_depth: c.frame_urls?.length || 0
  };
}

const methods = {
  scope: { hypothesis: 'Explicit speech-act and attribution instructions reduce literal interpretation of quoted invitations.', compact: false, examples: false },
  compact: { hypothesis: 'An ordered semantic passage reduces duplicate fields and DOM/style distraction without adding evidence.', compact: true, examples: false },
  contrast: { hypothesis: 'Contrasted communication examples clarify quotation, real solicitation and missing-purpose decisions.', compact: true, examples: true }
};

function contract(mode) {
  assert(Object.hasOwn(methods, mode), 'Unknown semantic experiment');
  const base = priorContract('S'), method = methods[mode];
  return {
    ...base,
    SYSTEM: base.SYSTEM + '\n' + SCOPE + (method.examples ? '\n' + EXAMPLES : ''),
    initialEvidence: method.compact ? compactEvidence : base.initialEvidence
  };
}

function check() {
  const c = { node_id: 'n', raw_text: '대상 원문', normalized_text: '대상 원문', frame_urls: [], nearby: { before: '범위 미확인 설명' }, links: [],
    page_title: '자료', own_style: { tag: 'span' }, signals: ['JAMO'],
    context_evidence: { scope: { tag: 'article' }, target_tag: 'span', target_quoted: true, truncated: false,
      units: [{ relation: 'before', text: '앞 설명', quoted: false }, { relation: 'target' }, { relation: 'after', text: '뒤 설명', quoted: false }] } };
  const before = JSON.stringify(c), compact = compactEvidence(c);
  assert.equal(JSON.stringify(c), before);
  assert.deepEqual(compact.source_ids, ['t', 'c0', 'c1']);
  assert.deepEqual(compact.local_context.passage.map(x => x.id), ['c0', 't', 'c1']);
  assert.equal(compact.target.raw_text, c.raw_text);
  assert.equal(compact.local_context.passage[0].text, '앞 설명');
  assert.equal(compact.local_context.passage[2].text, '뒤 설명');
  assert.equal(compact.local_context.boundary_is_authorship_proof, false);
  assert(!('signals' in compact));
  assert(!('own_style' in compact));
  assert.deepEqual(contract('scope').initialEvidence(c), priorContract('S').initialEvidence(c));
  assert.deepEqual(contract('compact').initialEvidence(c), contract('contrast').initialEvidence(c));
  for (const mode of Object.keys(methods)) {
    const x = contract(mode);
    const decision = { node_id: 'n', reason_code: 'citation', evidence_ids: ['t', 'c0'], ad_verdict: 'benign', needs_review: false };
    const got = x.validateModelDecisions([decision], [c])[0];
    assert.equal(got.is_violation, false);
    assert(got.reason.includes('앞 설명'));
    assert.throws(() => x.validateModelDecisions([{ ...decision, evidence_ids: ['other-candidate'] }], [c]));
    assert.throws(() => x.validateModelDecisions([{ ...decision, ad_verdict: 'violation' }], [c]));
    assert.deepEqual(x.modelItemSchema(['t', 'c0']), priorContract('S').modelItemSchema(['t', 'c0']));
  }
  assert.deepEqual(compactEvidence({ ...c, context_evidence: null }).source_ids, ['t']);
  assert.throws(() => contract('undefined-mode'));
  console.log('PASS semantic methods: stable source IDs/order, raw text preservation, unchanged output validation, no input mutation');
}

module.exports = { contract, compactEvidence, methods, check };
if (require.main === module) check();
