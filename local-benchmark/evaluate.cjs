// Browser-backed scorer: compare actual DOM elements, not selector strings.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ROOT = path.resolve(process.env.BENCHMARK_ROOT || __dirname);
const { chromium } = require(require.resolve('playwright', {paths: [ROOT]}));
const truth = JSON.parse(fs.readFileSync(path.join(ROOT, 'private/ground_truth.json'), 'utf8'));

function canonical(value, base) {
  const url = new URL(value, base);
  const entries = [...url.searchParams].sort(([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d));
  return url.host.toLowerCase() + url.pathname.replace(/\/+$/, '') + (entries.length ? '?' + new URLSearchParams(entries) : '');
}

function splitLocation(value) {
  const result = [];
  let quote = '', depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\') { i++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '[' || char === '(') depth++;
    if (char === ']' || char === ')') depth--;
    if (!depth && value.slice(i, i + 3) === '>>>') {
      result.push(value.slice(start, i).trim()); start = i + 3; i += 2;
    }
  }
  result.push(value.slice(start).trim());
  if (quote || depth || result.some(x => !x)) throw Error('Invalid location syntax');
  return result;
}

async function element(frame, selector) {
  const handle = await frame.evaluateHandle(selector => {
    let nodes = [...document.querySelectorAll(selector)];
    if (!nodes.length) {
      // The contest uses absolute iframe src values even when HTML has a relative src.
      const match = selector.match(/\[src\s*=\s*(["'])(.*?)\1\]/);
      if (match) {
        const resolved = new URL(match[2], document.baseURI).href;
        nodes = [...document.querySelectorAll(selector.replace(match[0], '[src]'))]
          .filter(node => node.tagName === 'IFRAME' && node.src === resolved);
      }
    }
    if (nodes.length !== 1) throw Error(`Selector must resolve to exactly one element, found ${nodes.length}`);
    return nodes[0];
  }, selector);
  return handle.asElement();
}

async function resolve(page, location) {
  const parts = splitLocation(location);
  let frame = page.mainFrame();
  for (const selector of parts.slice(0, -1)) {
    const handle = await element(frame, selector);
    const next = await handle.contentFrame();
    await handle.dispose();
    if (!next) throw Error('Frame path points to a non-iframe element');
    frame = next;
  }
  return { frame, handle: await element(frame, parts.at(-1)) };
}

function locationFor(item, base) {
  return [...item.frames.map(src => `iframe[src="${new URL(src, base).href}"]`), item.selector].join(' >>> ');
}

function meta(base, split) {
  return { topic: 'TOPIC', entry_url: new URL(`/${split}/`, base).href,
    started_at: '2026-09-21T10:00:00+09:00', finished_at: '2026-09-21T10:00:01+09:00', elapsed_sec: 1,
    tool_version: 'oracle-for-scorer-self-test-only' };
}

function oracle(split, base) {
  const findings = [];
  for (const item of truth.splits[split].cases) for (const technique of item.techniques) {
    findings.push({ id: `f_${findings.length + 1}`, url: new URL(item.page, base).href, is_violation: true,
      location: locationFor(item, base), evidence_text: item.text, technique });
  }
  return { meta: meta(base, split), findings };
}

function validateMeta(data, base, split) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).sort().join(',') !== 'findings,meta') throw Error('Top-level keys must be exactly meta and findings');
  const m = data.meta;
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw Error('meta must be an object');
  for (const key of ['topic', 'entry_url', 'started_at', 'finished_at']) if (typeof m[key] !== 'string' || !m[key].trim()) throw Error(`Missing/invalid meta.${key}`);
  if (!['TOPIC', '불법광고'].includes(m.topic)) throw Error('Local scorer accepts topic TOPIC or 불법광고 (contest ambiguity)');
  if (!/^https?:\/\//.test(m.entry_url) || canonical(m.entry_url) !== canonical(`/${split}/`, base)) throw Error('entry_url does not match selected benchmark entry');
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (![m.started_at, m.finished_at].every(s => iso.test(s) && Number.isFinite(Date.parse(s)))) throw Error('Timestamps must be ISO 8601 with timezone');
  if (Date.parse(m.finished_at) < Date.parse(m.started_at)) throw Error('finished_at precedes started_at');
  if (typeof m.elapsed_sec !== 'number' || !Number.isFinite(m.elapsed_sec) || m.elapsed_sec < 0) throw Error('elapsed_sec must be a non-negative number');
  if ('tool_version' in m && typeof m.tool_version !== 'string') throw Error('tool_version must be a string');
  if (!Array.isArray(data.findings)) throw Error('findings must be an array');
}

function validateFinding(item, ids) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('finding must be an object');
  for (const key of ['id', 'url', 'location', 'evidence_text', 'technique']) if (typeof item[key] !== 'string' || !item[key].trim()) throw Error(`Missing/invalid ${key}`);
  if (ids.has(item.id)) throw Error('Duplicate id');
  if (!/^https?:\/\//.test(item.url)) throw Error('url must be absolute HTTP(S)');
  new URL(item.url);
  if (typeof item.is_violation !== 'boolean') throw Error('is_violation must be boolean');
  if (!truth.techniques.includes(item.technique)) throw Error('technique must be one of the four required codes');
}

async function launch() {
  const channel = process.env.BROWSER_CHANNEL || 'msedge';
  return chromium.launch(channel === 'chromium' ? { headless: true } : { headless: true, channel });
}

async function contextFor(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === base ? route.continue() : route.abort();
  });
  return context;
}

async function ready(page, url) {
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
  if (!response || !response.ok()) throw Error(`Fixture unavailable: ${url}`);
  await page.waitForFunction(() => !document.querySelector('.comment-template'));
}

async function grade(data, split, base, browser) {
  validateMeta(data, base, split);
  const context = await contextFor(browser, base);
  const cases = truth.splits[split].cases;
  const ids = new Set(), seen = new Set(), matched = new Set(), flaggedNegatives = new Set();
  const detail = [], cache = new Map();
  const perTechnique = Object.fromEntries(truth.techniques.map(t => [t, { tp: 0, fp: 0, fn: 0 }]));
  let tp = 0, fp = 0, invalid = 0, duplicates = 0;
  try {
    for (const [index, item] of data.findings.entries()) {
      const row = { index, id: item?.id ?? null, status: '' };
      try { validateFinding(item, ids); ids.add(item.id); }
      catch (error) { invalid++; detail.push({ ...row, status: 'invalid', error: error.message }); continue; }
      const key = canonical(item.url);
      const pageCases = cases.filter(c => canonical(c.page, base) === key);
      const knownPage = truth.splits[split].pages.find(p => canonical(p.path, base) === key);
      let match, identity;
      try {
        if (!knownPage) throw Error('URL outside scored article pages; use the top-level article URL for iframe findings');
        if (!cache.has(key)) {
          const page = await context.newPage();
          await ready(page, new URL(knownPage.path, base).href);
          cache.set(key, page);
        }
        const resolved = await resolve(cache.get(key), item.location);
        // A DOM path is only an internal deduplication identity, never the matching criterion.
        const elementPath = await resolved.handle.evaluate(node => {
          const parts = [];
          while (node && node.nodeType === 1) {
            parts.unshift(node.tagName + ':' + (node.parentElement ? [...node.parentElement.children].indexOf(node) : 0));
            node = node.parentElement;
          }
          return parts.join('/');
        });
        identity = `${key}|${resolved.frame.url()}|${elementPath}|${item.technique}`;
        for (const candidate of pageCases) {
          const target = await resolve(cache.get(key), locationFor(candidate, base));
          const same = target.frame === resolved.frame && await resolved.handle.evaluate((node, other) => node === other, target.handle);
          await target.handle.dispose();
          if (same) { match = candidate; break; }
        }
        await resolved.handle.dispose();
      } catch (error) {
        identity = `${key}|unresolved:${item.location}|${item.technique}`;
        row.error = error.message;
      }
      if (seen.has(identity)) { duplicates++; detail.push({ ...row, status: 'duplicate' }); continue; }
      seen.add(identity);
      if (match && item.is_violation && match.techniques.includes(item.technique)) {
        tp++; perTechnique[item.technique].tp++;
        matched.add(`${match.case_id}|${item.technique}`);
        detail.push({ ...row, status: 'tp', case_id: match.case_id, technique: item.technique,
          evidence_exact: item.evidence_text === match.text });
      } else {
        fp++; perTechnique[item.technique].fp++;
        if (match && !match.techniques.length) flaggedNegatives.add(match.case_id);
        detail.push({ ...row, status: 'fp', case_id: match?.case_id ?? null, technique: item.technique });
      }
    }
  } finally { await context.close(); }
  const missing = [];
  for (const item of cases) for (const technique of item.techniques) {
    if (!matched.has(`${item.case_id}|${technique}`)) {
      perTechnique[technique].fn++;
      missing.push({ case_id: item.case_id, page: item.page, technique });
    }
  }
  const ratio = (a, b) => b ? a / b : null;
  for (const stats of Object.values(perTechnique)) {
    stats.precision = ratio(stats.tp, stats.tp + stats.fp);
    stats.recall = ratio(stats.tp, stats.tp + stats.fn);
  }
  const fn = missing.length, positives = cases.filter(c => c.techniques.length);
  const complete = positives.filter(c => c.techniques.every(t => matched.has(`${c.case_id}|${t}`))).length;
  return { dataset_version: truth.version, dataset_sha256: truth.dataset_sha256, split,
    submitted: data.findings.length, tp, fp, fn, invalid, duplicates,
    precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: ratio(2 * tp, 2 * tp + fp + fn),
    precision_including_invalid: ratio(tp, tp + fp + invalid),
    complete_positive_elements: complete, positive_elements: positives.length,
    known_negative_elements_flagged: flaggedNegatives.size,
    known_negative_elements: cases.filter(c => !c.techniques.length).length,
    known_negative_false_positive_rate: flaggedNegatives.size / cases.filter(c => !c.techniques.length).length,
    evidence_mismatches: detail.filter(r => r.status === 'tp' && !r.evidence_exact).length,
    elapsed_sec_reported: data.meta.elapsed_sec, time_limit_exceeded: data.meta.elapsed_sec > 1800,
    timing_note: 'Self-reported only. Measure actual end-to-end time in the agent runner. No official point formula is available.',
    per_technique: perTechnique, missing, details: detail };
}

function fingerprint() {
  const files = [];
  function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) item.isDirectory() ? walk(path.join(dir, item.name)) : files.push(path.join(dir, item.name)); }
  const publicDir = path.join(ROOT, 'public');
  walk(publicDir);
  const digest = crypto.createHash('sha256');
  for (const file of files.sort()) { digest.update(path.relative(publicDir, file).replaceAll('\\', '/')); digest.update(fs.readFileSync(file)); }
  digest.update(fs.readFileSync(path.join(ROOT, 'private/routes.json')));
  const { dataset_sha256, ...annotations } = truth;
  digest.update(JSON.stringify(annotations));
  return digest.digest('hex');
}

async function verify(base, browser) {
  assert.equal(fingerprint(), truth.dataset_sha256, 'Public fixtures changed; rebuild and version your dataset');
  const context = await contextFor(browser, base);
  const errors = [], coverage = {};
  try {
    for (const split of ['dev', 'eval']) {
      const queue = [new URL(`/${split}/`, base).href], visited = new Set();
      while (queue.length) {
        const url = queue.shift();
        if (visited.has(canonical(url))) continue;
        visited.add(canonical(url));
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await ready(page, url);
        const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(n => n.href));
        for (const link of links) {
          const u = new URL(link);
          if (u.origin === base && u.pathname.startsWith(`/${split}/`) && !visited.has(canonical(link))) queue.push(link);
        }
        await page.close();
        assert(visited.size <= 30, 'Unexpected navigation loop');
      }
      for (const article of truth.splits[split].pages) assert(visited.has(canonical(article.path, base)), 'Unreachable article ' + article.path);
      coverage[split] = { reachable_top_pages: visited.size, verified_cases: 0 };
      for (const article of truth.splits[split].pages) {
        const page = await context.newPage();
        await ready(page, new URL(article.path, base).href);
        const documentText = await page.content();
        assert(!/HOMOGLYPH|TRANSPARENT|OFFSCREEN|case_id|is_violation|ground_truth/.test(documentText), 'Annotation leaked into HTML');
        for (const item of truth.splits[split].cases.filter(c => c.page === article.path)) {
          const { handle } = await resolve(page, locationFor(item, base));
          const facts = await handle.evaluate(node => {
            const chain = [];
            for (let e = node; e; e = e.parentElement) {
              const s = getComputedStyle(e);
              chain.push({ opacity: s.opacity, display: s.display, color: s.color, background: s.backgroundColor });
            }
            const style = getComputedStyle(node), rect = node.getBoundingClientRect();
            return { text: node.textContent, chain, font: parseFloat(style.fontSize), x: rect.x, y: rect.y };
          });
          assert.equal(facts.text, item.text, item.case_id + ' original text changed');
          if (item.techniques.includes('HOMOGLYPH')) assert(/[\uFF01-\uFF5E\u0370-\u03FF\u0400-\u04FF]/u.test(facts.text) || facts.text.includes('B0NUS'), item.case_id + ' missing confusable characters');
          if (item.techniques.includes('JAMO')) assert(/[\u1100-\u11FF\u3130-\u318F]/u.test(facts.text), item.case_id + ' missing decomposed jamo');
          const visual = item.visual;
          if (visual.startsWith('opacity')) assert(facts.chain.some(s => Number(s.opacity) === 0), item.case_id);
          if (visual.startsWith('transparent')) assert.equal(facts.chain[0].color, 'rgba(0, 0, 0, 0)', item.case_id);
          if (visual.startsWith('same-color')) {
            const background = facts.chain.find(s => s.background !== 'rgba(0, 0, 0, 0)');
            assert.equal(facts.chain[0].color, background.background, item.case_id);
          }
          if (visual.startsWith('display')) assert(facts.chain.some(s => s.display === 'none'), item.case_id);
          if (visual.includes('left')) assert(facts.x < -9000, item.case_id);
          if (visual === 'top') assert(facts.y < -9000, item.case_id);
          if (['font-zero', 'font-one', 'transparent-font'].includes(visual)) assert(facts.font <= 1, item.case_id);
          await handle.dispose(); coverage[split].verified_cases++;
        }
        await page.close();
      }
    }
    assert.deepEqual(errors, [], 'JavaScript runtime errors');
    const page = await context.newPage();
    for (const endpoint of ['/private/ground_truth.json', '/ground_truth.json', '/build.py', '/private/routes.json', '/public/', '/%2e%2e/private/ground_truth.json']) {
      const response = await page.goto(base + endpoint); assert.equal(response.status(), 404, 'Private path accessible: ' + endpoint);
    }
    const dir = path.join(ROOT, 'artifacts'); fs.mkdirSync(dir, { recursive: true });
    await ready(page, base + '/dev/'); await page.screenshot({ path: path.join(dir, 'home.png'), fullPage: true });
    await ready(page, base + '/dev/board/list?board=free&page=1'); await page.screenshot({ path: path.join(dir, 'board.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page, base + '/dev/');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile horizontal overflow');
    await page.screenshot({ path: path.join(dir, 'mobile.png'), fullPage: true });
  } finally { await context.close(); }
  for (const split of ['dev', 'eval']) {
    const data = oracle(split, base), result = await grade(data, split, base, browser);
    assert.equal(result.tp, 20); assert.equal(result.fp, 0); assert.equal(result.fn, 0); assert.equal(result.evidence_mismatches, 0);
    const empty = await grade({ meta: meta(base, split), findings: [] }, split, base, browser);
    assert.equal(empty.fn, 20); assert.equal(empty.recall, 0); assert.equal(empty.precision, null);
    const equivalent = structuredClone(data);
    for (const item of equivalent.findings) {
      item.location = item.location.replace(/p#(n[\da-f]+)/g, 'p[id="$1"]');
      const u = new URL(item.url); u.protocol = 'https:'; u.pathname += '/';
      u.search = new URLSearchParams([...u.searchParams].reverse()).toString(); u.hash = 'section'; item.url = u.href;
    }
    const alias = await grade(equivalent, split, base, browser); assert.equal(alias.tp, 20);
    const duplicate = structuredClone(data); duplicate.findings.push({ ...equivalent.findings[0], id: 'extra-duplicate' });
    const dedup = await grade(duplicate, split, base, browser); assert.equal(dedup.tp, 20); assert.equal(dedup.duplicates, 1);
    const bad = structuredClone(data); bad.findings[0].technique = 'TRANSPARENT,JAMO';
    const malformed = await grade(bad, split, base, browser); assert.equal(malformed.invalid, 1); assert.equal(malformed.fn, 1);
    const wrong = structuredClone(data); wrong.findings[0].technique = truth.techniques.find(t => !truth.splits[split].cases.find(c => locationFor(c, base) === wrong.findings[0].location).techniques.includes(t));
    const wrongType = await grade(wrong, split, base, browser); assert.equal(wrongType.fp, 1); assert.equal(wrongType.fn, 1);
    const ambiguous = structuredClone(data); ambiguous.findings[0].location = 'p';
    const ambiguousResult = await grade(ambiguous, split, base, browser); assert.equal(ambiguousResult.fp, 1); assert.equal(ambiguousResult.fn, 1);
    const wrongUrl = structuredClone(data); wrongUrl.findings[0].url += '0';
    const wrongUrlResult = await grade(wrongUrl, split, base, browser); assert.equal(wrongUrlResult.fp, 1); assert.equal(wrongUrlResult.fn, 1);
    const falseAlarms = { meta: meta(base, split), findings: truth.splits[split].cases.filter(c => !c.techniques.length).map((c, i) => ({ id: 'negative-' + i, url: new URL(c.page, base).href, location: locationFor(c, base), technique: 'OFFSCREEN', evidence_text: c.text, is_violation: true })) };
    const neg = await grade(falseAlarms, split, base, browser); assert.equal(neg.fp, 8); assert.equal(neg.known_negative_false_positive_rate, 1);
    fs.writeFileSync(path.join(ROOT, 'private', `oracle-${split}.json`), JSON.stringify(data, null, 2));
    coverage[split].scorer_checks = ['perfect', 'empty', 'equivalent-selectors-and-URLs', 'duplicate', 'invalid-schema', 'wrong-technique', 'ambiguous-selector', 'wrong-query', 'negative-false-alarms'];
  }
  const output = { verified_at: new Date().toISOString(), dataset_sha256: truth.dataset_sha256, playwright: require('playwright/package.json').version, browser: browser.version(), coverage, note: 'Oracle checks verify the fixture and scorer. These are not Qwen/agent performance results.' };
  fs.writeFileSync(path.join(ROOT, 'artifacts/verification.json'), JSON.stringify(output, null, 2));
  return output;
}

async function main() {
  const args = process.argv.slice(2), action = args.shift();
  function option(name, fallback) { const i = args.indexOf(name); if (i < 0) return fallback; if (!args[i + 1]) throw Error('Missing value for ' + name); return args.splice(i, 2)[1]; }
  const split = option('--split', 'eval');
  const suppliedBase = new URL(option('--base', 'http://127.0.0.1:8765'));
  if (suppliedBase.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(suppliedBase.hostname) || suppliedBase.username || suppliedBase.password) throw Error('Scorer only connects to the local HTTP fixture');
  const base = suppliedBase.origin, report = option('--report', null);
  if (!truth.splits[split]) throw Error('split must be dev or eval');
  if (!['score', 'verify'].includes(action)) throw Error('Usage: node evaluate.cjs verify | score result.json --split eval [--base URL] [--report report.json]');
  if (action === 'score' && args.length !== 1) throw Error('Provide one result.json file');
  if (action === 'verify' && args.length) throw Error('Unknown arguments');
  if (fingerprint() !== truth.dataset_sha256) throw Error('Dataset files changed since build; rebuild before comparing runs');
  let data;
  if (action === 'score') {
    const bytes = fs.readFileSync(args[0]);
    if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw Error('UTF-8 BOM is not allowed');
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    validateMeta(data, base, split);
  }
  const browser = await launch();
  try {
    const output = action === 'verify' ? await verify(base, browser) : await grade(data, split, base, browser);
    if (report) fs.writeFileSync(path.resolve(report), JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
  } finally { await browser.close(); }
}

module.exports = {truth, grade, oracle, meta, fingerprint, launch, contextFor, ready, resolve, locationFor, canonical};
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
