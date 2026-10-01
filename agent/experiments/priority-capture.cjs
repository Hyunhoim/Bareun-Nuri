// Record rendered links from the fixed local site; no truth is parsed and no API key is loaded.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{spawn}=require('node:child_process'),{setTimeout:delay}=require('node:timers/promises');
const {chromium}=require('playwright'),{canonical,inScope}=require('../src/core/collect.cjs');
const {key}=require('./reuse-audit.cjs');
const crypto=require('node:crypto');
const collector=path.resolve(__dirname,'../src/core/collect.cjs');
const shared=vm.runInNewContext(fs.readFileSync(collector,'utf8')+'\n({readDocument,observeDocument,settlePage});',
  {require:createRequire(collector),module:{exports:{}},performance});
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function capture(snapshotFile,outDir){
  fs.mkdirSync(outDir); // Refuse to replace an earlier run.
  const save=(name,value)=>fs.writeFileSync(path.join(outDir,name),JSON.stringify(value,null,2),{flag:'wx'});
  const source=JSON.parse(fs.readFileSync(snapshotFile));
  const files=[snapshotFile,'docs/stage-5-priority-plan.md','agent/src/worker.cjs','agent/src/core/llm.cjs',
    'agent/src/core/output.cjs','agent/src/core/collect.cjs','agent/src/core/jamo.cjs','agent/src/core/techniques.cjs',
    'agent/src/core/confusables-latin.json','agent/experiments/reuse-audit.cjs','local-benchmark/serve.py',
    'test-set-v2/private/routes.json','test-set-v2/private/ground_truth.json',
    ...['priority.cjs','priority-capture.cjs','priority-score.cjs','priority.test.cjs'].map(f=>'agent/experiments/'+f),
    ...fs.readdirSync('test-set-v2/public',{recursive:true}).map(p=>path.join('test-set-v2/public',p)).filter(p=>fs.statSync(p).isFile())];
  const manifest=Object.fromEntries(files.map(p=>[p,hash(p)]));save('manifest.json',manifest);
  const python=path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  const log=fs.openSync(path.join(outDir,'server.log'),'wx');
  const server=spawn(python,['-X','utf8','local-benchmark/serve.py','--dataset-root','test-set-v2','--entry','/advanced/','--port','8786'],
    {windowsHide:true,stdio:['ignore',log,log]});
  let spawnError;server.on('error',e=>{spawnError=e;});
  let browser;
  const localOrigin='http://127.0.0.1:8786',originalOrigin=new URL(source.entry_url).origin;
  const rebase=value=>{const u=new URL(value);if(u.origin===localOrigin)return originalOrigin+u.pathname+u.search+u.hash;return value;};
  const started=performance.now();
  try{
    let ready=false;
    for(let i=0;i<50;i++){
      await delay(100);if(spawnError)throw spawnError;if(server.exitCode!==null)throw Error('Fixture server exited');
      try{const r=await fetch(localOrigin+'/advanced/',{signal:AbortSignal.timeout(500)});await r.arrayBuffer();if(r.ok){ready=true;break;}}catch{}
    }
    assert(ready,'Fixture server unavailable');
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ko-KR',serviceWorkers:'block',reducedMotion:'reduce'});
    await context.addInitScript(shared.observeDocument);
    const localEntry=new URL(localOrigin+'/advanced/');
    await context.route('**/*',route=>{
      const r=route.request(),u=new URL(r.url());
      return r.method()==='GET'&&u.origin===localOrigin&&(!r.isNavigationRequest()||inScope(u.href,localEntry,source.scope))?route.continue():route.abort();
    });
    const graph={entry_url:source.entry_url,scope:source.scope,pages:[]};
    for(const original of source.pages){
      const page=await context.newPage(),pending=new Set(),t=performance.now();
      page.on('request',r=>{if(['document','fetch','xhr'].includes(r.resourceType()))pending.add(r);});
      page.on('requestfinished',r=>pending.delete(r));page.on('requestfailed',r=>pending.delete(r));
      const target=new URL(original.url);target.host=new URL(localOrigin).host;
      const response=await page.goto(target.href,{waitUntil:'load',timeout:15000});assert(response?.ok());
      assert.equal(canonical(rebase(page.url())),canonical(original.url),'Unexpected redirect');
      const readiness=await shared.settlePage(page,pending);assert(readiness.settled,'Unstable page');
      const links=[],nodes=[];
      for(const frame of page.frames()){
        assert(inScope(frame.url(),localEntry,source.scope));
        const doc=await frame.evaluate(shared.readDocument);
        const frames=[];for(let f=frame;f.parentFrame();f=f.parentFrame())frames.unshift(rebase(f.url()));
        for(const n of doc.nodes)nodes.push({selector:n.selector,raw_text:n.raw_text,frame_urls:frames});
        const recorded=await frame.evaluate(()=>[...document.querySelectorAll('a[href]')].map(a=>({url:a.href,text:a.textContent,
          content_scope:Boolean(a.closest('article,[role="article"],[role="comment"],tbody'))})));
        assert.deepEqual(recorded.map(l=>l.url),doc.links);
        links.push(...recorded.map(l=>({...l,url:rebase(l.url)})));
      }
      const expected=source.candidates.filter(c=>canonical(c.url)===canonical(original.url)).map(c=>({selector:c.selector,raw_text:c.raw_text,frame_urls:c.frame_urls}));
      assert.deepEqual(nodes,expected,'Candidate content/ownership drift: '+original.url);
      graph.pages.push({url:original.url,title:await page.title(),links,candidates:nodes.length,evidence_sha256:key(nodes),
        capture_elapsed_ms:performance.now()-t});
      await page.close();
      if(graph.pages.length%20===0)console.log('Recorded '+graph.pages.length+'/'+source.pages.length+' pages');
    }
    for(const [p,digest] of Object.entries(manifest))assert.equal(hash(p),digest,'Frozen input changed: '+p);
    save('graph.json',graph);save('capture.json',{status:'completed',pages:graph.pages.length,candidates:source.candidates.length,
      source_content_verified:true,graph_sha256:hash(path.join(outDir,'graph.json')),elapsed_sec:(performance.now()-started)/1000,llm_calls:0});
    console.log('Captured '+graph.pages.length+' pages; original candidate content verified');
  }finally{await browser?.close();server.kill();fs.closeSync(log);}
}
if(require.main===module){const [snapshot,outDir]=process.argv.slice(2);if(!snapshot||!outDir)throw Error('Usage: node priority-capture.cjs SNAPSHOT NEW_OUTPUT_DIR');
  capture(snapshot,outDir).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={capture};
