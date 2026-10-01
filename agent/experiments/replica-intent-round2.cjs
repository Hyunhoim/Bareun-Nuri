// Bounded, unselected second-round candidates. This module never sends a request.
const assert = require('node:assert/strict');
const { contract: firstRoundContract } = require('./replica-intent-methods.cjs');

const definitions = {
  role4: { batchSize: 4, factor: 'role contract control' },
  role8: { batchSize: 8, factor: 'batch size only' },
  role16: { batchSize: 16, factor: 'batch size only' },
  nominal4: { batchSize: 4, factor: 'non-imperative solicitation definition only' },
  operating4: { batchSize: 4, maxTokens: 3072, factor: 'unchanged production control; selected comparisons only' }
};
const NOMINAL = '이용 권유는 명령형 문장에 한정하지 않는다. 문맥에서 불법 서비스의 제공·거래·연락을 제안하는 명사구나 짧은 표현도 그 게시행위가 실제 이용을 유도하면 이용권유다. 단순한 주제·서비스의 언급, 정상 서비스 안내, 예방·보도를 위한 인용과는 문맥으로 구분한다.';

function contract(mode, { readingAid } = {}) {
  assert(Object.hasOwn(definitions, mode) || mode === 'reading4', 'Unknown second-round method');
  if (mode === 'operating4') return firstRoundContract('baseline4');
  const base = firstRoundContract('role_scope');
  if (mode === 'nominal4') return { ...base, SYSTEM: base.SYSTEM + '\n' + NOMINAL };
  if (mode === 'reading4') {
    assert.equal(typeof readingAid, 'function', 'reading4 requires an explicitly selected offline reading helper');
    return { ...base, initialEvidence(candidate) {
      const input = base.initialEvidence(candidate);
      // The optional helper receives only raw text, never IDs, labels, URL or surrounding examples.
      const reading = readingAid(candidate.raw_text);
      assert(reading === null || (typeof reading.text === 'string' && reading.status === 'alternative_reading_not_evidence' && Array.isArray(reading.transforms)),
        'Reading helper must return a marked alternative with transformation spans, or null');
      return { ...input, reading_aid: reading };
    } };
  }
  return base;
}

function specs({ readingAid } = {}) {
  const selected = Object.fromEntries(Object.entries(definitions).map(([mode, definition]) =>
    [mode, { contract: contract(mode), batchSize: definition.batchSize, maxTokens: definition.maxTokens || 1024 }]));
  // No normalization candidate is silently enabled before its separate rule has been fixed.
  if (readingAid !== undefined) selected.reading4 = { contract: contract('reading4', { readingAid }), batchSize: 4, maxTokens: 1024 };
  return selected;
}

function selfCheck() {
  const base = firstRoundContract('role_scope'), choices = specs();
  const candidate = { node_id: 'fixture', raw_text: '자료 안내', normalized_text: '자료 안내', page_title: '자료', links: [],
    nearby: { before: '', after: '' }, context_evidence: { scope: { tag: 'section' }, target_tag: 'p', target_quoted: false,
      truncated: false, units: [{ relation: 'target', tag: 'p', quoted: false }] } };
  const before = JSON.stringify(candidate);
  assert.deepEqual(Object.keys(choices), ['role4', 'role8', 'role16', 'nominal4', 'operating4']);
  for (const [mode, item] of Object.entries(choices)) {
    const expectedContract = mode === 'operating4' ? require('../src/core/judgment.cjs').contract() : base;
    assert.equal(item.maxTokens, mode === 'operating4' ? 3072 : 1024);
    assert.equal(item.batchSize, definitions[mode].batchSize);
    assert.deepEqual(item.contract.initialEvidence(candidate), expectedContract.initialEvidence(candidate));
    assert.equal(item.contract.validateModelDecisions, base.validateModelDecisions);
    assert.deepEqual(item.contract.modelItemSchema(), base.modelItemSchema());
    assert.equal(item.contract.promptJson, base.promptJson);
    assert.equal(item.contract.formatRepair, false);
    for (const act of ['이용권유', '인용보도', '일반정보', '판단불가']) {
      const raw = [{ node_id: candidate.node_id, publication_act: act }];
      assert.deepEqual(item.contract.validateModelDecisions(raw, [candidate]), base.validateModelDecisions(raw, [candidate]));
    }
  }
  for (const mode of ['role4', 'role8', 'role16']) {
    const { initialEvidence: actualReader, ...actual } = choices[mode].contract;
    const { initialEvidence: baselineReader, ...expected } = base;
    assert.deepEqual(actual, expected);
    assert.deepEqual(actualReader(candidate), baselineReader(candidate));
  }
  assert.equal(choices.nominal4.contract.SYSTEM, base.SYSTEM + '\n' + NOMINAL);
  assert.deepEqual(choices.operating4.contract, require('../src/core/judgment.cjs').contract());
  assert.equal(choices.operating4.batchSize, require('../src/core/judgment.cjs').MAX_BATCH);
  assert.throws(() => contract('reading4'));
  let received;
  const aid = { text: '보조 읽기 자료', status: 'alternative_reading_not_evidence', transforms: [] };
  const reading = specs({ readingAid: text => { received = text; return aid; } }).reading4.contract.initialEvidence(candidate);
  assert.equal(received, candidate.raw_text);
  assert.deepEqual(reading.reading_aid, aid);
  delete reading.reading_aid;
  assert.deepEqual(reading, base.initialEvidence(candidate));
  assert.equal(contract('reading4', { readingAid: () => null }).initialEvidence(candidate).reading_aid, null);
  assert.equal(JSON.stringify(candidate), before);
  assert.throws(() => contract('unknown'));
  console.log('PASS: round2 factor isolation, 1024 candidate budgets, exact 3072 production control, frozen schema/validator/input, explicit auxiliary reading only');
}

async function main(argv = process.argv.slice(2)) {
  if (!argv.includes('--live')) return selfCheck();
  const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
  const project = path.resolve(__dirname, '../..');
  const arg = (key, fallback) => argv.includes(key) ? argv[argv.indexOf(key) + 1] : fallback;
  const read = file => JSON.parse(fs.readFileSync(file));
  const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const split = arg('--split', 'dev').replace(/^develop$/, 'dev');
  assert(['dev', 'holdout'].includes(split), 'Unknown split');
  const modes = arg('--modes', 'role4,role16,reading4,nominal4').split(',');
  assert(modes.length && new Set(modes).size === modes.length, 'Duplicate or empty modes');
  const rounds = Number(arg('--rounds', '1'));
  assert(Number.isInteger(rounds) && rounds >= 1 && rounds <= 2, 'Use one or two predefined orders');
  const limits = { calls: Number(arg('--calls', '64')), tokens: Number(arg('--tokens', '600000')), seconds: Number(arg('--seconds', '3600')) };
  for (const [key, maximum] of Object.entries({ calls: 64, tokens: 600000, seconds: 3600 })) {
    assert(Number.isInteger(limits[key]) && limits[key] > 0 && limits[key] <= maximum, 'Round2 budget exceeded: ' + key);
  }
  const data = path.resolve(project, arg('--data', '.runtime/replica-intent-data-v1'));
  const root = path.resolve(project, arg('--out', '.runtime/replica-intent-round2-' + Date.now()));
  assert(!fs.existsSync(root), 'Use a fresh result directory');
  const plan = path.join(project, 'docs/replica-intent-round2-plan.md');
  let selectionFile;
  if (split === 'holdout') {
    assert(argv.includes('--unlock-holdout'), 'Holdout remains sealed');
    assert(arg('--selection-record'), 'Holdout requires a separately frozen JSON selection record');
    selectionFile = path.resolve(project, arg('--selection-record'));
    assert.notEqual(selectionFile, plan, 'Selection must be a separate record');
    const selection = read(selectionFile);
    assert.equal(selection.status, 'frozen');
    assert(Number.isFinite(Date.parse(selection.frozen_at)) && Date.parse(selection.frozen_at) <= Date.now(), 'Missing selection freeze time');
    assert.deepEqual(selection.modes, modes, 'Requested modes differ from frozen selection');
    assert.equal(selection.rounds, rounds, 'Requested orders differ from frozen selection');
    assert.equal(selection.dataset_manifest_sha256, sha(path.join(data, 'manifest.json')));
    assert.equal(selection.hashes?.['agent/experiments/replica-intent-round2.cjs'], sha(__filename));
    for (const [file, expected] of Object.entries(selection.hashes)) assert.equal(sha(path.resolve(project, file)), expected, 'Selected source changed: ' + file);
  }
  const { verifyDataset, verifyEvidence } = require('./replica-intent-run.cjs');
  verifyDataset(data);
  verifyEvidence(data, split); // Existing sealed evidence is required; this CLI never collects or generates it.
  const helper = path.join(project, '.runtime/replica-jamo-stage/jamo-reading-aid.cjs');
  const helperBaseline = path.join(project, '.runtime/replica-jamo-stage/jamo-baseline.cjs');
  const available = specs(modes.includes('reading4') ? { readingAid: require(helper).readingAid } : {});
  assert(modes.every(mode => Object.hasOwn(available, mode)), 'Unknown or unavailable method');
  const methodSpecs = Object.fromEntries(modes.map(mode => [mode, available[mode]]));
  const evidenceFile = path.join(data, split + '-evidence.json'), labelsFile = path.join(data, split + '-labels.json');
  const snapshot = read(evidenceFile), labels = read(labelsFile);
  assert.equal(snapshot.candidates.length, labels.length);
  assert.deepEqual(new Set(snapshot.candidates.map(c => c.node_id)), new Set(labels.map(l => l.node_id)), 'Label/evidence ID mismatch');
  const expectedCalls = rounds * modes.reduce((sum, mode) => sum + Math.ceil(snapshot.candidates.length / methodSpecs[mode].batchSize), 0);
  assert(expectedCalls <= limits.calls, 'Planned batches exceed the fixed call budget');
  const sourceFiles = [__filename, require.resolve('./replica-intent-methods.cjs'), require.resolve('./replica-intent-run.cjs'),
    require.resolve('./replica-intent-site.cjs'), require.resolve('../src/core/judgment.cjs'), helper, helperBaseline, plan,
    path.join(data, 'manifest.json'), path.join(data, 'catalog.json'), path.join(data, split + '-collection-checks.json'),
    evidenceFile, labelsFile, ...(selectionFile ? [selectionFile] : [])];
  const hashes = Object.fromEntries(sourceFiles.map(file => [file, sha(file)]));
  const { runComparison } = require('./semantic-search-run.cjs');
  try {
    console.log(JSON.stringify({ root, split, modes, rounds, candidates: snapshot.candidates.length, expectedCalls, limits,
      control: 'role4 is role_scope at 1024 output tokens; it is not the production baseline4 contract' }));
    return await runComparison({ root, groups: [{ name: split, labels, snapshot }], modes, rounds,
      maxTokens: 1024, methodSpecs, sourceFiles, limits });
  } finally {
    const comparisonManifest = path.join(root, 'manifest.json');
    const checked = { ...hashes, ...(fs.existsSync(comparisonManifest) ? read(comparisonManifest).hashes : {}) };
    const changed = Object.entries(checked).filter(([file, expected]) => !fs.existsSync(file) || sha(file) !== expected).map(([file]) => file);
    let freshnessError = null;
    try { verifyDataset(data); verifyEvidence(data, split); } catch (error) { freshnessError = error.message; }
    if (fs.existsSync(root)) fs.writeFileSync(path.join(root, 'source-after.json'), JSON.stringify({ verified: !changed.length && !freshnessError,
      at: new Date().toISOString(), checked_files: Object.keys(checked).length, changed, freshness_error: freshnessError }, null, 2));
    assert(!changed.length && !freshnessError, 'Source/data changed during comparison: ' + (changed.join(', ') || freshnessError));
  }
}

module.exports = { definitions, contract, specs, selfCheck, main };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
