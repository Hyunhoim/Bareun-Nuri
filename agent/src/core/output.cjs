const {validateDecisions}=require('./llm.cjs');
const VERSION='0.3.3-web.2';
function outputResult(snapshot, decisions, startedAt, elapsed, provider) {
  validateDecisions({ decisions }, snapshot.candidates);
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
    tool_version: `${VERSION}/pipeline/${provider === 'mock' ? 'MOCK' : provider}` }, findings }, diagnostics };
}

module.exports={outputResult};
