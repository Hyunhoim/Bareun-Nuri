// Diagnostic contracts only; the production classifier and observation code stay frozen.
const assert = require('node:assert/strict');
const { contract: baselineContract } = require('../src/core/judgment.cjs');

const methods = {
  baseline4: { factor: 'current contract', maxTokens: 3072 },
  role_scope: { factor: 'preserve target and context element roles', maxTokens: 3072 },
  scope_complete: { factor: 'remove service-category restriction', maxTokens: 3072 },
  output512: { factor: 'output reservation only', maxTokens: 512 }
};

function contract(mode) {
  assert(Object.hasOwn(methods, mode), 'Unknown replica intent method');
  const base = baselineContract();
  if (mode === 'role_scope') return {
    ...base,
    SYSTEM: base.SYSTEM + '\n대상의 요소 역할과 주변 문장의 관계를 함께 확인한다. 주변에 광고가 있다는 사실만으로 현재 대상이 권유하는 것은 아니다. 반대로 제목·작성자·링크·메뉴라는 역할만으로 정상으로 제외하지 않는다. DOM의 같은 범위는 같은 작성자나 의도를 보장하지 않는다.',
    initialEvidence(candidate) {
      let index = 0;
      return { ...base.initialEvidence(candidate),
        target_element: { tag: candidate.context_evidence?.target_tag || candidate.own_style?.tag },
        context_roles: (candidate.context_evidence?.units || []).filter(u => u.relation === 'target' || typeof u.text === 'string').map(u => ({
          source_id: u.relation === 'target' ? 't' : 'c' + index++, relation: u.relation, tag: u.tag, quoted: u.quoted
        })) };
    }
  };
  if (mode === 'scope_complete') {
    const from = '이용권유=도박·불법 성인물 서비스의 실제 이용·가입·입금을 유도함';
    assert(base.SYSTEM.includes(from), 'Baseline scope wording changed; review this experiment');
    return { ...base, SYSTEM: base.SYSTEM.replace(from,
      '이용권유=도박·불법 성인물 등 문맥에서 불법성이 확인되는 서비스의 실제 이용·거래·가입·입금을 유도함. 일반적인 상품·행사·공공서비스 홍보를 불법으로 가정하지 않음') };
  }
  return base;
}

function settings(mode) {
  assert(Object.hasOwn(methods, mode), 'Unknown replica intent method');
  return { batchSize: 4, maxTokens: methods[mode].maxTokens };
}

function selfCheck() {
  const c = { node_id: 'node', raw_text: '참여 안내', normalized_text: '참여 안내', page_title: '소식', links: [],
    own_style: { tag: 'a' }, nearby: { before: '범위 미확인 글' },
    context_evidence: { target_tag: 'a', target_quoted: false, scope: { tag: 'article' }, truncated: false,
      units: [{ relation: 'before', text: '행사 설명', tag: 'p', quoted: false }, { relation: 'target', tag: 'a', quoted: false }] } };
  const input = JSON.stringify(c), base = contract('baseline4');
  for (const mode of Object.keys(methods)) {
    const tested = contract(mode);
    assert.deepEqual(tested.modelItemSchema(), base.modelItemSchema());
    assert.equal(tested.validateModelDecisions, base.validateModelDecisions);
    assert.deepEqual(tested.validateModelDecisions([{ node_id: c.node_id, publication_act: '판단불가' }], [c]),
      base.validateModelDecisions([{ node_id: c.node_id, publication_act: '판단불가' }], [c]));
    assert.equal(tested.initialEvidence(c).passage, base.initialEvidence(c).passage);
    assert.equal(tested.promptJson, base.promptJson);
    assert.equal(tested.formatRepair, false);
  }
  assert.deepEqual(contract('output512'), base);
  assert.deepEqual(contract('scope_complete').initialEvidence(c), base.initialEvidence(c));
  assert.deepEqual(contract('role_scope').initialEvidence(c).context_roles.map(r => r.source_id), ['c0', 't']);
  assert.equal(settings('output512').maxTokens, 512);
  assert.equal(settings('baseline4').maxTokens, 3072);
  assert.equal(JSON.stringify(c), input);
  // Structural roles must never force a negative classification or discard the original target.
  for (const tag of ['nav', 'footer', 'a', 'h1', 'strong']) {
    const candidate = { ...c, context_evidence: { ...c.context_evidence, target_tag: tag } };
    assert.equal(contract('role_scope').validateModelDecisions([{ node_id: c.node_id, publication_act: '이용권유' }], [candidate])[0].is_violation, true);
    assert.equal(contract('role_scope').initialEvidence(candidate).passage, base.initialEvidence(candidate).passage);
  }
  assert.throws(() => contract('missing'));
  console.log('PASS: four bounded methods; output512 prompt unchanged; schema, validator, passage and input preserved');
}

module.exports = { methods, contract, settings, selfCheck };
if (require.main === module) selfCheck();
