const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { configFromEnv, createSession, validateDecisions, validateModelDecisions, estimateRequestTokens } = require('./llm.cjs');
const { canonical, inScope, collect } = require('./collect.cjs');
const { normalizeText } = require('./jamo.cjs');
const { outputResult, runOne, reportHtml } = require('./run.cjs');
const pipeline = require('./architectures/pipeline.cjs');
const adaptive = require('./architectures/adaptive.cjs');
const specialists = require('./architectures/specialists.cjs');

async function main() {
  const checked = [];
  const wire = items => items.map(d => ({ node_id: d.node_id, ad_verdict: d.is_violation ? 'violation' : 'benign',
    observed_techniques: d.observed_techniques || d.techniques, needs_review: d.needs_review, reason: d.reason }));
  const keyed = items => ({ decisions: Object.fromEntries(wire(items).map(({ node_id, ...decision }) => [node_id, decision])) });
  const own = { opacity: 1, display: 'block', color: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)', font_size: 15, position: 'static', rect: { x: 0, y: 0, right: 200, bottom: 100 } };
  const baseNode = { url: 'http://127.0.0.1:8765/dev/', own_style: own, ancestors: [], frame_urls: [], nearby: {}, links: [], page_title: 'Test', context: 'Test context' };
  const candidates = [
    { ...baseNode, node_id: 'n1', location: 'p#a', raw_text: 'ＣＡＳＩＮＯ 가입 안내', normalized_text: 'CASINO 가입 안내', signals: ['HOMOGLYPH', 'TRANSPARENT'] },
    { ...baseNode, node_id: 'n2', location: 'p#b', raw_text: '카지노 예방 교육 안내', normalized_text: '카지노 예방 교육 안내', signals: [] }
  ];
  assert.throws(() => configFromEnv('qwen', {}), /missing/);
  assert.throws(() => configFromEnv('hcx', {}), /missing/);
  assert.throws(() => configFromEnv('hcx', { CLOVASTUDIO_API_KEY: 'dummy', CLOVASTUDIO_REASONING_EFFORT: 'low' }), /require/);
  assert.throws(() => configFromEnv('qwen', { QWEN_API_KEY: 'dummy', QWEN_BASE_URL: 'http://outside.invalid/v1' }), /HTTPS/);
  assert.equal(canonical('http://localhost/a/?z=2&x=1#one'), canonical('http://localhost/a?x=1&z=2'));
  assert.notEqual(canonical('http://localhost/a?id=1'), canonical('http://localhost/a?id=2'));
  assert.equal(inScope('http://localhost/eval/', new URL('http://localhost/dev/'), '/dev/'), false);
  checked.push('missing-key-and-endpoint-validation', 'URL-and-scope-boundary');

  const decisions = [], firstRequests = [];
  for (const [name, architecture, calls] of [['pipeline', pipeline, 1], ['adaptive', adaptive, 3], ['specialists', specialists, 6]]) {
    const trace = [];
    const session = createSession(configFromEnv('mock', {}), { log: event => trace.push(event) });
    const result = await architecture(candidates, session);
    firstRequests.push(trace.find(e => e.event === 'llm_request').body);
    assert.equal(session.calls.length, calls, name);
    assert.deepEqual(result[0].techniques, ['HOMOGLYPH', 'TRANSPARENT']);
    assert.equal(result[1].is_violation, false);
    if (name !== 'pipeline') assert(session.toolCalls.length > 0, name + ' did not use tools');
    if (name === 'specialists') {
      const integration = trace.find(e => e.event === 'llm_request' && JSON.parse(e.body.messages[1].content).role === 'integrator');
      assert.deepEqual(Object.keys(JSON.parse(integration.body.messages[1].content).expert_opinions), ['characters', 'styles', 'context']);
      const characterRequest = trace.find(e => e.event === 'llm_request' && JSON.parse(e.body.messages[1].content).role === 'characters');
      assert(!characterRequest.body.tools);
      const styleRequest = trace.find(e => e.event === 'llm_request' && JSON.parse(e.body.messages[1].content).role === 'styles');
      assert.deepEqual(styleRequest.body.tools.map(t => t.function.name), ['get_ancestor_styles']);
      checked.push('specialist-tools-match-observation-scope');
    }
    decisions.push(result);
    checked.push(name + '-control-flow');
  }
  assert.deepEqual(firstRequests[0], firstRequests[1]);
  assert.equal(JSON.parse(firstRequests[0].messages[1].content).phase, 'initial');
  assert.equal(decisions[0][0].needs_review, true);
  assert.equal(decisions[1][0].needs_review, false);
  assert.deepEqual(decisions[0].map(d => ({ ...d, needs_review: false })), decisions[1]);
  checked.push('shared-first-pass-preserves-pipeline-uncertainty');
  const snapshot = { entry_url: baseNode.url, candidates };
  const result = outputResult(snapshot, decisions[1], new Date().toISOString(), 0.01, 'mock', 'pipeline');
  assert.equal(result.result.findings.length, 2);
  assert.equal(result.result.findings[0].evidence_text, candidates[0].raw_text);
  assert.equal(new Set(result.result.findings.map(f => f.id)).size, 2);
  const unknown = structuredClone(decisions[0]); unknown[0].node_id = 'foreign';
  assert.throws(() => validateDecisions({ decisions: unknown }, candidates, 'judge'), /node_id/);
  const badType = structuredClone(decisions[0]); badType[0].techniques = ['ETC'];
  assert.throws(() => validateDecisions({ decisions: badType }, candidates, 'judge'), /technique/);
  const unexplained = structuredClone(decisions[0]); unexplained[1].reason = '';
  assert.equal(validateDecisions({ decisions: unexplained }, candidates, 'judge')[1].needs_review, true);
  const uncertain = structuredClone(decisions[0]); uncertain[0].is_violation = false; uncertain[0].needs_review = true;
  assert.equal(validateDecisions({ decisions: uncertain }, candidates, 'judge')[0].needs_review, true);
  checked.push('empty-reason-is-unresolved-not-clean-negative');
  const normalHidden = validateModelDecisions([{ node_id: 'n2', ad_verdict: 'benign', observed_techniques: ['OFFSCREEN'], needs_review: false, reason: '접근성 안내' }], [candidates[1]], 'integrator')[0];
  assert.equal(normalHidden.is_violation, false); assert.deepEqual(normalHidden.techniques, []);
  assert.deepEqual(normalHidden.observed_techniques, ['OFFSCREEN']);
  const observation = { node_id: 'n2', observed_techniques: ['OFFSCREEN'], needs_review: false, reason: '화면 밖 배치' };
  assert(!('is_violation' in validateModelDecisions([observation], [candidates[1]], 'styles')[0]));
  assert.throws(() => validateModelDecisions([{ ...observation, ad_verdict: 'benign' }], [candidates[1]], 'styles'), /Unexpected/);
  assert.throws(() => validateModelDecisions([{ ...observation, observed_techniques: ['JAMO'] }], [candidates[1]], 'styles'), /observed/);
  const cachedSession = createSession(configFromEnv('mock', {}));
  await cachedSession.decide('styles', candidates, { tools: true });
  await cachedSession.decide('context', candidates, { tools: true });
  await cachedSession.decide('context', candidates, { tools: true });
  assert(cachedSession.toolCalls.slice(-2).every(t => t.cached && !t.limited));
  checked.push('observations-separated-from-ad-verdict', 'expert-role-contract', 'shared-evidence-cache-does-not-exhaust-budget');
  const unresolved = structuredClone(decisions[0]); unresolved[0].needs_review = true;
  assert.equal(outputResult(snapshot, unresolved, new Date().toISOString(), 0, 'mock', 'pipeline').diagnostics.length, 1);
  const injection = reportHtml({ architecture: 'pipeline', provider: 'mock', status: 'failed', error: '<script>bad()</script>' });
  assert(!injection.includes('<script>'));
  checked.push('composite-output-and-original-text', 'reject-unknown-ID-and-technique', 'uncertainty-not-negative', 'HTML-escaping');

  let mode = 'valid', requests = 0, redirected = false, rateFailures = 0, transportFailures = 0;
  const server = http.createServer(async (req, res) => {
    if (req.url === '/redirect-target') { redirected = true; res.end('{}'); return; }
    if (req.url === '/v1/chat/completions') {
      requests++;
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const request = JSON.parse(Buffer.concat(chunks));
      assert.equal(req.headers.authorization, 'Bearer test-key-not-real');
      if (mode === 'hcx-first-pass') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: { code: '20000' }, result: { usage: { totalTokens: 24 }, finishReason: 'stop',
          message: { role: 'assistant', content: JSON.stringify(keyed(decisions[1])) } } }));
        return;
      }
      if (mode === 'hcx-repair') {
        const repaired = request.messages.some(m => m.role === 'user' && JSON.parse(m.content).validation_error);
        const answer = structuredClone(decisions[0]);
        if (!repaired) answer[1].reason = null;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: { code: '20000' }, result: { usage: { totalTokens: 24 }, finishReason: 'stop',
          message: { role: 'assistant', content: JSON.stringify(keyed(answer)) } } }));
        return;
      }
      if (mode === 'hcx-flow') {
        assert.equal(request.thinking.effort, 'none');
        assert.equal(request.maxCompletionTokens, 2048);
        assert.equal('enable_thinking' in request, false);
        assert.equal('max_tokens' in request, false);
        const toolMessage = request.messages.find(m => m.role === 'tool');
        const schemaEvidence = request.responseFormat && request.messages.slice(2).map(m => JSON.parse(m.content)).find(m => m.additional_evidence);
        let message;
        if (!toolMessage && !schemaEvidence) {
          assert.equal(request.toolChoice, 'auto');
          assert.equal('response_format' in request, false);
          message = { role: 'assistant', content: '', toolCalls: [{ id: 'hcx-tool', type: 'function', function: { name: 'get_context', arguments: { node_id: 'n1' } } }] };
        } else {
          if (toolMessage) {
            assert.equal(toolMessage.toolCallId, 'hcx-tool');
            assert.equal(JSON.parse(toolMessage.content).text, 'Test context');
          } else {
            assert.equal(schemaEvidence.additional_evidence[0].name, 'get_context');
            assert.equal(schemaEvidence.additional_evidence[0].result.text, 'Test context');
            assert(!request.messages.some(m => m.toolCalls));
          }
          if (request.tools) message = { role: 'assistant', content: '조사를 마쳤습니다.' };
          else {
            assert.equal(request.responseFormat.type, 'json');
            assert.equal(request.responseFormat.schema.properties.decisions.type, 'object');
            assert.deepEqual(request.responseFormat.schema.properties.decisions.required, ['n1', 'n2']);
            assert.deepEqual(Object.keys(request.responseFormat.schema.properties.decisions.properties), ['n1', 'n2']);
            message = { role: 'assistant', content: JSON.stringify(keyed(decisions[0])) };
          }
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: { code: '20000' }, result: { usage: { totalTokens: 24 }, finishReason: message.toolCalls ? 'tool_calls' : 'stop', message } }));
        return;
      }
      assert.equal(request.model, 'qwen3.7-plus');
      assert.equal(request.enable_thinking, false);
      if (mode === 'rate-once' && rateFailures++ === 0) { res.writeHead(429); res.end('{}'); return; }
      if (mode === 'transport-once' && transportFailures++ === 0) { req.socket.destroy(); return; }
      if (mode === 'unauthorized') { res.writeHead(401); res.end('{}'); return; }
      if (mode === 'redirect') { res.writeHead(302, { Location: '/redirect-target' }); res.end(); return; }
      if (mode === 'timeout') { setTimeout(() => res.end('{}'), 200); return; }
      let message = { role: 'assistant', content: JSON.stringify({ decisions: wire(decisions[0]) }) };
      if (mode === 'invalid-json') message.content = 'not JSON';
      if (mode === 'bad-tool') message = { role: 'assistant', content: null, tool_calls: [{ id: 'bad', type: 'function', function: { name: 'read_file', arguments: '{"path":"private/ground_truth.json"}' } }] };
      if (mode === 'unknown-node') message = { role: 'assistant', content: null, tool_calls: [{ id: 'bad', type: 'function', function: { name: 'get_context', arguments: '{"node_id":"outside-batch"}' } }] };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ model: 'contract-stub-not-live-qwen', usage: { prompt_tokens: 10, completion_tokens: 14, total_tokens: 24 }, choices: [{ finish_reason: mode === 'truncated' ? 'length' : message.tool_calls ? 'tool_calls' : 'stop', message }] }));
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/test/') res.end('<!doctype html><html><head><title>Fixture</title></head><body><main><p id="ad" style="opacity:0">ＣＡＳＩＮＯ 가입</p><p id="normal">도박 예방 교육</p><a href="/test/post?id=1&amp;v=2">첫 글</a><a href="/test/post?v=2&amp;id=1#part">첫 글 중복</a><a href="/test/post?id=2">둘째 글</a><iframe src="/test/frame"></iframe></main><script>setTimeout(()=>{const p=document.createElement("p");p.id="late";p.textContent="늦게 로딩된 댓글";document.querySelector("main").append(p)},100)</script></body></html>');
    else if (req.url === '/test/frame') res.end('<!doctype html><html><body><iframe src="/test/nested"></iframe></body></html>');
    else if (req.url === '/test/nested') res.end('<!doctype html><html><body><p id="nested" style="font-size:1px">ㅋㅏㅈㅣㄴㅗ 가입</p></body></html>');
    else if (req.url.startsWith('/test/post?')) res.end('<!doctype html><html><body><main><p id="text">정상 게시글</p></main></body></html>');
    else { res.writeHead(404); res.end('missing'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const output = path.join(__dirname, 'outputs', 'selftest-' + Date.now());
  fs.mkdirSync(output, { recursive: true });
  try {
    const config = configFromEnv('qwen', { QWEN_API_KEY: 'test-key-not-real', QWEN_BASE_URL: base + '/v1' });
    const session = createSession(config);
    const answer = await session.decide('judge', candidates);
    assert.equal(answer.length, 2); assert.equal(session.calls[0].usage.total_tokens, 24);
    mode = 'invalid-json'; await assert.rejects(createSession(config).decide('judge', candidates), /JSON|Unexpected/);
    mode = 'unauthorized'; await assert.rejects(createSession(config).decide('judge', candidates), /401/);
    mode = 'truncated'; await assert.rejects(createSession(config).decide('judge', candidates), /truncated/);
    mode = 'bad-tool'; await assert.rejects(createSession(config).decide('judge', candidates, { tools: true }), /Invalid tool/);
    mode = 'unknown-node'; await assert.rejects(createSession(config).decide('judge', candidates, { tools: true }), /node_id/);
    mode = 'redirect'; await assert.rejects(createSession(config).decide('judge', candidates)); assert.equal(redirected, false);
    mode = 'timeout'; await assert.rejects(createSession({ ...config, timeoutMs: 30 }).decide('judge', candidates));
    assert.equal(requests, 9);
    mode = 'rate-once';
    const throttled = createSession({ ...config, retryRateLimit: true });
    assert.deepEqual(await throttled.decide('judge', candidates), decisions[0]);
    assert.equal(throttled.calls.length, 2);
    assert.equal(throttled.calls[0].http_status, 429);
    assert.equal(throttled.calls[1].http_status, 200);
    assert(throttled.calls[1].sent_at_ms - throttled.calls[0].finished_at_ms >= 59000);
    checked.push('429-single-retry-counted-and-waited');
    mode = 'transport-once';
    const disconnected = createSession({ ...config, retryTransientTransport: true });
    assert.deepEqual(await disconnected.decide('judge', candidates), decisions[0]);
    assert.equal(disconnected.calls.length, 2);
    assert.equal(disconnected.calls[0].error, 'fetch failed');
    assert(disconnected.calls[0].transport_error.code);
    assert.equal(disconnected.calls[1].http_status, 200);
    checked.push('transport-single-retry-records-cause-and-attempts');
    mode = 'hcx-flow';
    const hcxConfig = { ...configFromEnv('hcx', { CLOVASTUDIO_API_KEY: 'test-key-not-real' }), endpoint: base + '/v1/chat/completions', minIntervalMs: 1 };
    assert(estimateRequestTokens({ messages: [{ content: '한글한글' }], maxCompletionTokens: 100 }) > 100);
    const beforeQuota = requests;
    await assert.rejects(createSession({ ...hcxConfig, tokensPerMinute: 1 }).decide('judge', candidates), /estimate exceeds/);
    assert.equal(requests, beforeQuota, 'Oversized request must not reach the API');
    checked.push('TPM-admission-rejects-oversized-request-before-send');
    const hcx = createSession(hcxConfig);
    const hcxAnswer = await hcx.decide('judge', candidates, { tools: true });
    assert.deepEqual(hcxAnswer, decisions[0]);
    assert.equal(hcx.calls.length, 3);
    assert.equal(hcx.toolCalls.length, 1);
    assert.equal(hcx.toolCalls[0].limited, false);
    const oneRound = createSession({ ...hcxConfig, maxToolRounds: 1 });
    assert.deepEqual(await oneRound.decide('judge', candidates, { tools: true }), decisions[0]);
    assert.equal(oneRound.calls.length, 2);
    checked.push('one-tool-round-then-direct-structured-judgment');
    const limited = createSession({ ...hcxConfig, maxCalls: 1 });
    await assert.rejects(limited.decide('judge', candidates, { tools: true }), /call limit/);
    assert.equal(limited.calls.length, 1);
    checked.push('HCX-tool-evidence-schema-roundtrip', 'HCX-disabled-reasoning-and-call-limit');
    mode = 'hcx-repair';
    const repair = createSession(hcxConfig);
    assert.deepEqual(await repair.decide('judge', candidates), decisions[0]);
    assert.equal(repair.calls.length, 2);
    checked.push('HCX-single-format-repair-keeps-original-input');
    mode = 'hcx-first-pass';
    const bodies = [];
    for (const architecture of [pipeline, adaptive]) {
      const trace = [];
      const shared = createSession({ ...hcxConfig, seed: 42 }, { log: e => trace.push(e) });
      await architecture(candidates, shared);
      assert.equal(shared.calls.length, 1);
      bodies.push(trace.find(e => e.event === 'llm_request').body);
    }
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal(JSON.parse(bodies[0].messages[1].content).phase, 'initial');
    assert(bodies[0].responseFormat && !bodies[0].tools);
    checked.push('HCX-pipeline-and-adaptive-identical-first-request');
    checked.push('HTTP-request-response-contract', 'malformed-response-and-401', 'truncation-and-unknown-tools', 'redirect-block-and-timeout');
    const evidence = await collect(base + '/test/', { channel: process.env.BROWSER_CHANNEL || 'msedge' });
    assert.equal(evidence.pages.length, 3);
    for (const node of evidence.candidates) assert.equal(node.normalized_text, normalizeText(node.raw_text));
    checked.push('shared-collector-uses-jamo-reading-aid');
    const ad = evidence.candidates.find(c => c.selector === 'p#ad');
    assert.deepEqual(ad.signals, ['HOMOGLYPH', 'TRANSPARENT']);
    assert(evidence.candidates.some(c => c.selector === 'p#late'));
    const nested = evidence.candidates.find(c => c.selector === 'p#nested');
    assert.equal(nested.frame_urls.length, 2);
    assert.equal(nested.location.split(' >>> ').length, 3);
    assert.deepEqual(nested.signals, ['JAMO', 'OFFSCREEN']);
    checked.push('browser-crawl-query-deduplication', 'dynamic-comments-and-nested-frames', 'four-technique-evidence');
    const failure = await runOne({ architecture: 'pipeline', provider: 'mock', config: configFromEnv('mock', {}), url: base + '/test/', maxPages: 1, output: path.join(output, 'limited') });
    assert.equal(failure.run.status, 'failed');
    assert.match(failure.run.error, /Page limit/);
    assert.equal(fs.existsSync(path.join(failure.output, 'result.json')), false);
    checked.push('incomplete-crawl-is-failure-not-clean-result');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  const report = { passed: checked.length, checked, live_api_called: false, verified_at: new Date().toISOString() };
  fs.writeFileSync(path.join(output, 'test-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, output }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
