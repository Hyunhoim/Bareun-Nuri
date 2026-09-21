// Reuse the browser-backed scorer. Annotations are only loaded in this evaluator.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.BENCHMARK_ROOT=__dirname;
const E=require('../local-benchmark/evaluate.cjs');
const split='advanced',truth=E.truth,rows=truth.splits[split].cases;
const out=path.join(__dirname,'artifacts');
const count=(items,key)=>items.reduce((r,x)=>(r[x[key]]=(r[x[key]]||0)+1,r),{});
function save(name,value){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));}
function annotateMetrics(report){
  report.per_surface={};report.per_template={};
  for(const [field,dest] of [['surface',report.per_surface],['template',report.per_template]])for(const value of new Set(rows.map(r=>r[field]))){
    const group=rows.filter(r=>r[field]===value),ids=new Set(group.map(r=>r.case_id));
    const tp=report.details.filter(d=>d.status==='tp'&&ids.has(d.case_id)).length;
    const fn=report.missing.filter(d=>ids.has(d.case_id)).length;
    const fp=report.details.filter(d=>d.status==='fp'&&ids.has(d.case_id)).length;
    dest[value]={tp,fn,fp_on_labeled_elements:fp,recall:tp+fn?tp/(tp+fn):null,known_negative_elements:group.filter(r=>!r.is_ad).length};
  }
  report.note='Diagnostic synthetic development set. Not an unseen holdout. Surface/template FP counts exclude predictions unmatched to a labeled element; global FP includes them.';
  return report;
}
async function verify(base,browser){
  assert.equal(E.fingerprint(),truth.dataset_sha256);
  assert.equal(rows.length,300);assert.equal(rows.filter(r=>r.is_ad).length,120);assert.equal(rows.filter(r=>!r.is_ad).length,180);
  assert.deepEqual(count(rows,'surface'),{title:40,body:80,comment:60,reply:40,author:20,signature:20,link:20,attachment:20});
  assert.equal(truth.top_pages.length,101);assert.equal(new Set(truth.top_pages).size,101);
  assert.equal(new Set(rows.map(r=>r.element_id)).size,300);
  const context=await E.contextFor(browser,base),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const queue=[base+'/advanced/'],visited=new Set();let verified=0;
  try{
    while(queue.length){
      const url=queue.shift(),key=E.canonical(url);if(visited.has(key))continue;
      visited.add(key);assert(visited.size<=101,'Navigation trap');await E.ready(page,url);
      const content=await page.content();assert(!/case_id|is_violation|ground_truth|HOMOGLYPH|TRANSPARENT|OFFSCREEN|pair_id|hard_negative/.test(content),'Label leaked into public HTML');
      const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href));
      for(const link of links){const u=new URL(link);if(u.origin===base&&u.pathname.startsWith('/advanced/')&&!visited.has(E.canonical(link)))queue.push(link);}
      for(const item of rows.filter(r=>E.canonical(r.page,base)===key)){
        const {handle}=await E.resolve(page,E.locationFor(item,base));
        const facts=await handle.evaluate(node=>{
          const chain=[];for(let e=node;e;e=e.parentElement){const s=getComputedStyle(e);chain.push({opacity:Number(s.opacity),display:s.display,color:s.color,bg:s.backgroundColor});}
          const style=getComputedStyle(node),rect=node.getBoundingClientRect();return {text:node.textContent,chain,font:parseFloat(style.fontSize),right:rect.right,bottom:rect.bottom};
        });await handle.dispose();assert.equal(facts.text,item.text,item.case_id+' text mismatch');
        if(item.observed.includes('JAMO'))assert(/[\u1100-\u11ff\u3130-\u318f]/u.test(facts.text),item.case_id);
        if(item.observed.includes('HOMOGLYPH'))assert(/[\uff01-\uff5e\u0370-\u03ff\u0400-\u04ff]/u.test(facts.text)||facts.text.includes('B0NUS'),item.case_id);
        if(item.observed.includes('TRANSPARENT')){
          const background=facts.chain.find(s=>s.bg!=='rgba(0, 0, 0, 0)');
          assert(facts.chain.some(s=>s.opacity===0)||facts.chain[0].color==='rgba(0, 0, 0, 0)'||background?.bg===facts.chain[0].color,item.case_id+' transparency missing');
        }
        if(item.observed.includes('OFFSCREEN'))assert(facts.chain.some(s=>s.display==='none')||facts.font<=1||facts.right<0||facts.bottom<0,item.case_id+' offscreen missing');
        verified++;
      }
      if(visited.size%20===0)console.log('Verified pages: '+visited.size+'/101');
    }
    assert.equal(visited.size,101);assert.equal(verified,300);assert.deepEqual(errors,[]);
    for(const url of truth.top_pages)assert(visited.has(E.canonical(url,base)),'Unreachable '+url);
    for(const endpoint of ['/private/ground_truth.json','/private/routes.json','/build.py','/public/','/../private/ground_truth.json','/advanced/private/ground_truth.json'])assert.equal((await context.request.get(base+endpoint)).status(),404,endpoint);
    fs.mkdirSync(out,{recursive:true});await E.ready(page,base+'/advanced/');await page.screenshot({path:path.join(out,'home.png'),fullPage:true});
    await E.ready(page,base+'/advanced/board/list?board=free&page=1');await page.screenshot({path:path.join(out,'list.png'),fullPage:true});
    for(const template of ['board','notice','petition','community','service']){
      const target=truth.splits[split].pages.find(p=>p.template===template&&rows.filter(r=>r.page===p.path).length>=3);
      await E.ready(page,new URL(target.path,base).href);await page.screenshot({path:path.join(out,template+'.png'),fullPage:true});
    }
    await page.setViewportSize({width:390,height:844});await E.ready(page,base+'/advanced/');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
    for(const template of ['board','notice','petition','community','service']){
      const target=truth.splits[split].pages.find(p=>p.template===template&&rows.filter(r=>r.page===p.path).length>=3);
      await E.ready(page,new URL(target.path,base).href);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow: '+template);
    }
  }finally{await context.close();}
  const oracle=E.oracle(split,base),perfect=await E.grade(oracle,split,base,browser);
  assert.equal(perfect.tp,160);assert.equal(perfect.fn,0);assert.equal(perfect.fp,0);assert.equal(perfect.evidence_mismatches,0);
  const empty=await E.grade({...oracle,findings:[]},split,base,browser);assert.equal(empty.fn,160);assert.equal(empty.precision,null);
  const sample=structuredClone(oracle);sample.findings=sample.findings.slice(0,8);
  sample.findings[0].location=sample.findings[0].location.replace(/#([\w-]+)/,'[id="$1"]');
  sample.findings.push({...sample.findings[0],id:'duplicate'});
  const negative=rows.find(r=>!r.is_ad);sample.findings.push({id:'false-positive',url:new URL(negative.page,base).href,location:E.locationFor(negative,base),evidence_text:negative.text,is_violation:true,technique:'JAMO'});
  sample.findings.push({...sample.findings[1],id:'wrong-url',url:base+'/advanced/missing'});
  sample.findings.push({...sample.findings[1],id:'bad-technique',technique:'UNKNOWN'});
  const perturbed=await E.grade(sample,split,base,browser);
  assert.equal(perturbed.tp,8);assert.equal(perturbed.fp,2);assert.equal(perturbed.duplicates,1);assert.equal(perturbed.invalid,1);
  fs.writeFileSync(path.join(__dirname,'private/oracle-advanced.json'),JSON.stringify(oracle,null,2));
  const report={verifiedAt:new Date().toISOString(),dataset_sha256:truth.dataset_sha256,topPages:visited.size,subpages:100,frameDocuments:truth.frame_documents.length,verifiedCases:verified,counts:truth.splits[split].counts,surfaces:count(rows,'surface'),transports:count(rows,'transport'),scorerChecks:['perfect-160','empty','equivalent-selector','duplicate','normal-false-positive','wrong-url','invalid-technique'],browser:browser.version(),note:'Fixture/scorer checks only; no LLM calls or accuracy measurement.'};
  save('verification.json',report);return report;
}
async function coverage(base,browser){
  // The Agent collects only the URL. Gold annotations are joined afterwards, offline.
  const {collect}=require('../agent/src/core/collect.cjs');
  const snapshot=await collect(base+'/advanced/',{maxPages:150,maxNodes:10000,channel:process.env.BROWSER_CHANNEL||'msedge',onProgress:p=>{if(p.pages%20===0)console.log('Collected '+p.pages+' pages / '+p.candidates+' candidates');}});
  save('collection.json',snapshot);
  const misses=rows.filter(r=>!snapshot.candidates.some(c=>E.canonical(c.url)===E.canonical(r.page,base)&&c.selector===r.selector&&JSON.stringify(c.frame_urls)===JSON.stringify(r.frames.map(u=>new URL(u,base).href))));
  const result={dataset_sha256:truth.dataset_sha256,pages:snapshot.pages.length,candidates:snapshot.candidates.length,elapsedSec:snapshot.collection_elapsed_sec,exactGoldElementsCollected:300-misses.length,totalGoldElements:300,missedBySurface:count(misses,'surface'),missedByTransport:count(misses,'transport'),missing:misses.map(r=>({case_id:r.case_id,page:r.page,surface:r.surface,transport:r.transport,selector:r.selector})),note:'Exact labeled-element collection coverage, not LLM recall. Parent/child extraction differences count as missing here and require inspection.'};
  save('collection-coverage.json',result);return result;
}
async function main(){
  const args=process.argv.slice(2),action=args.shift();const i=args.indexOf('--base');const base=new URL(i<0?'http://127.0.0.1:8780':args.splice(i,2)[1]).origin;
  const url=new URL(base);assert(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname),'Local HTTP fixture only');
  assert(['verify','score','coverage'].includes(action),'Use verify, score result.json [--report file], or coverage');assert.equal(E.fingerprint(),truth.dataset_sha256,'Rebuild after dataset edits');
  const browser=await E.launch();try{
    let report;
    if(action==='verify')report=await verify(base,browser);
    else if(action==='coverage')report=await coverage(base,browser);
    else{
      const reportIndex=args.indexOf('--report'),destination=reportIndex<0?null:args.splice(reportIndex,2)[1];assert.equal(args.length,1,'Provide one result.json');
      const bytes=fs.readFileSync(path.resolve(args[0]));assert(!bytes.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])),'UTF-8 BOM not allowed');
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));report=annotateMetrics(await E.grade(data,split,base,browser));
      if(destination)fs.writeFileSync(path.resolve(destination),JSON.stringify(report,null,2));
    }
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
