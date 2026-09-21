// Secondary paired analysis only. Never adds a live model call or estimates live latency.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { validateModelDecisions } = require('./llm.cjs');
const { outputResult } = require('./run.cjs');

function initialDecisions(folder) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(folder, 'evidence.json'), 'utf8'));
  const events = fs.readFileSync(path.join(folder, 'trace.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const requests = new Map(), batches = new Map(), reviewed = new Set();
  for (const event of events) {
    if (event.event === 'llm_request') {
      const input = JSON.parse(event.body.messages.find(m => m.role === 'user').content);
      requests.set(event.call_number, input);
      if (input.phase === 'review') input.candidates.forEach(c => reviewed.add(c.node_id));
    }
    if (event.event !== 'llm_response') continue;
    const input = requests.get(event.call_number);
    if (input?.role !== 'judge' || input.phase !== 'initial') continue;
    try {
      const content = JSON.parse(event.data.choices[0].message.content);
      const ids = new Set(input.candidates.map(c => c.node_id));
      const candidates = snapshot.candidates.filter(c => ids.has(c.node_id));
      const validated = validateModelDecisions(Object.entries(content.decisions).map(([node_id, d]) => ({ ...d, node_id })), candidates, 'judge');
      batches.set(input.candidates.map(c => c.node_id).join(','), validated);
    } catch { /* A later bounded repair may replace this response. Coverage is asserted below. */ }
  }
  const byId = new Map([...batches.values()].flat().map(d => [d.node_id, d]));
  assert.equal(byId.size, snapshot.candidates.length, 'Initial-stage coverage is incomplete');
  const decisions = snapshot.candidates.map(c => { assert(byId.has(c.node_id)); return byId.get(c.node_id); });
  return { snapshot, decisions, reviewed_candidates: reviewed.size,
    initial_api_attempts: [...requests.values()].filter(r => r.phase === 'initial').length,
    review_api_attempts: [...requests.values()].filter(r => r.phase === 'review').length };
}

function main(folder) {
  const summary = JSON.parse(fs.readFileSync(path.join(folder, 'summary.json'), 'utf8'));
  assert(summary.all_runs_completed, 'Do not score secondary analyses before all planned live runs finish');
  const rows = [];
  for (const item of summary.runs.filter(r => r.architecture === 'adaptive')) {
    const data = initialDecisions(item.output);
    const replay = outputResult(data.snapshot, data.decisions, item.run.started_at, item.run.elapsed_sec, 'hcx', 'initial-only-replay');
    replay.result.meta.tool_version += '/REPLAY-NOT-A-SEPARATE-TIMED-RUN';
    const resultFile = path.join(item.output, 'initial-only-result.json'), scoreFile = path.join(item.output, 'initial-only-score.json');
    fs.writeFileSync(resultFile, JSON.stringify(replay.result, null, 2));
    const scored = spawnSync(process.execPath, [path.join(__dirname, '../local-benchmark/evaluate.cjs'), 'score', resultFile, '--split', 'eval', '--report', scoreFile], { encoding: 'utf8', timeout: 180000, windowsHide: true });
    assert.equal(scored.status, 0, scored.stderr);
    const initial = JSON.parse(fs.readFileSync(scoreFile, 'utf8'));
    const final = JSON.parse(fs.readFileSync(path.join(item.output, 'decisions.json'), 'utf8'));
    const decisionKey = d => JSON.stringify([d.is_violation, [...d.techniques].sort(), d.needs_review]);
    const initialById = new Map(data.decisions.map(d => [d.node_id, d]));
    rows.push({ repeat: item.repeat, initial_api_attempts: data.initial_api_attempts, review_api_attempts: data.review_api_attempts,
      reviewed_candidates: data.reviewed_candidates, changed_decisions: final.filter(d => decisionKey(d) !== decisionKey(initialById.get(d.node_id))).length,
      initial: { tp: initial.tp, fp: initial.fp, fn: initial.fn, f1: initial.f1 },
      final: { tp: item.score.tp, fp: item.score.fp, fn: item.score.fn, f1: item.score.f1 }, f1_delta: item.score.f1 - initial.f1 });
  }
  const report = { purpose: 'Paired effect of Adaptive review, using saved initial responses; not a new live architecture',
    timing: 'No standalone initial-only latency was measured. The replay JSON retains the full Adaptive time solely for scorer format compatibility; do not interpret it as initial-only latency.',
    prompt_confound: 'Pipeline uses phase=final while Adaptive first pass uses phase=initial. Main results compare implemented workflows, not the isolated causal effect of retrieval. This paired replay isolates the review step within Adaptive.', rows };
  fs.writeFileSync(path.join(folder, 'adaptive-ablation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) main(path.resolve(process.argv[2] || '.'));
module.exports = { initialDecisions };
