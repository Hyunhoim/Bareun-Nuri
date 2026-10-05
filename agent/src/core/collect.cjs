const { chromium } = require('playwright');
const {frameAccess}=require('./frame-access.cjs');
const {inspectPage}=require('./frontier.cjs');
const crypto = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { normalizeText } = require('./jamo.cjs');
const { readTechniqueEvidence, observeTechniques } = require('./techniques.cjs');

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
  const root = document.body;
  if (!root) return { nodes: [], links: [], title: document.title };
  const ignored = 'script,style,template,noscript,iframe';
  const texts = new Map();
  function textFor(node) {
    if(!node)return '';
    if(node.nodeType===3)return node.textContent;
    if(node.nodeType!==1||node.matches(ignored))return '';
    if(!texts.has(node))texts.set(node,[...node.childNodes].map(textFor).join(''));
    return texts.get(node);
  }
  const containers = 'body,main,article,section,nav,header,footer,aside,ul,ol,dl,table,thead,tbody,tfoot,tr,form,fieldset';
  const textBlocks = 'p,h1,h2,h3,h4,h5,h6,li,dt,dd,td,th,blockquote,pre,figcaption,caption,address,button,label,summary';
  const styles = new Map(), phrasing = new Map();
  const styleFor = node => {if(!styles.has(node))styles.set(node,getComputedStyle(node));return styles.get(node);};
  function inlineTree(node) {
    if(phrasing.has(node))return phrasing.get(node);
    const result=!node.matches(containers+','+textBlocks+','+ignored)&&
      (styleFor(node).display.startsWith('inline')||node.tagName==='BR')&&[...node.children].every(inlineTree);
    phrasing.set(node,result);return result;
  }
  // Keep separate hidden/link evidence when a readable sentence also contains an inline payload.
  function distinctEvidence(child,parent) {
    function visual(node){
      const s=styleFor(node),r=node.getBoundingClientRect();let transparent=false,hidden=false,background='rgb(255, 255, 255)',found=false;
      for(let p=node;p;p=p.parentElement){const c=styleFor(p);transparent ||=Number(c.opacity)===0;hidden ||=c.display==='none';
        if(!found&&!/rgba\([^)]*,\s*0\)$/.test(c.backgroundColor)){background=c.backgroundColor;found=true;}}
      return JSON.stringify([transparent||/rgba\([^)]*,\s*0\)$/.test(s.color)||s.color===background,hidden,s.visibility,parseFloat(s.fontSize)<=1,r.right<0||r.bottom<0]);
    }
    return child.matches('a[href]')||visual(child)!==visual(parent);
  }
  const selected = new Set();
  function visit(node) {
    if(node.matches(ignored)||!textFor(node).trim())return;
    const children=[...node.children].filter(c=>!c.matches(ignored)&&textFor(c).trim());
    const own=[...node.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    const layout=styleFor(node).display;
    const merge=!node.matches(containers)&&!['flex','grid','inline-flex','inline-grid'].includes(layout)&&
      children.every(inlineTree)&&(own||children.length>1||node.matches(textBlocks));
    if(!children.length||merge){
      selected.add(node);
      if(merge)for(const child of node.querySelectorAll('*'))if(textFor(child).trim()&&!child.closest(ignored)&&distinctEvidence(child,child.parentElement))visit(child);
    }else{
      if(own)selected.add(node); // Mixed direct text has no separate CSS element; retain its real owner.
      for(const child of children)visit(child);
    }
  }
  visit(root);
  const elements=[...selected], owners=new Map();
  function ownerFor(node) {
    if(owners.has(node))return owners.get(node);
    if(node.matches('article,[role="article"],[role="comment"],[role="listitem"]')||
      (node.matches('li')&&[...node.parentElement.children].filter(e=>e.tagName==='LI').length>1)){
      owners.set(node,node);return node;
    }
    let owner=node;
    for(let p=node.parentElement;p;p=p.parentElement){
      owner=p;
      if(p.matches('article,section,[role="article"],[role="comment"],[role="listitem"],main,body,nav,header,footer,aside'))break;
      // Stop at the first branching text block; table/list wrappers may only wrap one field.
      if(!p.matches('ul,ol,dl,table,thead,tbody,tfoot,tr')&&!inlineTree(p)&&
        [...p.children].filter(e=>!e.matches(ignored)&&textFor(e).trim()).length>1)break;
      // Repeated block wrappers delimit independent entries without relying on site-specific class names.
      if(!selected.has(p)&&!inlineTree(p)&&[...p.parentElement?.children||[]].filter(s=>s.tagName===p.tagName&&s.className===p.className).length>1)break;
    }
    owners.set(node,owner);return owner;
  }
  const groups=new Map(),positions=new Map();
  for(const node of elements){const owner=ownerFor(node);if(!groups.has(owner))groups.set(owner,[]);
    const units=groups.get(owner);positions.set(node,units.length);units.push(node);}
  function contextFor(node) {
    const owner=ownerFor(node);
    const units=groups.get(owner),at=positions.get(node),start=Math.max(0,at-3),end=Math.min(units.length,at+4);
    let truncated=start>0||end<units.length;
    return {scope:{tag:owner.tagName.toLowerCase(),role:owner.getAttribute('role'),document_scope:owner.matches('body,main')},
      target_tag:node.tagName.toLowerCase(),target_quoted:Boolean(node.closest('blockquote,q')),
      units:units.slice(start,end).map(e=>{
        const text=textFor(e);truncated ||=e!==node&&text.length>600;
        return {relation:e===node?'target':e.contains(node)?'contains_target':e.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING?'before':'after',
          tag:e.tagName.toLowerCase(),quoted:Boolean(e.closest('blockquote,q')),dom_relation:{binding_status:e===node?'target_exact':'collector_same_owner',same_publication_unit:ownerFor(e)===owner,separate_comment:owner.matches('[role="comment"],[data-comment]')},...(e===node?{}:{text:text.slice(0,600)})};
      }),truncated};
  }
  const nodes = [...selected].map(node => {
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
    return { selector: location, raw_text: textFor(node), own_style: chain[0], ancestors: chain.slice(1),
      nearby: { before: textFor(node.previousElementSibling).slice(0, 400), after: textFor(node.nextElementSibling).slice(0, 400) },
      context: textFor(node.parentElement || node).slice(0, 6000),
      context_evidence: contextFor(node),
      links: [...node.querySelectorAll('a[href]')].map(a => ({ text: textFor(a), url: a.href })) };
  });
  return { nodes, title: document.title, links: [...document.querySelectorAll('a[href]')].map(a => a.href),
    iframes: [...document.querySelectorAll('iframe')].map(frame => ({ selector: selector(frame), src: frame.src })) };
}

function observeDocument() {
  const state={lastMutation:performance.now()};
  new MutationObserver(()=>{state.lastMutation=performance.now();}).observe(document,{subtree:true,childList:true,characterData:true,attributes:true});
  window.__publicAdReadiness=state;
}

async function settlePage(page,pending,signal,{minimumMs=1000,quietMs=300,maximumMs=5000}={}) {
  const started=performance.now();
  // ponytail: bounded passive observation; late timers, clicks and infinite scroll require a separate traversal policy.
  while(performance.now()-started<maximumMs){
    signal?.throwIfAborted();
    const frames=page.frames();
    const ready=await Promise.all(frames.map(frame=>frame.evaluate(quiet=>{
      const state=window.__publicAdReadiness;
      return Boolean(state)&&document.readyState==='complete'&&!document.querySelector('[aria-busy="true"]')&&performance.now()-state.lastMutation>=quiet;
    },quietMs).catch(()=>false)));
    if(performance.now()-started>=minimumMs&&!pending.size&&ready.every(Boolean))return {settled:true,wait_ms:Math.round(performance.now()-started)};
    await delay(100,undefined,{signal});
  }
  return {settled:false,wait_ms:Math.round(performance.now()-started),reason:'DOM or network did not settle within the observation budget'};
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

const launchBrowser = channel => chromium.launch({ headless: true, ...(channel === 'chromium' ? {} : { channel: channel || 'msedge' }) });

// One browser per scan; collect still creates an isolated context for every call.
async function createCollector({channel, onTiming} = {}) {
  const start = performance.now(), browser = await launchBrowser(channel);
  try { onTiming?.({kind:'browser_launch',total_ms:performance.now()-start,version:browser.version()}); }
  catch(error) { await browser.close(); throw error; }
  return {
    isConnected: () => browser.isConnected(),
    collect: (url, options = {}) => collect(url, {...options, browser, onTiming:options.onTiming || onTiming}),
    close: async () => { const start=performance.now(); await browser.close(); onTiming?.({kind:'browser_close',total_ms:performance.now()-start}); }
  };
}

async function collect(entryUrl, options = {}) {
  const entry = new URL(entryUrl);
  if (!['http:', 'https:'].includes(entry.protocol) || entry.username || entry.password) throw Error('Entry must be an HTTP(S) URL without credentials');
  const scope = options.scope || '/';
  const normalizedScope = scope === '//' ? '/' : scope;
  if (!normalizedScope.startsWith('/') || !normalizedScope.endsWith('/') || !inScope(entryUrl, entry, normalizedScope)) throw Error('Scope must contain entry URL and start/end with /');
  const maxPages = options.maxPages ?? 40, maxNodes = options.maxNodes ?? 1000;
  const signal = options.signal;
  signal?.throwIfAborted();
  const clockStart=performance.now(), phases={}, ownsBrowser=!options.browser;
  async function timed(name, action, cancellable=false) {
    const start=performance.now();let abort;
    try {
      if(cancellable)signal?.throwIfAborted();
      const operation=action();
      if(!cancellable||!signal)return await operation;
      // Closing a context during newPage can leave Playwright's promise pending.
      const cancelled=new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
      return await Promise.race([operation,cancelled]);
    } finally {if(abort)signal.removeEventListener('abort',abort);phases[name]=(phases[name]||0)+performance.now()-start;}
  }
  let browser=options.browser,context,contextClosing,success=false;
  const closeContext=()=>context ? (contextClosing ||= context.close()) : undefined;
  const onAbort = () => { (ownsBrowser ? browser?.close() : closeContext())?.catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  let started;
  const pages = [], candidates = [], observations = [], blocked = new Set(), visited = new Set();
  const queue = [entryUrl];
  try {
    if (!browser) browser=await timed('launch',()=>launchBrowser(options.channel));
    started=performance.now();
    signal?.throwIfAborted();
    const contextStart=performance.now();
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', serviceWorkers: 'block', reducedMotion: 'reduce' });
    signal?.throwIfAborted();
    await context.addInitScript(observeDocument);
    const canFrame=frameAccess(new URL(options.entryUrl||entryUrl)),issues=[];
    await context.route('**/*', async route => {
      const request=route.request(),url=new URL(request.url());let allowed=false;
      try {
        const frame=request.frame(),embedded=!!frame.parentFrame();
        if(request.method()==='GET') {
          if(request.isNavigationRequest()) {
            let depth=0;for(let f=frame;f.parentFrame();f=f.parentFrame())depth++;
            allowed=embedded?depth<=8&&frame.page().frames().length<=51&&await canFrame(url.href):inScope(url.href,entry,normalizedScope);
          } else {
            let owner=frame;while(owner.parentFrame()&&owner.url().startsWith('about:'))owner=owner.parentFrame();
            const origin=new URL(owner.url()).origin;
            allowed=(url.origin===origin||url.origin===entry.origin)&&await canFrame(url.href);
          }
        }
      }catch{}
      if(!allowed){blocked.add(url.href);issues.push({url:url.href,reason:'request_boundary_or_method'});}
      return allowed?route.continue():route.abort();
    });
    phases.context_setup=performance.now()-contextStart;
    // ponytail: serial crawl for reproducible shallow runs; add a bounded page pool if crawl latency dominates.
    while (queue.length) {
      signal?.throwIfAborted();
      const requested = queue.shift(), key = canonical(requested);
      if (visited.has(key)) continue;
      if (pages.length >= maxPages) throw Error(`Page limit ${maxPages} reached with unvisited URLs`);
      visited.add(key);
      const page = await timed('page_create',()=>context.newPage(),true);
      page.on('response',response=>{if(response.status()>=400)issues.push({url:response.url(),reason:'http_'+response.status(),source:requested});});
      const pending=new Set();
      page.on('request',request=>{if(['document','fetch','xhr'].includes(request.resourceType()))pending.add(request);});
      page.on('requestfinished',request=>pending.delete(request));
      page.on('requestfailed',request=>pending.delete(request));
      page.setDefaultTimeout(15000);
      const response = await timed('navigation',()=>page.goto(requested, { waitUntil: 'load', timeout: 15000 }),true);
      if (!response?.ok()) throw Error(`Page failed: ${requested} HTTP ${response?.status() ?? 'none'}`);
      const readiness=await timed('readiness',()=>settlePage(page,pending,signal,options.readiness),true);
      const extractStart=performance.now();
      const actual = page.url();
      if (!inScope(actual, entry, normalizedScope)) throw Error('Page redirected outside scope');
      visited.add(canonical(actual));
      const title = await page.title();
      pages.push({ url: actual, title, readiness });
      if (options.recordNavigation) pages.at(-1).navigation = { links: [], role_text: '', profile:await page.evaluate(inspectPage) };
      const issueStart=issues.length;
      for (const frame of page.frames()) {
        signal?.throwIfAborted();
        let depth=0;for(let f=frame;f.parentFrame();f=f.parentFrame())depth++;
        if(depth>8||page.frames().indexOf(frame)>50||(!frame.url().startsWith('about:')&&!await canFrame(frame.url()))){issues.push({url:frame.url(),reason:'frame_boundary'});continue;}
        let document;try{document=await frame.evaluate(readDocument);}catch(e){issues.push({url:frame.url(),reason:'frame_unreadable'});continue;}
        if(frame.parentFrame()&&!document.nodes.length&&!document.iframes?.length)issues.push({url:frame.url(),reason:'empty_or_unloaded_frame'});
        if (options.recordNavigation) {
          const navigation = await frame.evaluate(() => ({
            links: [...document.querySelectorAll('a[href]')].map(a => ({ url: a.href, text: a.textContent.trim(),
              content_scope: Boolean(a.closest('article,[role="article"],[role="comment"],tbody')) })),
            role_text: [...document.querySelectorAll('main h1,main h2,main p,main button,main a,main label')]
              .map(e => e.textContent.trim().slice(0,160)).join('\n').slice(0,3000)
          }));
          pages.at(-1).navigation.links.push(...navigation.links);
          pages.at(-1).navigation.role_text += navigation.role_text + '\n';
        }
        const observationEvidence = options.observeTechniques ? await frame.evaluate(readTechniqueEvidence, document.nodes.map(n => n.selector)) : null;
        const frames = [], frameSelectors = [];
        for (let current = frame; current.parentFrame(); current = current.parentFrame()) {
          const handle = await current.frameElement();
          const info = await handle.evaluate(node => {
            const siblings = [...node.ownerDocument.querySelectorAll('iframe')].filter(other => other.src === node.src);
            if (node.src && !node.hasAttribute('srcdoc') && siblings.length === 1) return { selector: `iframe[src="${node.src.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`, src: node.src };
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
        for (const [rawIndex, raw] of document.nodes.entries()) {
          if (raw.raw_text.length > (options.allowLongText ? 100000 : 12000)) throw Error('Paragraph exceeds '+(options.allowLongText ? 100000 : 12000)+' characters; explicit chunking is required');
          const location = [...frameSelectors, raw.selector].join(' >>> ');
          const identity = actual + '\n' + location;
          const node = { node_id: 'n_' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16),
            url: actual, location, frame_urls: frames, page_title: title, ...raw };
          node.normalized_text = normalizeText(node.raw_text);
          node.signals = signalsFor(node);
          candidates.push(node);
          if (observationEvidence) {
            const evidence = observationEvidence[rawIndex];
            observations.push({ ...observeTechniques(node, evidence), evidence });
          }
          if (candidates.length > maxNodes) throw Error(`Candidate limit ${maxNodes} exceeded`);
        }
        if (options.followLinks !== false) for (const link of document.links) if (inScope(link, entry, normalizedScope) && !visited.has(canonical(link))) queue.push(link);
      }
      pages.at(-1).issues=issues.slice(issueStart);
      phases.extraction=(phases.extraction||0)+performance.now()-extractStart;
      await timed('page_close',()=>page.close());
      options.onProgress?.({ pages: pages.length, candidates: candidates.length });
    }
    if (!pages.length || (!candidates.length&&!options.allowEmpty)) throw Error('No inspectable pages or text candidates; this is not a clean scan');
    const content = { entry_url: entryUrl, scope: normalizedScope, pages, candidates, blocked_requests: [...blocked].sort(), collection_issues:issues,
      ...(options.observeTechniques ? { technique_observations: observations } : {}) };
    success=true;
    return { ...content, snapshot_sha256: crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex'),
      collected_at: new Date().toISOString(), collection_elapsed_sec: (performance.now() - started) / 1000 };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try {
      if(ownsBrowser) { if(browser)await timed('browser_close',()=>browser.close()); }
      else if(context) await timed('context_close',closeContext);
    } finally {
      options.onTiming?.({kind:'page_collection',url:entryUrl,success,phases_ms:phases,total_ms:performance.now()-clockStart});
    }
  }
}

module.exports = { collect, createCollector, canonical, inScope, signalsFor };
