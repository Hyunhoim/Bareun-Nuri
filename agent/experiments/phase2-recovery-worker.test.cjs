// Operational storage/resume checks. API0, Browser0; --backend adds local HTTP only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),http=require('node:http');
const project=path.resolve(__dirname,'../..'),source=process.argv.includes('--production')?'agent/src':'.runtime/phase2-recovery-stage',worker=path.join(project,source,'worker.cjs');
assert(fs.existsSync(path.join(project,'agent/src/core/bounded-scan.cjs')),'Bounded scanner implementation missing');
const {digest}=require(path.join(project,'agent/src/core/scan.cjs'));
const root=path.join(project,'.runtime','bounded-worker-check-'+Date.now()),entry='http://fixture.local/';
fs.mkdirSync(root,{recursive:true});
const hook=path.join(root,'collector-hook.cjs');
fs.writeFileSync(path.join(root,'fixture.env'),'CLOVASTUDIO_API_KEY=TEST_ONLY\nCLOVASTUDIO_MODEL=HCX-007\nCLOVASTUDIO_REASONING_EFFORT=none\nCLOVASTUDIO_TEMPERATURE=0\nCLOVASTUDIO_MAX_TOKENS=3072\n');
fs.writeFileSync(hook,`let active=0,peak=0;global.fetch=async(url,options)=>{
if(process.env.BOUNDED_TEST_CAP!=='1')throw Error('Paid/network request forbidden');
const assert=require('node:assert/strict'),body=JSON.parse(options.body),cs=JSON.parse(body.messages[1].content).candidates;
assert.equal(body.maxCompletionTokens,512);assert.equal(body.thinking.effort,'none');assert.equal(body.seed,42);assert(cs.length>0&&cs.length<=12);
require('node:fs').appendFileSync(${JSON.stringify(path.join(root,'cap-requests.jsonl'))},JSON.stringify(body)+'\\n');
if(process.env.BOUNDED_TEST_PARALLEL==='1'){active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2400));active--;require('node:fs').writeFileSync(${JSON.stringify(path.join(root,'parallel-peak.json'))},JSON.stringify({peak}));}
return {ok:true,status:200,headers:new Map(),json:async()=>({status:{code:'20000'},result:{finishReason:'stop',message:{content:JSON.stringify({decisions:Object.fromEntries(cs.map(c=>[c.node_id,{publication_act:'일반정보'}]))})+${JSON.stringify(process.argv.includes('--envelope')?'\n\n제공된 원문에 대한 판정입니다.':'')}},usage:{promptTokens:100,completionTokens:100,totalTokens:200}}})};};
const llm=require(${JSON.stringify(path.join(project,'agent/src/core/llm.cjs'))}),originalSession=llm.createSession;
llm.createSession=(config,options)=>{if(config.apiKey==='TEST_ONLY')require('node:assert/strict').equal(config.tokensPerMinute,58000);return originalSession(config,options);};
const collect=require(${JSON.stringify(path.join(project,source,'core/collect.cjs'))});
collect.createCollector=async()=>({isConnected:()=>true,close:async()=>{},collect:async url=>{await new Promise(r=>setTimeout(r,Number(process.env.BOUNDED_TEST_DELAY||0)));const snapshot={
pages:[{url,readiness:{settled:process.env.BOUNDED_TEST_UNSETTLED!=='1'},navigation:{links:[]}}],collection_issues:[],
candidates:Array.from({length:process.env.BOUNDED_TEST_PARALLEL==='1'?36:process.env.BOUNDED_TEST_CAP==='1'?13:5},(_,i)=>({node_id:'n'+i,url,location:'p#n'+i,selector:'p#n'+i,raw_text:'시민 일반 안내 '+i,normalized_text:'시민 일반 안내 '+i,page_title:'검사',own_style:{},ancestors:[],signals:[],nearby:{},links:[],frame_urls:[]}))};
snapshot.technique_observations=snapshot.candidates.map(c=>require(${JSON.stringify(path.join(project,'agent/src/core/techniques.cjs'))}).observeTechniques(c,null));return snapshot;}});`);
const read=p=>JSON.parse(fs.readFileSync(p));
function hashes(dir){const result={};function visit(p){for(const item of fs.readdirSync(p,{withFileTypes:true})){const file=path.join(p,item.name);if(item.isDirectory())visit(file);else result[path.relative(dir,file)]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}visit(dir);return result;}
function request(dir){return{url:entry,provider:'mock',jobDir:dir,envFile:path.join(root,'absent.env'),maxPages:1,maxNodes:0,maxCalls:1,timeoutSeconds:60};}
async function execute(dir,extraEnv={}){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['--require',hook,worker],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,...extraEnv}});let output='',error='';
 const timer=setTimeout(()=>{child.kill();reject(Error('Worker timed out'));},15000);child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.on('error',e=>{clearTimeout(timer);reject(e);});
 child.on('exit',code=>{clearTimeout(timer);try{assert.equal(error,'');const events=output.trim().split('\n').map(JSON.parse),done=events.find(e=>e.type==='done');assert(done,output);resolve({code,events,done});}catch(e){reject(e);}});child.stdin.write(JSON.stringify({...request(dir),maxCalls:Number(extraEnv.BOUNDED_TEST_CALLS||1),...(extraEnv.BOUNDED_TEST_CAP==='1'?{provider:'hcx',envFile:path.join(root,'fixture.env')}:{})})+'\n');
 });}
function editCheckpoint(dir,change){const file=path.join(dir,'checkpoint.json'),cp=read(file);change(cp.state);cp.sha256=digest(cp.state);fs.writeFileSync(file,JSON.stringify(cp));}
function decisions(dir){const s=read(path.join(dir,'checkpoint.json')).state;return s.pages.flatMap(p=>p.batches.flatMap(ref=>read(path.join(dir,ref.file)).decisions));}
async function directChecks(){
 for(const limit of ['0','601']){const dir=path.join(root,'invalid-calls-'+limit),r=await execute(dir,{BOUNDED_TEST_CALLS:limit});assert.equal(r.code,1);assert.match(r.done.error,/Invalid maxCalls/);assert(!fs.existsSync(dir),'Rejected call limit must not write artifacts');}
 const wide=await execute(path.join(root,'calls600'),{BOUNDED_TEST_CALLS:'600'});assert.equal(wide.code,0);assert.equal(wide.done.status,'completed');assert.equal(wide.done.processed,5);assert.equal(wide.done.calls,2);
 const firstDir=path.join(root,'first'),first=await execute(firstDir);assert.equal(first.code,0);assert.equal(first.done.status,'partial');assert.equal(first.done.reason,'call_budget');assert.equal(first.done.pages,1);assert.equal(first.done.candidates,5);assert.equal(first.done.processed,4);assert.equal(first.done.unstablePages,0);
 const initial=read(path.join(firstDir,'checkpoint.json')).state;assert.equal(initial.pending.length,0);assert.equal(initial.pages[0].offset,4);assert.equal(initial.pages[0].work,5);assert.equal(read(path.join(firstDir,'coverage.json')).unjudged.length,1);
 for(const kind of ['old-signature','sent','responded','bad-checksum']){
  const dir=path.join(root,kind);fs.cpSync(firstDir,dir,{recursive:true});
  if(kind==='old-signature')editCheckpoint(dir,s=>{s.signature='previous-implementation';});
  else if(kind==='bad-checksum'){const file=path.join(dir,'checkpoint.json'),cp=read(file);cp.sha256='invalid';fs.writeFileSync(file,JSON.stringify(cp));}
  else editCheckpoint(dir,s=>{s.inflight={phase:kind,ids:['n4']};});
  const before=hashes(dir),failed=await execute(dir);assert.equal(failed.code,1);assert.equal(failed.done.status,'failed');assert.match(failed.done.error,kind==='old-signature'?/Cannot resume changed/:kind==='bad-checksum'?/checksum/:/automatic retry refused/);assert.deepEqual(hashes(dir),before,kind+' changed existing artifacts');
 }
 const resumedDir=path.join(root,'resumed');fs.cpSync(firstDir,resumedDir,{recursive:true});const old=decisions(resumedDir),segment=hashes(path.join(resumedDir,'segments/0001'));
 const resumed=await execute(resumedDir);assert.equal(resumed.code,0);assert.equal(resumed.done.status,'completed');assert.equal(resumed.done.candidates,5);assert.equal(resumed.done.processed,5);assert.equal(resumed.done.calls,2);assert.equal(resumed.done.segmentNumber,2);assert.deepEqual(hashes(path.join(resumedDir,'segments/0001')),segment);
 const ds=decisions(resumedDir);assert.equal(new Set(ds.map(d=>d.node_id)).size,5);for(const d of old)assert.deepEqual(ds.find(x=>x.node_id===d.node_id),d);
 const unstable=await execute(path.join(root,'unstable'),{BOUNDED_TEST_UNSETTLED:'1'});assert.equal(unstable.done.unstablePages,1);assert.equal(unstable.done.processed,4);
 const capDir=path.join(root,'cap512'),capFirst=await execute(capDir,{BOUNDED_TEST_CAP:'1'});assert.equal(capFirst.code,0);assert.equal(capFirst.done.processed,12);
 const capResumed=await execute(capDir,{BOUNDED_TEST_CAP:'1'});assert.equal(capResumed.code,0);assert.equal(capResumed.done.status,'completed_with_warnings');assert.equal(capResumed.done.needsReview,13);assert.equal(capResumed.done.processed,13); // Fixture omits computed styles; preserve observation warnings.
 const captured=fs.readFileSync(path.join(root,'cap-requests.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(captured.length,2);assert.deepEqual(captured.map(b=>JSON.parse(b.messages[1].content).candidates.length),[12,1]);assert(captured.every(b=>b.maxCompletionTokens===512));
 const parallel=await execute(path.join(root,'parallel3'),{BOUNDED_TEST_CAP:'1',BOUNDED_TEST_PARALLEL:'1',BOUNDED_TEST_CALLS:'3'});assert.equal(parallel.code,0);assert.equal(parallel.done.processed,36);assert.equal(read(path.join(root,'parallel-peak.json')).peak,3);
 return firstDir;
}
async function backendChecks(firstDir){
 const appRoot=path.join(root,'app-root');fs.mkdirSync(appRoot);fs.mkdirSync(path.join(appRoot,'agent/src'),{recursive:true});fs.writeFileSync(path.join(appRoot,'agent/src/worker.cjs'),'require('+JSON.stringify(worker)+');');
 const jobs=path.join(appRoot,'.runtime/jobs');fs.mkdirSync(jobs,{recursive:true});const ids={};
 for(const kind of ['pending-zero','sent','responded','closed','wave-durable','wave-sent','wave-responded','recovery-prepared','recovery-durable','recovery-sent','recovery-responded','recovery-exhausted']){
  const id=crypto.randomUUID(),dir=path.join(jobs,id),artifacts=path.join(dir,'artifacts');ids[kind]=id;fs.mkdirSync(dir);fs.cpSync(firstDir,artifacts,{recursive:true});
  if(['sent','responded'].includes(kind))editCheckpoint(artifacts,s=>{s.inflight={phase:kind,ids:['n4']};});
  if(kind.startsWith('wave-'))editCheckpoint(artifacts,s=>{s.inflight={phase:'wave',requests:[{phase:kind.slice(5)}]};});
  if(kind.startsWith('recovery-'))editCheckpoint(artifacts,s=>{s.pages.forEach(p=>p.offset=p.work);s.recovery={queue:[{}],cursor:kind==='recovery-exhausted'?1:0,inflight:kind==='recovery-exhausted'?null:{phase:kind.slice(9)}};});
  const run=read(path.join(artifacts,'worker-run.json'));
  fs.writeFileSync(path.join(dir,'job.json'),JSON.stringify({...request(artifacts),id,status:'partial',phase:'finished',startedAt:run.startedAt,updatedAt:run.startedAt,closed:kind==='closed',pages:1,candidates:5,processed:4,calls:1}));
 }
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const java=path.join(project,'.tools/jdk',fs.readdirSync(path.join(project,'.tools/jdk')).find(n=>n.startsWith('jdk-')),'bin/java.exe'),jar=process.env.PUBLIC_AD_VERIFY_JAR||path.join(project,'backend/target/public-ad-backend.jar');assert(fs.existsSync(jar),'Build backend first');
 const backend=spawn(java,['-Dfile.encoding=UTF-8','-jar',jar,'--server.port='+port],{cwd:project,windowsHide:true,stdio:'ignore',env:{...process.env,APP_ROOT:appRoot,NODE_EXECUTABLE:process.execPath,BOUNDED_TEST_DELAY:'600',NODE_OPTIONS:'--require "'+hook.replaceAll('\\','/')+'"'}});
 const call=async(route,body)=>{const r=await fetch('http://127.0.0.1:'+port+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Local-Client':'public-ad-ui'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
 async function until(fn){const end=Date.now()+30000;while(Date.now()<end){assert.equal(backend.exitCode,null,'Backend exited');try{const result=await fn();if(result)return result;}catch(e){if(backend.exitCode!==null)throw e;}await new Promise(r=>setTimeout(r,100));}throw Error('Local backend timed out');}
 try{
  await until(async()=>((await call('/api/health')).status===200));
  for(const kind of ['sent','responded','closed']){const url='/api/jobs/'+ids[kind];assert.equal((await call(url)).data.canResume,false);assert.equal((await call(url+'/resume',{})).status,409);}
  const url='/api/jobs/'+ids['pending-zero'],before=(await call(url)).data;assert.equal(before.coverage.pending.length,0);assert.equal(before.coverage.unjudged.length,1);assert.equal(before.canResume,true);
  const artifactDir=path.join(jobs,ids['pending-zero'],'artifacts'),first=hashes(path.join(artifactDir,'segments/0001'));assert.equal((await call(url+'/resume',{})).status,200);
  const done=await until(async()=>{const x=(await call(url)).data;return x.calls===2&&x.status==='completed'?x:false;});assert.equal(done.processed,5);assert.equal(done.canResume,false);assert.deepEqual(hashes(path.join(artifactDir,'segments/0001')),first);assert.equal((await call(url+'/result')).status,200);
  assert.equal((await call('/api/jobs/'+ids['wave-durable'])).data.canResume,true);
  for(const kind of ['wave-sent','wave-responded']){assert.equal((await call('/api/jobs/'+ids[kind])).data.canResume,false);assert.equal((await call('/api/jobs/'+ids[kind]+'/resume',{})).status,409);}
  for(const kind of ['recovery-prepared','recovery-durable'])assert.equal((await call('/api/jobs/'+ids[kind])).data.canResume,true);
  for(const kind of ['recovery-sent','recovery-responded','recovery-exhausted']){assert.equal((await call('/api/jobs/'+ids[kind])).data.canResume,false);assert.equal((await call('/api/jobs/'+ids[kind]+'/resume',{})).status,409);}
  for(const maxCalls of [0,601])assert.equal((await call('/api/jobs',{url:entry,provider:'mock',maxPages:1,maxNodes:0,maxCalls,timeoutSeconds:60})).status,400);
  const wide=await call('/api/jobs',{url:entry,provider:'mock',maxPages:1,maxNodes:0,maxCalls:600,timeoutSeconds:60});assert.equal(wide.status,202);assert.equal(wide.data.maxCalls,600);fs.writeFileSync(path.join(jobs,wide.data.id,'artifacts/result.json'),'in-progress file must not be read');const active=await call('/api/jobs/'+wide.data.id);assert.equal(active.status,200);assert.equal(active.data.result,undefined);await until(async()=>{const j=(await call('/api/jobs/'+wide.data.id)).data;return j.status==='completed'&&j.processed===5;});
 }finally{if(backend.exitCode===null){const ended=new Promise(r=>backend.once('exit',r));backend.kill();await ended;}}
}
(async()=>{const first=await directChecks();if(process.argv.includes('--backend'))await backendChecks(first);const result={status:'passed',root,paid_api_calls:0,browser_launches:0,backend_checked:process.argv.includes('--backend'),checks:['active job GET does not read mutable result files','worker and API maxCalls600 acceptance, 0/601 rejection without writes','old signature/checksum/sent/responded reject with all artifact bytes and file list unchanged','pending0 workremaining direct resume','same candidates/work progress and readiness counts','prior decisions and first segment unchanged',...(process.argv.includes('--backend')?['real backend pending0 canResume/POST resume','sent/responded/closed resume409','completed resume disabled and result available']:[])]};fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));})().catch(e=>{console.error(e);process.exitCode=1;});
