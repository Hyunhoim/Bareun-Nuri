const { chromium } = require('playwright');
const crypto = require('node:crypto');
const { normalizeText } = require('./jamo.cjs');

function canonical(value) {
  const url = new URL(value);
  url.hash = '';
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}

function inScope(value, entry, scope) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === entry.origin &&
      !url.username && !url.password && (scope === '/' || url.pathname === scope.replace(/\/$/, '') || url.pathname.startsWith(scope));
  } catch { return false; }
}

// This function executes inside the page. It reads DOM evidence, never fixture annotations.
function readDocument() {
  function selector(element) {
    if (element.id && document.querySelectorAll('#' + CSS.escape(element.id)).length === 1) {
      return element.tagName.toLowerCase() + '#' + CSS.escape(element.id);
    }
    const parts = [];
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      const siblings = node.parentElement ? [...node.parentElement.children].filter(n => n.tagName === node.tagName) : [node];
      parts.unshift(tag + (siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')' : ''));
    }
    return parts.join(' > ');
  }
  const root = document.querySelector('article') || document.querySelector('main,[role="main"]') || document.body;
  if (!root) return { nodes: [], links: [], title: document.title };
  const primary = 'p,li,td,th,h1,h2,h3,h4,dt,dd,button,label,summary';
  const elements = [...root.querySelectorAll(primary)].filter(node => !node.querySelector(primary));
  for (const node of root.querySelectorAll('a,span,div')) {
    if (!node.closest(primary) && !node.querySelector(primary) &&
        [...node.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) &&
        !node.parentElement?.closest('script,style,template,noscript')) elements.push(node);
  }
  const nodes = elements.filter(node => node.textContent.trim() && !node.closest('script,style,template,noscript')).map(node => {
    const chain = [];
    for (let current = node; current; current = current.parentElement) {
      const style = getComputedStyle(current), rect = current.getBoundingClientRect();
      chain.push({ tag: current.tagName.toLowerCase(), opacity: Number(style.opacity), display: style.display,
        visibility: style.visibility, color: style.color, background: style.backgroundColor,
        font_size: parseFloat(style.fontSize), position: style.position,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } });
    }
    const location = selector(node);
    if (document.querySelectorAll(location).length !== 1 || document.querySelector(location) !== node) throw Error('Non-unique generated selector');
    return { selector: location, raw_text: node.textContent, own_style: chain[0], ancestors: chain.slice(1),
      nearby: { before: (node.previousElementSibling?.textContent || '').slice(0, 400), after: (node.nextElementSibling?.textContent || '').slice(0, 400) },
      context: (node.parentElement?.textContent || node.textContent).slice(0, 6000),
      links: [...node.querySelectorAll('a[href]')].map(a => ({ text: a.textContent, url: a.href })) };
  });
  return { nodes, title: document.title, links: [...document.querySelectorAll('a[href]')].map(a => a.href),
    iframes: [...document.querySelectorAll('iframe')].map(frame => ({ selector: selector(frame), src: frame.src })) };
}

function signalsFor(node) {
  const signals = [];
  if (/[\uFF01-\uFF5E\u0370-\u03FF\u0400-\u04FF]/u.test(node.raw_text) || /[a-z][0-9][a-z]/i.test(node.raw_text)) signals.push('HOMOGLYPH');
  if (/[\u1100-\u11FF\u3130-\u318F]/u.test(node.raw_text)) signals.push('JAMO');
  const chain = [node.own_style, ...node.ancestors];
  const background = chain.find(s => s.background && !/rgba\([^)]*,\s*0\)$/.test(s.background))?.background || 'rgb(255, 255, 255)';
  if (chain.some(s => s.opacity === 0) || /rgba\([^)]*,\s*0\)$/.test(node.own_style.color) || node.own_style.color === background) signals.push('TRANSPARENT');
  if (chain.some(s => s.display === 'none') || node.own_style.font_size <= 1 ||
      chain.some(s => ['absolute', 'fixed'].includes(s.position) && (s.rect.right < 0 || s.rect.bottom < 0))) signals.push('OFFSCREEN');
  return signals;
}

async function collect(entryUrl, options = {}) {
  const entry = new URL(entryUrl);
  if (!['http:', 'https:'].includes(entry.protocol) || entry.username || entry.password) throw Error('Entry must be an HTTP(S) URL without credentials');
  const scope = options.scope || '/' + (entry.pathname.split('/').filter(Boolean)[0] || '') + '/';
  const normalizedScope = scope === '//' ? '/' : scope;
  if (!normalizedScope.startsWith('/') || !normalizedScope.endsWith('/') || !inScope(entryUrl, entry, normalizedScope)) throw Error('Scope must contain entry URL and start/end with /');
  const maxPages = options.maxPages ?? 40, maxNodes = options.maxNodes ?? 1000;
  const signal = options.signal;
  signal?.throwIfAborted();
  const browser = await chromium.launch({ headless: true, ...(options.channel === 'chromium' ? {} : { channel: options.channel || 'msedge' }) });
  const onAbort = () => { browser.close().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const started = performance.now(), pages = [], candidates = [], blocked = new Set(), visited = new Set();
  const queue = [entryUrl];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      const allowed = request.method() === 'GET' && url.origin === entry.origin &&
        (!request.isNavigationRequest() || inScope(url.href, entry, normalizedScope));
      if (!allowed) blocked.add(url.origin + url.pathname);
      return allowed ? route.continue() : route.abort();
    });
    // ponytail: serial crawl for reproducible shallow runs; add a bounded page pool if crawl latency dominates.
    while (queue.length) {
      signal?.throwIfAborted();
      const requested = queue.shift(), key = canonical(requested);
      if (visited.has(key)) continue;
      if (pages.length >= maxPages) throw Error(`Page limit ${maxPages} reached with unvisited URLs`);
      visited.add(key);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const response = await page.goto(requested, { waitUntil: 'load', timeout: 15000 });
      if (!response?.ok()) throw Error(`Page failed: ${requested} HTTP ${response?.status() ?? 'none'}`);
      await page.waitForTimeout(300);
      const actual = page.url();
      if (!inScope(actual, entry, normalizedScope)) throw Error('Page redirected outside scope');
      visited.add(canonical(actual));
      const title = await page.title();
      pages.push({ url: actual, title });
      for (const frame of page.frames()) {
        signal?.throwIfAborted();
        if (!inScope(frame.url(), entry, normalizedScope)) throw Error('Unsupported or unloaded frame: ' + frame.url());
        const document = await frame.evaluate(readDocument);
        const frames = [], frameSelectors = [];
        for (let current = frame; current.parentFrame(); current = current.parentFrame()) {
          const handle = await current.frameElement();
          const info = await handle.evaluate(node => {
            const siblings = [...node.ownerDocument.querySelectorAll('iframe')].filter(other => other.src === node.src);
            if (siblings.length === 1) return { selector: `iframe[src="${node.src.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`, src: node.src };
            const parts = [];
            for (let e = node; e; e = e.parentElement) {
              const tag = e.tagName.toLowerCase();
              const peers = e.parentElement ? [...e.parentElement.children].filter(p => p.tagName === e.tagName) : [e];
              parts.unshift(tag + (peers.length > 1 ? `:nth-of-type(${peers.indexOf(e) + 1})` : ''));
            }
            return { selector: parts.join(' > '), src: node.src };
          });
          await handle.dispose(); frames.unshift(info.src); frameSelectors.unshift(info.selector);
        }
        for (const raw of document.nodes) {
          if (raw.raw_text.length > 12000) throw Error('Paragraph exceeds 12000 characters; explicit chunking is required');
          const location = [...frameSelectors, raw.selector].join(' >>> ');
          const identity = actual + '\n' + location;
          const node = { node_id: 'n_' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16),
            url: actual, location, frame_urls: frames, page_title: title, ...raw };
          node.normalized_text = normalizeText(node.raw_text);
          node.signals = signalsFor(node);
          candidates.push(node);
          if (candidates.length > maxNodes) throw Error(`Candidate limit ${maxNodes} exceeded`);
        }
        for (const link of document.links) if (inScope(link, entry, normalizedScope) && !visited.has(canonical(link))) queue.push(link);
      }
      await page.close();
      options.onProgress?.({ pages: pages.length, candidates: candidates.length });
    }
    if (!pages.length || !candidates.length) throw Error('No inspectable pages or text candidates; this is not a clean scan');
    const content = { entry_url: entryUrl, scope: normalizedScope, pages, candidates, blocked_requests: [...blocked].sort() };
    return { ...content, snapshot_sha256: crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex'),
      collected_at: new Date().toISOString(), collection_elapsed_sec: (performance.now() - started) / 1000 };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await browser.close();
  }
}

module.exports = { collect, canonical, inScope, signalsFor };
