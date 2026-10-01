// Local, cached-evidence experiment. Production worker and judgment contract remain unchanged.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{parseEnv}=require('node:util');
const {collect,canonical}=require('../src/core/collect.cjs');
const {createSession,configFromEnv,estimateRequestTokens,validateDecisions}=require('../src/core/llm.cjs');
const {outputResult}=require('../src/core/output.cjs');
const {simulate}=require('./navigation.cjs');
const {fitBatch}=require('./request-budget.cjs');
const {atomic,acquireLock}=require('./progressive.cjs');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ids=['dev-101','confirmation-201'],base='http://127.0.0.1:8893';
const local=(s,url)=>{const u=new URL(url);assert.equal(u.origin,new URL(s.entry).origin);return base+'/'+s.id+u.pathname+u.search+u.hash;};
function freeze(root,name,extra=[]){
 const files=['docs/navigation-live-plan.md',__filename,'agent/experiments/navigation.cjs','agent/experiments/request-budget.cjs',
  ...fs.readdirSync('agent/src/core').map(f=>'agent/src/core/'+f).filter(f=>fs.statSync(f).isFile()),'agent/src/worker.cjs',...extra];
 const manifest={at:new Date().toISOString(),files:Object.fromEntries(files.map(p=>[p,sha(p)]))};
 fs.writeFileSync(path.join(root,name),JSON.stringify(manifest,null,2),{flag:'wx'});return manifest;
}
function verify(m){for(const [p,h]of Object.entries(m.files))assert.equal(sha(p),h,'Frozen input changed: '+p);}
async function prepare(root){
 fs.mkdirSync(root);const sites=read('test-set-v4/private/catalog.json').filter(s=>ids.includes(s.id));
 const files=sites.flatMap(s=>Object.values(s.files).map(f=>'test-set-v4/public/'+f));
 const manifest=freeze(root,'prepare-manifest.json',[...files,'test-set-v4/private/catalog.json','test-set-v4/private/labels.json']);
 const routes=new Map();for(const s of sites)for(const [url,f]of Object.entries(s.files))routes.set(canonical(local(s,url)),fs.readFileSync('test-set-v4/public/'+f,'utf8').replaceAll(new URL(s.entry).origin,base+'/'+s.id));
 const server=http.createServer((req,res)=>{const body=req.method==='GET'?routes.get(canonical(new URL(req.url,base).href)):null;
  res.writeHead(body?200:404,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(body||'Not found');});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8893,'127.0.0.1',resolve);});
 try{
  for(const s of sites){
   const entry=local(s,s.entry),scope='/'+s.id+'/';
   const evidence=await collect(entry,{scope,maxPages:200,maxNodes:10000,recordNavigation:true,allowLongText:true,
    onProgress:p=>{if(p.pages%20===0)console.log(JSON.stringify({phase:'collect',site:s.id,...p}));}});
   assert.equal(evidence.pages.length,Object.keys(s.files).length);
   const old=read('.runtime/navigation-trial-v1/'+s.id+'-snapshot.json'),pages={};
   for(const [url,p]of Object.entries(old.pages))pages[canonical(local(s,url))]={...p,links:p.links.map(l=>({...l,url:local(s,l.url)}))};
   for(const p of evidence.pages)assert.deepEqual(p.navigation.links.map(l=>canonical(l.url)),pages[canonical(p.url)].links.map(l=>canonical(l.url)),'Collector/profile links differ');
   const gold=read('test-set-v4/private/labels.json')[s.id].cases;
   let located=0;for(const c of gold){const matches=evidence.candidates.filter(n=>canonical(n.url)===canonical(local(s,c.page))&&n.selector===c.selector);if(matches.length){assert.equal(matches.length,1);assert.equal(matches[0].raw_text,c.text);located++;}}
   atomic(root,s.id+'-evidence.json',{id:s.id,split:s.split,entry,scope,evidence,pages});
   console.log(JSON.stringify({phase:'prepared',site:s.id,pages:evidence.pages.length,candidates:evidence.candidates.length,gold_collected:located,gold_total:gold.length,collection_sec:evidence.collection_elapsed_sec}));
  }verify(manifest);
 }finally{await new Promise(resolve=>server.close(resolve));}
}
async function judge(root,id,mode,scheduler){
 const data=read(path.join(root,id+'-evidence.json')),dir=path.join(root,id+'-'+mode);fs.mkdirSync(dir);
 const config={...configFromEnv('hcx',{...process.env,...parseEnv(fs.readFileSync(path.join(__dirname,'../.env'),'utf8'))}),
  temperature:0,reasoningEffort:'none',seed:42,maxTokens:3072,timeoutMs:180000,maxCalls:40,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:true,retryTransientTransport:true};
 const budgetPath=path.join(root,'budget.json'),budget=fs.existsSync(budgetPath)?read(budgetPath):{requests:[]};
 const ctl=new AbortController(),start=performance.now(),startedAt=new Date().toISOString(),decisions=[],indices=new Map();let session,timer,snapshot,order,status='failed',error=null;
 try{
  timer=setTimeout(()=>ctl.abort(Error('Run time budget exceeded')),900000);
  const schedulerStart=performance.now();order=await scheduler({entry:data.entry,scope:data.scope,mode:mode==='fifo'?'fifo':'bandit',maxRequests:50,
   read:async(url,kind)=>{assert.equal(kind,'page');assert(data.pages[url]);return structuredClone(data.pages[url]);}});
  assert.equal(order.visits.length,50);assert.equal(new Set(order.visits.map(v=>v.url)).size,50);
  const candidates=order.visits.flatMap(v=>data.evidence.candidates.filter(c=>canonical(c.url)===v.url));
  snapshot={entry_url:data.entry,pages:order.visits.map(v=>data.evidence.pages.find(p=>canonical(p.url)===v.url)),candidates};
  atomic(dir,'evidence.json',snapshot);atomic(dir,'order.json',order);
  session=createSession(config,{signal:ctl.signal,log:e=>{
   if(e.event==='llm_request'){
    const reserved=estimateRequestTokens(e.body),used=budget.requests.reduce((n,r)=>n+(r.tokens??r.reserved),0);
    if(budget.requests.length>=220||used+reserved>1800000)throw Error('Shared budget reached');
    indices.set(e.call_number,budget.requests.length);budget.requests.push({run:id+'-'+mode,call:e.call_number,reserved,tokens:null});atomic(root,'budget.json',budget);
   }
   if(e.event==='llm_response'){
    const r=budget.requests[indices.get(e.call_number)];assert(r,'Unreserved response');
    if(Number.isFinite(e.data?.usage?.total_tokens))r.tokens=e.data.usage.total_tokens;
    atomic(root,'budget.json',budget);
   }
   fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify(e)+'\n');
  }});
  const scheduler_ms=performance.now()-schedulerStart;
  while(decisions.length<candidates.length){
   ctl.signal.throwIfAborted();const batch=await fitBatch(candidates.slice(decisions.length,decisions.length+16),config);
   atomic(dir,'inflight.json',{ids:batch.map(c=>c.node_id),at:new Date().toISOString()});
   const ds=await session.decide(batch);validateDecisions({decisions:ds},batch);
   const byId=new Map(ds.map(d=>[d.node_id,d]));decisions.push(...batch.map(c=>byId.get(c.node_id)));atomic(dir,'decisions.json',decisions);fs.unlinkSync(path.join(dir,'inflight.json'));
   console.log(JSON.stringify({phase:'judging',site:id,mode,processed:decisions.length,total:candidates.length,calls:session.calls.length,elapsed:Math.round((performance.now()-start)/1000)}));
  }
  const output=outputResult(snapshot,decisions,startedAt,(performance.now()-start)/1000,'hcx');atomic(dir,'result.json',output.result);atomic(dir,'diagnostics.json',output.diagnostics);
  atomic(dir,'timing.json',{scheduler_ms,collection_sec:data.evidence.collection_elapsed_sec});status='completed';
 }catch(e){error=String(e.message).replaceAll(config.apiKey,'[REDACTED]');throw Error(error);}
 finally{clearTimeout(timer);atomic(dir,'run.json',{id,mode,status,error,pages:order?.visits.length,candidates:snapshot?.candidates.length,judged:decisions.length,
  calls:session?.calls||[],elapsed_sec:(performance.now()-start)/1000,model:config.model,temperature:0,seed:42,reasoning:'none',maxTokens:3072});}
}
async function main(){
 const [phase,root='.runtime/navigation-live-v1']=process.argv.slice(2);assert(['prepare','a','b'].includes(phase));
 if(phase==='prepare')return prepare(root);
 const extra=ids.map(id=>path.join(root,id+'-evidence.json'));if(phase==='b')extra.push('agent/experiments/navigation-path.cjs');
 const manifest=freeze(root,'phase-'+phase+'-manifest.json',extra),lock=acquireLock(root,'live.lock');
 try{
  const tasks=phase==='a'?[[ids[0],'fifo'],[ids[0],'bandit'],[ids[1],'bandit'],[ids[1],'fifo']]:[[ids[0],'bandit-path'],[ids[1],'bandit-path']];
  for(const [id,mode]of tasks){verify(manifest);console.log('BEGIN '+id+' '+mode);await judge(root,id,mode,phase==='a'?simulate:require('./navigation-path.cjs').simulatePath);verify(manifest);}
 }finally{fs.unlinkSync(lock);}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={local,judge};
