// Frozen-input comparison. Predictions finish before the separate scorer reads labels.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { parseEnv, isDeepStrictEqual } = require('node:util');
const { spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { collect } = require('./collect.cjs');
const { configFromEnv } = require('./llm.cjs');
const { runOne } = require('./run.cjs');

const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function initialRequests(folder) {
  return fs.readFileSync(path.join(folder, 'trace.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    .filter(e => e.event === 'llm_request').map(e => e.body).filter(body => {
      const input = JSON.parse(body.messages.find(m => m.role === 'user').content);
      return input.role === 'judge' && input.phase === 'initial';
    });
}

function timing(run) {
  const intervals = run.calls.filter(c => c.sent_at_ms && c.finished_at_ms).map(c => [c.sent_at_ms, c.finished_at_ms]).sort((a, b) => a[0] - b[0]);
  let activeMs = 0, end = 0;
  for (const [start, stop] of intervals) { activeMs += Math.max(0, stop - Math.max(start, end)); end = Math.max(end, stop); }
  const sorted = run.calls.map(c => c.service_sec).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = q => sorted.length ? sorted[Math.ceil(sorted.length * q) - 1] : null;
  return { end_to_end_sec: run.elapsed_sec, collection_sec: run.collection_elapsed_sec,
    api_active_wall_sec: activeMs / 1000, non_api_sec: run.elapsed_sec - activeMs / 1000,
    request_service_p50_sec: percentile(0.5), request_service_p95_sec: percentile(0.95),
    http_429: run.calls.filter(c => c.http_status === 429).length,
    known_tokens: run.calls.reduce((s, c) => s + (c.usage?.total_tokens || 0), 0) };
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--pipeline-control'), 'Usage: benchmark.cjs [--pipeline-control <previous-experiment-folder>]');
  const reference = args.length ? path.resolve(args[1]) : null;
  const env = parseEnv(fs.readFileSync(path.join(__dirname, '.env'), 'utf8'));
  const config = { ...configFromEnv('hcx', env), maxCalls: 220, maxTokens: 3072, timeoutMs: 180000,
    minIntervalMs: 1000, tokensPerMinute: 52000, maxToolRounds: 1, temperature: 0, reasoningEffort: 'none', retryRateLimit: true, retryTransientTransport: true };
  const out = path.join(__dirname, 'outputs', (reference ? 'prompt-control-' : 'accuracy-') + Date.now());
  fs.mkdirSync(out, { recursive: true });
  const files = ['llm.cjs', 'collect.cjs', 'jamo.cjs', 'run.cjs', 'benchmark.cjs', 'architectures/pipeline.cjs', 'architectures/adaptive.cjs', 'architectures/specialists.cjs'];
  const codeHashes = Object.fromEntries(files.map(f => [f, digest(path.join(__dirname, f))]));
  const datasetFile = path.join(__dirname, '../local-benchmark/private/ground_truth.json');
  // Hash bytes only. Do not parse or pass the answer file to the detector.
  const truthHash = digest(datasetFile);
  const { apiKey, ...settings } = config;
  const protocol = { created_at: new Date().toISOString(), split: 'eval', entry_url: 'http://127.0.0.1:8765/eval/',
    purpose: reference ? 'Pipeline prompt alignment: compare actual requests with archived Adaptive first pass; reused eval is a confirmation set, not a new holdout' : 'Three-architecture comparison',
    reference_experiment: reference,
    repeats: 3, seeds: [42, 43, 44], batch_size: 16, timeout_ms: 1800000, settings,
    code_hashes: codeHashes, ground_truth_sha256: truthHash,
    selection: 'All DOM candidates; no filtering by hints, labels, classes or text',
    ranking: 'Completed runs with invalid=0 and original evidence intact; mean F1 first. Within 0.01 F1 prefer lower median end-to-end latency. Report precision, recall, per-technique metrics and variability separately.',
    latency: 'Real browser collection plus decision time including quota waits and retries. API interval union and request percentiles reported separately; non-API time is not a counterfactual unlimited-quota latency.',
    failure_policy: 'Keep failures, never replace with zero detections. At most one retry per HTTP 429 or fetch transport failure, waiting at least 60 seconds; one schema repair. All attempts count against the same limits. Stop on a failed run; score only after all planned runs finish. Prompt-control mode additionally requires exact request equality with the reference.',
    quota_policy: 'Shared FIFO gate: 52,000 estimated/reserved tokens per 61 seconds, then correct reservations to API promptTokens + maxCompletionTokens. One-second minimum start gap. 429 pauses the whole session. A 61-second cooldown between runs is excluded from job latency to start each architecture with a fresh quota window.' };
  if (reference) {
    const previous = read(path.join(reference, 'protocol.json'));
    assert.deepEqual(settings, previous.settings, 'Reference model settings differ');
    assert.deepEqual(protocol.seeds, previous.seeds);
    assert.equal(protocol.batch_size, previous.batch_size);
    assert.equal(protocol.timeout_ms, previous.timeout_ms);
    assert.equal(protocol.entry_url, previous.entry_url);
    assert.equal(protocol.ground_truth_sha256, previous.ground_truth_sha256);
  }
  save(path.join(out, 'protocol.json'), protocol);
  for (const file of files) {
    const destination = path.join(out, 'source', file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(__dirname, file), destination);
  }
  console.log('Experiment: ' + out);
  const frozen = await collect(protocol.entry_url, { channel: env.BROWSER_CHANNEL || 'msedge' });
  if (reference) assert.equal(frozen.snapshot_sha256, read(path.join(reference, 'reference-input.json')).snapshot_sha256, 'Reference input changed; no model calls made');
  save(path.join(out, 'reference-input.json'), frozen);
  const orders = reference ? [['pipeline'], ['pipeline'], ['pipeline']] : [['specialists', 'pipeline', 'adaptive'], ['pipeline', 'adaptive', 'specialists'], ['adaptive', 'specialists', 'pipeline']];
  const planned = orders.flat().length;
  const runs = [];
  predictionLoop: for (let repeat = 0; repeat < protocol.repeats; repeat++) for (const architecture of orders[repeat]) {
    if (runs.length) { console.log('Between-run quota cooldown (61 seconds; excluded from job latency)'); await delay(61000); }
    for (const [file, hash] of Object.entries(codeHashes)) if (digest(path.join(__dirname, file)) !== hash) throw Error('Frozen source changed: ' + file);
    if (digest(datasetFile) !== truthHash) throw Error('Dataset labels changed');
    const folder = path.join(out, 'repeat-' + (repeat + 1), architecture);
    console.log(`Repeat ${repeat + 1}: ${architecture}; ${frozen.candidates.length} candidates`);
    const result = await runOne({ architecture, provider: 'hcx', config: { ...config, seed: protocol.seeds[repeat] },
      expectedSnapshot: frozen.snapshot_sha256, url: protocol.entry_url, channel: env.BROWSER_CHANNEL || 'msedge',
      batchSize: protocol.batch_size, timeoutMs: protocol.timeout_ms, output: folder });
    runs.push({ repeat: repeat + 1, architecture, output: folder, run: result.run, timing: timing(result.run) });
    if (reference && result.run.status !== 'failed') {
      const actual = initialRequests(folder), expected = initialRequests(path.join(reference, 'repeat-' + (repeat + 1), 'adaptive'));
      assert.equal(actual.length, Math.ceil(frozen.candidates.length / protocol.batch_size));
      const comparison = { identical: isDeepStrictEqual(actual, expected), batches: actual.length };
      save(path.join(folder, 'request-comparison.json'), comparison);
      assert(comparison.identical, 'Actual request differs from reference Adaptive first pass');
      runs.at(-1).request_comparison = comparison;
    }
    save(path.join(out, 'progress.json'), { phase: 'predictions', completed: runs.length, planned, runs });
    console.log(JSON.stringify({ repeat: repeat + 1, architecture, status: result.run.status, calls: result.run.llm_calls, seconds: result.run.elapsed_sec, error: result.run.error }));
    if (result.run.status === 'failed') break predictionLoop;
  }
  // Only now load the scorer in a child process. Its labels never enter model prompts.
  for (const item of runs) {
    if (runs.length !== planned || runs.some(r => r.run.status === 'failed')) break;
    const scoreFile = path.join(item.output, 'score.json');
    const child = spawnSync(process.execPath, [path.join(__dirname, '../local-benchmark/evaluate.cjs'), 'score', path.join(item.output, 'result.json'), '--split', 'eval', '--report', scoreFile], { encoding: 'utf8', timeout: 180000, windowsHide: true });
    if (child.status !== 0) throw Error('Scorer failed: ' + (child.stderr || child.stdout).slice(-2000));
    item.score = JSON.parse(fs.readFileSync(scoreFile, 'utf8'));
  }
  const result = { protocol, snapshot_sha256: frozen.snapshot_sha256, candidates: frozen.candidates.length,
    all_runs_completed: runs.length === planned && runs.every(r => r.run.status !== 'failed'),
    same_input: runs.every(r => r.run.snapshot_sha256 === frozen.snapshot_sha256), runs };
  save(path.join(out, 'summary.json'), result);
  console.log(JSON.stringify({ output: out, all_runs_completed: result.all_runs_completed, same_input: result.same_input }, null, 2));
  if (!result.all_runs_completed) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { timing };
