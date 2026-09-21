// One real, short HCX-007 request. No retries or credential logging.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const assert = require('node:assert/strict');

async function main() {
  const env = parseEnv(fs.readFileSync(path.join(__dirname, '.env'), 'utf8'));
  const key = env.CLOVASTUDIO_API_KEY?.trim();
  if (!key) throw Error('CLOVASTUDIO_API_KEY is missing in .env');
  if (env.CLOVASTUDIO_MODEL && env.CLOVASTUDIO_MODEL !== 'HCX-007') {
    throw Error('This smoke test requires CLOVASTUDIO_MODEL=HCX-007');
  }
  const started = performance.now();
  const response = await fetch('https://clovastudio.stream.ntruss.com/v1/openai/chat/completions', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'HCX-007', stream: false, reasoning_effort: 'none', max_completion_tokens: 128,
      messages: [
        { role: 'system', content: 'API 연결 확인입니다. status는 ok, answer는 연결 성공으로 응답하세요.' },
        { role: 'user', content: '연결 상태를 반환해 주세요.' }
      ],
      response_format: { type: 'json_schema', json_schema: {
        name: 'connection_check', schema: { type: 'object', properties: {
          status: { type: 'string', enum: ['ok'] }, answer: { type: 'string' }
        }, required: ['status', 'answer'] }
      } }
    })
  });
  if (!response.ok) throw Error(`HCX request failed: HTTP ${response.status} (response body omitted)`);
  const data = await response.json();
  const choice = data.choices?.[0];
  assert.equal(choice?.finish_reason, 'stop', 'Incomplete model response');
  const result = JSON.parse(choice.message.content);
  assert.equal(result.status, 'ok', 'Unexpected status');
  assert.equal(result.answer, '연결 성공', 'Unexpected answer');
  const report = {
    tested_at: new Date().toISOString(), requested_model: 'HCX-007',
    http_status: response.status, live_api_calls: 1,
    elapsed_sec: Number(((performance.now() - started) / 1000).toFixed(2)),
    response: { status: 'ok', answer: '연결 성공' },
    usage: Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens']
      .filter(k => Number.isFinite(data.usage?.[k])).map(k => [k, data.usage[k]])),
    checks: ['authentication', 'HCX-007 response', 'JSON schema output'],
    scope: 'Connection smoke test only; architecture integration and tool calling not tested'
  };
  fs.mkdirSync(path.join(__dirname, 'outputs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'outputs', 'hcx-smoke.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  // Never print raw server bodies, assertion values, or request headers.
  const message = /^HCX request failed: HTTP \d+/.test(error.message) ? error.message
    : ['CLOVASTUDIO_API_KEY is missing in .env', 'This smoke test requires CLOVASTUDIO_MODEL=HCX-007'].includes(error.message)
      ? error.message : `Smoke test failed (${error.name}); no credentials logged`;
  console.error(message);
  process.exitCode = 1;
});
