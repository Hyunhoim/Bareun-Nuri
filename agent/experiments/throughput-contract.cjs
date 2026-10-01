// Experiment only: preserve the act4 decision contract and complete request groups.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {contract: operatingContract} = require('../src/core/judgment.cjs');
const {fitBatch} = require('../src/core/request-budget.cjs');
const MAX_BATCH = 4;
const SAME_TARGET = '[판정대상 t 원문과 동일]';

function contract({compact = false} = {}) {
  const base = operatingContract();
  if (!compact) return base;
  return {...base,
    SYSTEM: base.SYSTEM + '\nnormalized_text가 "' + SAME_TARGET + '"이면 문자 복원 결과가 passage의 판정대상 t 원문과 정확히 같다는 참조 표시다.',
    initialEvidence(candidate) {
      const evidence = base.initialEvidence(candidate);
      if (typeof candidate.raw_text === 'string' && candidate.raw_text === candidate.normalized_text)
        evidence.normalized_text = SAME_TARGET;
      return evidence;
    }
  };
}

function settings() { return {batchSize: MAX_BATCH, maxTokens: 512}; }

function wrapSession(session, {contract: judgment = contract(), config, enabled = true,
  signal, deadlineAt, maxEntries = 256, log = () => {}} = {}) {
  assert(config && typeof config === 'object', 'Session config is required');
  assert(Number.isInteger(maxEntries) && maxEntries > 0, 'Positive cache bound required');
  const cache = new Map();
  const stats = {hits: 0, misses: 0, bypasses: 0, stored: 0, evicted: 0, rejected_results: 0};
  function keyFor(candidates) {
    if (candidates.length !== MAX_BATCH || new Set(candidates.map(c => c.node_id)).size !== MAX_BATCH) return null;
    const slots = candidates.map((c, i) => ({...c, node_id: 'slot_' + i}));
    // Full candidate equality deliberately includes URL, selector, context and style observations.
    // Hash only is kept; neither credentials nor full inputs are emitted as cache diagnostics.
    return createHash('sha256').update(JSON.stringify({config, SYSTEM: judgment.SYSTEM, JUDGE: judgment.JUDGE,
      schema: judgment.modelItemSchema(), promptJson: judgment.promptJson, formatRepair: judgment.formatRepair,
      candidates: slots, evidence: slots.map(c => judgment.initialEvidence(c))})).digest('hex');
  }
  function usable(result, candidates) {
    try {
      assert(Array.isArray(result) && result.length === candidates.length);
      const validated = judgment.validateModelDecisions(result.map(d => ({node_id: d.node_id, publication_act: d.publication_act})), candidates);
      assert.deepEqual(result, validated);
      return validated.every(d => !d.needs_review && d.raw_ad_verdict !== 'uncertain' && d.publication_act !== '판단불가');
    } catch { return false; }
  }
  return {
    get calls() { return session.calls; },
    get tracksRequests() { return session.tracksRequests; },
    get cacheStats() { return {...stats, entries: cache.size}; },
    fitBatch(candidates) { return fitBatch(candidates, config, judgment, MAX_BATCH); },
    async decide(candidates) {
      assert(Array.isArray(candidates) && candidates.length > 0 && candidates.length <= MAX_BATCH, 'act4 batch limit');
      const key = enabled ? keyFor(candidates) : null;
      if (key && cache.has(key)) {
        signal?.throwIfAborted();
        if (Number.isFinite(deadlineAt) && Date.now() >= deadlineAt) throw Error('Deadline reached before cached decision');
        stats.hits++;
        log({event: 'batch_cache_hit', candidates: candidates.length});
        return structuredClone(cache.get(key)).map((d, i) => ({...d, node_id: candidates[i].node_id}));
      }
      if (key) stats.misses++; else stats.bypasses++;
      // Pending promises are never cached/coalesced. Rejected requests are never retried here.
      const result = await session.decide(candidates);
      if (key && usable(result, candidates)) {
        const byId = new Map(result.map(d => [d.node_id, d]));
        if (!cache.has(key) && cache.size >= maxEntries) { cache.delete(cache.keys().next().value); stats.evicted++; }
        cache.set(key, structuredClone(candidates.map(c => byId.get(c.node_id))));
        stats.stored++;
      } else if (key) stats.rejected_results++;
      return result;
    }
  };
}

async function selfCheck() {
  const base = contract(), compact = contract({compact: true});
  const items = Array.from({length: 4}, (_, i) => ({node_id: 'n' + i, raw_text: '일반 설명 ' + i,
    normalized_text: '일반 설명 ' + i, page_title: '안내', url: 'https://example.test/page', selector: 'p:nth-child(' + (i + 1) + ')',
    links: [{text: '자료', url: 'https://example.test/data'}], nearby: '주변 문맥', signals: [],
    style: {opacity: '1'}, context_evidence: {scope: 'article', target_quoted: false, truncated: false,
      units: [{relation: 'before', text: '설명입니다.'}, {relation: 'target', text: '일반 설명 ' + i}]}}));
  const untouched = structuredClone(items);
  assert.deepEqual(contract(), base);
  for (const item of items) {
    const expected = base.initialEvidence(item); expected.normalized_text = SAME_TARGET;
    assert.deepEqual(compact.initialEvidence(item), expected);
  }
  const restored = {...items[0], normalized_text: '다르게 복원한 문장'};
  assert.deepEqual(compact.initialEvidence(restored), base.initialEvidence(restored));
  assert.deepEqual(compact.modelItemSchema(), base.modelItemSchema());
  assert.equal(compact.validateModelDecisions, base.validateModelDecisions);
  const cfg = {provider: 'hcx', model: 'HCX-007', reasoningEffort: 'none', temperature: 0,
    seed: 42, maxTokens: 512, tokensPerMinute: 52000};
  let action = '일반정보', fail = false, malformed = false;
  const fake = {calls: [], tracksRequests: true, async decide(batch) {
    this.calls.push({status: fail ? 'failed' : 'ok'});
    if (fail) throw Error('injected failure');
    const value = base.validateModelDecisions(batch.map(c => ({node_id: c.node_id, publication_act: action})), batch);
    return malformed ? value.map(d => ({...d, reason: ''})) : value.reverse();
  }};
  const wrapped = wrapSession(fake, {contract: compact, config: cfg});
  const first = await wrapped.decide(items);
  const renamed = items.map((c, i) => ({...c, node_id: 'new_' + i}));
  const hit = await wrapped.decide(renamed);
  assert.equal(fake.calls.length, 1); assert.equal(wrapped.cacheStats.hits, 1);
  assert.deepEqual(hit.map(d => d.node_id), renamed.map(c => c.node_id));
  assert.deepEqual(hit.map(d => d.reason), items.map(c => first.find(d => d.node_id === c.node_id).reason));
  hit[0].reason = 'mutated consumer result';
  assert.notEqual((await wrapped.decide(renamed))[0].reason, hit[0].reason);
  for (const changed of [items.map(c => ({...c, url: c.url + '/other'})),
    items.map(c => ({...c, style: {opacity: '0'}})), items.map(c => ({...c, selector: c.selector + ' span'})),
    items.map(c => ({...c, nearby: '다른 주변 문맥'})), [...items].reverse()]) {
    const before = fake.calls.length; await wrapped.decide(changed); assert.equal(fake.calls.length, before + 1);
  }
  cfg.seed = 43; let before = fake.calls.length;
  await wrapped.decide(items); assert.equal(fake.calls.length, before + 1);
  for (const mode of ['uncertain', 'failure', 'malformed']) {
    const isolated = wrapSession(fake, {contract: compact, config: cfg});
    action = mode === 'uncertain' ? '판단불가' : '일반정보'; fail = mode === 'failure'; malformed = mode === 'malformed';
    before = fake.calls.length;
    for (let i = 0; i < 2; i++) {
      if (fail) await assert.rejects(isolated.decide(items), /injected/); else await isolated.decide(items);
    }
    assert.equal(fake.calls.length, before + 2); assert.equal(isolated.cacheStats.entries, 0);
  }
  action = '일반정보'; fail = malformed = false;
  before = fake.calls.length; await wrapped.decide(items.slice(0, 3)); await wrapped.decide(items.slice(0, 3));
  assert.equal(fake.calls.length, before + 2);
  await assert.rejects(wrapped.decide([...items, items[0]]), /batch limit/);
  assert.equal(wrapped.calls, fake.calls); assert.equal(wrapped.tracksRequests, true);
  before = fake.calls.length;
  assert.deepEqual(await wrapped.fitBatch(items), items);
  assert.equal(fake.calls.length, before);
  assert.deepEqual(items, untouched);
  const aborter = new AbortController(); const canceled = wrapSession(fake, {contract: compact, config: cfg, signal: aborter.signal});
  await canceled.decide(items); aborter.abort(); await assert.rejects(canceled.decide(items));
  const bounded = wrapSession(fake, {contract: compact, config: cfg, maxEntries: 1});
  await bounded.decide(items); await bounded.decide([...items].reverse());
  assert.equal(bounded.cacheStats.entries, 1); assert.equal(bounded.cacheStats.evicted, 1);
  const pending = wrapSession(fake, {contract: compact, config: cfg});
  before = fake.calls.length;
  await Promise.all([pending.decide(items), pending.decide(items)]);
  assert.equal(fake.calls.length, before + 2, 'No in-flight coalescing');
  return {ok: true, api_calls: 0, batch: MAX_BATCH, compact_input_preserved: true,
    cache: 'complete four-item groups only; source/style/order/settings guarded; no uncertain/failure reuse'};
}

module.exports = {contract, settings, wrapSession, selfCheck, MAX_BATCH};
if (require.main === module) selfCheck().then(result => console.log(JSON.stringify(result))).catch(error => {console.error(error); process.exitCode = 1;});
