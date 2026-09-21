// Live contract check using the same adapter and evidence tools as all three architectures.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { configFromEnv, createSession } = require('./llm.cjs');

async function main() {
  const env = parseEnv(fs.readFileSync(path.join(__dirname, '.env'), 'utf8'));
  const config = { ...configFromEnv('hcx', env), maxCalls: 4 };
  const folder = path.join(__dirname, 'outputs', 'hcx-flow-' + Date.now());
  fs.mkdirSync(folder, { recursive: true });
  const log = event => fs.appendFileSync(path.join(folder, 'trace.jsonl'), JSON.stringify(event) + '\n');
  const session = createSession(config, { log });
  const own = { opacity: 1, display: 'block', visibility: 'visible', color: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)',
    font_size: 16, position: 'static', rect: { x: 20, y: 20, width: 300, height: 20, right: 320, bottom: 40 } };
  const candidate = { node_id: 'connection_check', raw_text: '온라인 카지노 신규 회원 모집! 가입하고 입금하면 보너스 지급.',
    normalized_text: '온라인 카지노 신규 회원 모집! 가입하고 입금하면 보너스 지급.',
    page_title: '합성 연결 검증', own_style: own, signals: ['TRANSPARENT'], nearby: {}, links: [], frame_urls: [],
    context: '합성 광고 테스트 문구', ancestors: [{ ...own, tag: 'div', opacity: 0 }] };
  const started = performance.now();
  const decisions = await session.decide('judge', [candidate], { tools: true, forceTool: 'get_ancestor_styles', phase: 'review' });
  assert(session.toolCalls.some(t => t.name === 'get_ancestor_styles' && !t.limited), 'Model must actually request additional evidence');
  assert.equal(decisions[0].is_violation, true);
  assert(decisions[0].techniques.includes('TRANSPARENT'));
  assert.equal(decisions[0].needs_review, false);
  const { apiKey, ...settings } = config;
  const report = { status: 'passed', live_api_calls: session.calls.length, settings,
    elapsed_sec: (performance.now() - started) / 1000, tool_calls: session.toolCalls, decisions,
    calls: session.calls, forced_tool: true, purpose: 'Protocol verification, not accuracy measurement' };
  fs.writeFileSync(path.join(folder, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, live_api_calls: report.live_api_calls, elapsed_sec: report.elapsed_sec, decisions, output: folder }, null, 2));
}
main().catch(error => { console.error('HCX flow verification failed: ' + error.message); process.exitCode = 1; });
