const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { collect } = require('./collect.cjs');
const { configFromEnv, createSession, validateDecisions } = require('./llm.cjs');
const architectures = {
  adaptive: require('./architectures/adaptive.cjs'),
  pipeline: require('./architectures/pipeline.cjs'),
  specialists: require('./architectures/specialists.cjs')
};
const VERSION = '0.3.3';
const ranks = { adaptive: 1, pipeline: 2, specialists: 3 };

function save(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function escape(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

function outputResult(snapshot, decisions, startedAt, elapsed, provider, architecture) {
  validateDecisions({ decisions }, snapshot.candidates, 'judge');
  const byId = new Map(snapshot.candidates.map(c => [c.node_id, c]));
  const findings = [], diagnostics = [], seen = new Set();
  for (const decision of decisions) {
    const node = byId.get(decision.node_id);
    if (decision.needs_review || (decision.is_violation && !decision.techniques.length)) {
      diagnostics.push({ ...decision, url: node.url, location: node.location });
      continue;
    }
    if (!decision.is_violation) continue;
    for (const technique of decision.techniques) {
      const key = JSON.stringify([node.url, node.location, technique]);
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ id: 'f_' + String(findings.length + 1).padStart(4, '0'), url: node.url,
        is_violation: true, location: node.location, evidence_text: node.raw_text, technique });
    }
  }
  return { result: { meta: { topic: 'TOPIC', entry_url: snapshot.entry_url, started_at: startedAt,
    finished_at: new Date().toISOString(), elapsed_sec: elapsed,
    tool_version: `${VERSION}/${architecture}/${provider === 'mock' ? 'MOCK-NOT-QWEN' : provider}` }, findings }, diagnostics };
}

function reportHtml(run, result, decisions = []) {
  const reasonByNode = new Map(decisions.map(d => [d.node_id, d.reason]));
  const rows = (result?.findings || []).map(f => `<tr><td>${escape(f.technique)}</td><td><a href="${escape(f.url)}" target="_blank" rel="noopener noreferrer">${escape(f.url)}</a><code>${escape(f.location)}</code></td><td>${escape(f.evidence_text)}</td></tr>`).join('');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>실험 결과 · ${escape(run.architecture)}</title>
<style>body{font:15px/1.65 'Malgun Gothic',sans-serif;color:#20334b;max-width:1200px;margin:40px auto;padding:0 24px}h1{font-size:28px}.banner{padding:16px 20px;background:#fff1d6;border-left:4px solid #d89929}.summary{display:flex;gap:24px;flex-wrap:wrap;background:#edf4fa;padding:20px;margin:24px 0}table{width:100%;border-collapse:collapse}th,td{padding:14px;border-bottom:1px solid #dce3ed;text-align:left;vertical-align:top}td{overflow-wrap:anywhere}code{display:block;white-space:pre-wrap;font-size:12px;margin-top:8px}a{color:#075592}small{color:#64748b}</style>
<h1>실험 결과 · ${escape(run.architecture)} (추천 ${ranks[run.architecture]}위)</h1>
<div class="banner">${run.provider === 'mock' ? 'MOCK 연결 검증 결과입니다. 실제 모델의 탐지 성능 비교에 사용할 수 없습니다.' : escape(run.configuration?.model || run.provider) + ' API 실행 결과입니다. 정답 채점은 별도 채점기로 수행하세요.'}</div>
<div class="summary"><span>상태 <strong>${escape(run.status)}</strong></span><span>페이지 ${run.pages ?? 0}</span><span>후보 ${run.candidates ?? 0}</span><span>검출 ${result?.findings.length ?? '미완료'}</span><span>재검토 ${run.needs_review ?? 0}</span><span>전체 시간 ${Number(run.elapsed_sec || 0).toFixed(2)}초</span><span>모델 호출 ${run.llm_calls ?? 0}</span></div>
${run.error ? '<p>실행 실패: ' + escape(run.error) + '</p>' : ''}
<p>원문·URL·위치는 수집 코드에서 가져옵니다. 처리되지 않은 항목은 diagnostics.json, 전체 판정 근거는 decisions.json, 호출 기록은 trace.jsonl에 있습니다.</p>
<table><thead><tr><th>기법</th><th>페이지·요소 위치</th><th>정규화 전 원문</th></tr></thead><tbody>${rows || '<tr><td colspan="3">표시할 확정 검출 결과가 없습니다. 실행 상태와 재검토 항목을 확인하세요.</td></tr>'}</tbody></table>
<details><summary>후보별 판단 근거 (${reasonByNode.size})</summary>${decisions.map(d => `<p><code>${escape(d.node_id)}</code>${escape(d.reason)}${d.needs_review ? ' [재검토 필요]' : ''}</p>`).join('')}</details>
<p><small>실험용 최소 구현 · 최종 제출용 실행 파일이 아닙니다.</small></p></html>`;
}

async function runOne(options) {
  if (!architectures[options.architecture]) throw Error('Unknown architecture');
  const dir = path.resolve(options.output);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.readdirSync(dir).length) throw Error('Output directory must be empty: ' + dir);
  const started = performance.now(), startedAt = new Date().toISOString();
  const run = { version: VERSION, architecture: options.architecture, rank: ranks[options.architecture], provider: options.provider,
    entry_url: options.url, started_at: startedAt, status: 'running', batch_size: options.batchSize ?? 8,
    benchmark_accuracy_measured: false, cost_usd: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Run time limit exceeded')), options.timeoutMs ?? 1800000);
  const tracePath = path.join(dir, 'trace.jsonl');
  const log = event => fs.appendFileSync(tracePath, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n', 'utf8');
  let session, result, decisions = [];
  try {
    const config = options.config || configFromEnv(options.provider);
    const { apiKey, ...publicConfig } = config;
    run.configuration = publicConfig;
    session = createSession(config, { signal: controller.signal, log });
    save(path.join(dir, 'run.json'), run);
    const snapshot = options.snapshot || await collect(options.url, { signal: controller.signal, scope: options.scope,
      channel: options.channel || process.env.BROWSER_CHANNEL || 'msedge', maxPages: options.maxPages ?? 40 });
    run.reused_snapshot = Boolean(options.snapshot);
    run.selection = snapshot.selection || null;
    if (options.expectedSnapshot && snapshot.snapshot_sha256 !== options.expectedSnapshot) throw Error('Input snapshot changed between architectures; no model calls made');
    save(path.join(dir, 'evidence.json'), snapshot);
    Object.assign(run, { pages: snapshot.pages.length, candidates: snapshot.candidates.length,
      snapshot_sha256: snapshot.snapshot_sha256, collection_elapsed_sec: snapshot.collection_elapsed_sec,
      blocked_requests: snapshot.blocked_requests });
    for (let offset = 0; offset < snapshot.candidates.length; offset += run.batch_size) {
      controller.signal.throwIfAborted();
      const batch = snapshot.candidates.slice(offset, offset + run.batch_size);
      decisions.push(...await architectures[options.architecture](batch, session));
      console.log(`[${options.architecture}] ${Math.min(offset + run.batch_size, snapshot.candidates.length)}/${snapshot.candidates.length} candidates; ${session.calls.length} calls`);
    }
    controller.signal.throwIfAborted();
    const output = outputResult(snapshot, decisions, startedAt, (performance.now() - started) / 1000, options.provider, options.architecture);
    result = output.result;
    run.needs_review = output.diagnostics.length;
    run.missing_reasons = decisions.filter(d => !d.reason.trim()).length;
    run.status = output.diagnostics.length || snapshot.blocked_requests.length ? 'completed_with_warnings' : 'completed';
    save(path.join(dir, 'diagnostics.json'), output.diagnostics);
    save(path.join(dir, 'decisions.json'), decisions);
    save(path.join(dir, 'result.json'), result);
  } catch (error) {
    run.status = 'failed'; run.error = error.message;
    if (decisions.length) save(path.join(dir, 'partial-decisions.json'), decisions);
    // A failure never writes an apparently successful empty result.json.
    log({ event: 'run_failed', error: error.message });
  } finally {
    clearTimeout(timer);
    run.finished_at = new Date().toISOString();
    run.elapsed_sec = (performance.now() - started) / 1000;
    run.llm_calls = session?.calls.length ?? 0;
    run.tool_calls = session?.toolCalls.length ?? 0;
    run.calls = session?.calls ?? [];
    run.tool_log = session?.toolCalls ?? [];
    const measured = run.calls.filter(c => c.usage && Number.isFinite(c.usage.total_tokens));
    run.total_tokens = measured.length === run.calls.length && measured.length ? measured.reduce((sum, c) => sum + c.usage.total_tokens, 0) : null;
    save(path.join(dir, 'run.json'), run);
    fs.writeFileSync(path.join(dir, 'report.html'), reportHtml(run, result, decisions), 'utf8');
  }
  return { run, result, output: dir };
}

async function main() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node run.cjs --architecture all|adaptive|pipeline|specialists --provider mock|qwen|hcx --url http://127.0.0.1:8765/dev/ [--scope /dev/] [--out DIRECTORY] [--batch-size 8] [--max-pages 40] [--timeout-sec 1800]');
    return;
  }
  const allowed = new Set(['architecture', 'provider', 'url', 'scope', 'out', 'batch-size', 'max-pages', 'timeout-sec']);
  const values = {};
  while (args.length) {
    const name = args.shift();
    if (!name.startsWith('--') || !allowed.has(name.slice(2)) || !args.length || args[0].startsWith('--')) throw Error('Invalid option: ' + name);
    if (name.slice(2) in values) throw Error('Duplicate option: ' + name);
    values[name.slice(2)] = args.shift();
  }
  const architecture = values.architecture || 'all', provider = values.provider || 'mock';
  if (!['all', ...Object.keys(architectures)].includes(architecture) || !['mock', 'qwen', 'hcx'].includes(provider)) throw Error('Unknown architecture/provider');
  const batchSize = Number(values['batch-size'] || 8), maxPages = Number(values['max-pages'] || 40), timeoutSec = Number(values['timeout-sec'] || 1800);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 16 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 200 || !Number.isFinite(timeoutSec) || timeoutSec < 1 || timeoutSec > 1800) throw Error('Invalid batch/page/time limit');
  const folder = values.out || path.join(__dirname, 'outputs', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(2).toString('hex'));
  const names = architecture === 'all' ? ['pipeline', 'adaptive', 'specialists'] : [architecture];
  const config = configFromEnv(provider);
  const summaries = [];
  for (const name of names) {
    console.log(`[${name}] ${provider === 'mock' ? 'MOCK protocol check' : config.model + ' API'}: starting`);
    const output = await runOne({ architecture: name, provider, config, expectedSnapshot: summaries[0]?.snapshot_sha256,
      url: values.url || 'http://127.0.0.1:8765/dev/', scope: values.scope,
      output: path.join(folder, name), batchSize, maxPages, timeoutMs: timeoutSec * 1000 });
    summaries.push({ architecture: name, status: output.run.status, snapshot_sha256: output.run.snapshot_sha256,
      llm_calls: output.run.llm_calls, tool_calls: output.run.tool_calls, output: output.output });
    console.log(JSON.stringify(summaries.at(-1)));
    if (output.run.status === 'failed') { process.exitCode = 1; break; }
  }
  save(path.join(folder, 'summary.json'), { provider, live_model_called: provider !== 'mock' && summaries.some(s => s.llm_calls > 0), benchmark_accuracy_measured: false,
    same_snapshot: summaries.every(s => s.snapshot_sha256 && s.snapshot_sha256 === summaries[0].snapshot_sha256), runs: summaries });
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { runOne, outputResult, reportHtml };
