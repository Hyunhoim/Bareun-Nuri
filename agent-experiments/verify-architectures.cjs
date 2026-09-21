// Small live integration check. Selection uses public DOM hints, never benchmark answers.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { collect } = require('./collect.cjs');
const { TECHNIQUES, configFromEnv } = require('./llm.cjs');
const { runOne } = require('./run.cjs');

async function main() {
  const env = parseEnv(fs.readFileSync(path.join(__dirname, '.env'), 'utf8'));
  const config = { ...configFromEnv('hcx', env), maxCalls: 40, maxTokens: 2048, minIntervalMs: 30000,
    temperature: 0, reasoningEffort: 'none' };
  const full = await collect('http://127.0.0.1:8765/dev/', { channel: env.BROWSER_CHANNEL || 'msedge' });
  const selected = new Map();
  for (const technique of TECHNIQUES) {
    const nodes = full.candidates.filter(n => n.signals.includes(technique) && !selected.has(n.node_id)).slice(0, 2);
    assert.equal(nodes.length, 2, 'Not enough public candidates for ' + technique);
    nodes.forEach(n => selected.set(n.node_id, n));
  }
  full.candidates.filter(n => !n.signals.length).slice(0, 4).forEach(n => selected.set(n.node_id, n));
  assert.equal(selected.size, 12);
  const snapshot = { ...full, candidates: [...selected.values()], selection: {
    purpose: 'integration verification only, not an accuracy benchmark', source_candidates: full.candidates.length,
    method: 'Two distinct DOM-hint candidates per technique, then four without hints; no gold labels read',
    source_snapshot_sha256: full.snapshot_sha256
  } };
  snapshot.snapshot_sha256 = crypto.createHash('sha256').update(JSON.stringify({
    entry_url: snapshot.entry_url, scope: snapshot.scope, pages: snapshot.pages, candidates: snapshot.candidates,
    blocked_requests: snapshot.blocked_requests, selection: snapshot.selection
  })).digest('hex');
  const output = path.join(__dirname, 'outputs', 'hcx-validation-' + Date.now());
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'input.json'), JSON.stringify(snapshot, null, 2));
  const runs = [];
  for (const architecture of ['pipeline', 'adaptive', 'specialists']) {
    console.log('Starting ' + architecture + ' on 12 frozen candidates');
    const result = await runOne({ architecture, provider: 'hcx', config, snapshot: structuredClone(snapshot),
      expectedSnapshot: snapshot.snapshot_sha256, url: snapshot.entry_url, batchSize: 12, timeoutMs: 600000,
      output: path.join(output, architecture) });
    runs.push(result.run);
    console.log(JSON.stringify({ architecture, status: result.run.status, calls: result.run.llm_calls, tools: result.run.tool_calls, error: result.run.error }));
  }
  const { apiKey, ...settings } = config;
  const passed = runs.every(r => ['completed', 'completed_with_warnings'].includes(r.status));
  const report = { passed, purpose: 'live integration check, not full benchmark accuracy', candidate_count: 12, settings,
    same_input: runs.every(r => r.snapshot_sha256 === snapshot.snapshot_sha256),
    same_configuration: runs.every(r => JSON.stringify(r.configuration) === JSON.stringify(settings)),
    total_calls: runs.reduce((s, r) => s + r.llm_calls, 0),
    total_tokens: runs.every(r => Number.isFinite(r.total_tokens)) ? runs.reduce((s, r) => s + r.total_tokens, 0) : null,
    known_tokens: runs.flatMap(r => r.calls).reduce((s, c) => s + (c.usage?.total_tokens || 0), 0),
    collection_elapsed_sec: full.collection_elapsed_sec, runs };
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed, same_input: report.same_input, same_configuration: report.same_configuration,
    total_calls: report.total_calls, total_tokens: report.total_tokens, output }, null, 2));
  if (!passed || !report.same_input || !report.same_configuration) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
