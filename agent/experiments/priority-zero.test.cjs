const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {run,materialize}=require('../src/core/bounded-scan.cjs'),{createSession}=require('../src/core/llm.cjs');
const root=path.resolve(__dirname,'../../.runtime/priority-zero-'+Date.now());fs.mkdirSync(root,{recursive:true});
const candidate=i=>({node_id:'n'+i,url:'http://127.0.0.1:1/'+i,location:'p',raw_text:'시민 안내',normalized_text:'시민 안내',page_title:'안내',own_style:{},ancestors:[],signals:[],nearby:{},links:[],frame_urls:[]});
async function coreChecks(){
 const entry='http://127.0.0.1:1/0',identity={provider:'mock',test:'priority-zero'};
 const snapshot=(url,count=17)=>({pages:[{url,readiness:{settled:true},navigation:{links:[],profile:{body:'',links:[]}}}],candidates:Array.from({length:count},(_,i)=>({...candidate(i),url}))});
 let calls=0;
 const base={dir:path.join(root,'deadline'),entry,scope:'/',limits:{pages:2,nodes:0,calls:10,seconds:.1},graceSeconds:.5,identity,
  readPage:async u=>snapshot(u),createJudge:()=>({calls:[],decide:async nodes=>{calls++;await new Promise(r=>setTimeout(r,150));return nodes.map(n=>({node_id:n.node_id,is_violation:false,techniques:[],reason:'정상',needs_review:false}));}})};
 const first=await run(base),saved=materialize(base.dir,first).decisions;assert.equal(first.status,'partial');assert.equal(first.reason,'time_budget');assert.equal(saved.length,4);assert.equal(first.inflight,null);
 const second=await run({...base,limits:{...base.limits,seconds:2}}),restored=materialize(base.dir,second).decisions;assert.equal(restored.length,17);assert.deepEqual(restored.slice(0,4),saved);assert.equal(calls,5);assert.equal(second.status,'completed');
 const many=await run({...base,dir:path.join(root,'uncapped'),limits:{pages:1,nodes:0,calls:1,seconds:30},readPage:async u=>snapshot(u,10016),
  createJudge:o=>createSession({provider:'mock',maxCalls:1000},{signal:o.signal,deadlineAt:o.deadlineAt,onRequestState:o.onRequestState})});
 const uncapped=materialize(path.join(root,'uncapped'),many);assert.equal(uncapped.candidates.length,10016);assert.equal(many.reason,'call_budget');assert.equal(uncapped.decisions.length,4);
 const delayed=await run({...base,dir:path.join(root,'queued'),limits:{pages:1,nodes:0,calls:10,seconds:.08},
  createJudge:o=>{const s=createSession({provider:'mock',maxCalls:10,minIntervalMs:2000},{signal:o.signal,deadlineAt:o.deadlineAt,onRequestState:o.onRequestState});return s;},readPage:async u=>snapshot(u,33)});
 assert.equal(delayed.reason,'time_budget');assert.equal(delayed.inflight,null);assert.equal(materialize(path.join(root,'queued'),delayed).decisions.length,4);
 const oldFetch=global.fetch;let sent=0;global.fetch=async()=>{sent++;throw Error('fetch failed');};
 try{await assert.rejects(()=>createSession({provider:'hcx',reasoningEffort:'none',maxTokens:3072,maxCalls:2,apiKey:'test',endpoint:'http://127.0.0.1:0',timeoutMs:100,retryTransientTransport:true}).decide([candidate(0)]),/fetch failed/);assert.equal(sent,1);}finally{global.fetch=oldFetch;}
 return ['soft deadline finishes dispatched batch','resume preserves completed decisions','10016 candidates without count cap','queued cancellation has no uncertain request','transport failure never auto-retried'];
}
async function wallCheck(seconds){
 const hook=path.join(root,'reader-hook.cjs'),worker=path.resolve(__dirname,'../src/worker.cjs');
 fs.writeFileSync(hook,`const collect=require(${JSON.stringify(require.resolve('../src/core/collect.cjs'))});
collect.createCollector=async()=>({isConnected:()=>true,close:async()=>{},collect:async(url)=>{await new Promise(r=>setTimeout(r,${seconds>=1500?8000:350}));const n=Number(new URL(url).pathname.slice(1));const next=new URL('/'+(n+1),url).href;return {pages:[{url,readiness:{settled:true},navigation:{links:[{url:next}],profile:{body:'normal',links:[{url:next}]}}}],candidates:[{node_id:'n'+n,url,location:'p',raw_text:'시민 안내',normalized_text:'시민 안내',page_title:'안내',own_style:{},ancestors:[],signals:[],nearby:{},links:[],frame_urls:[]}],collection_issues:[]};}});`);
 const dir=path.join(root,'worker');const started=Date.now();
 const done=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--require',hook,worker],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error='';const timer=setTimeout(()=>{child.kill();reject(Error('Hard deadline exceeded'));},(seconds+290)*1000);
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);try{assert.equal(code,0,error);resolve(output.trim().split('\n').map(JSON.parse).find(e=>e.type==='done'));}catch(e){reject(e)}});
  child.stdin.write(JSON.stringify({url:'http://127.0.0.1:1/0',provider:'mock',jobDir:dir,envFile:path.join(root,'absent.env'),maxPages:200,maxNodes:0,maxCalls:300,timeoutSeconds:seconds})+'\n');});
 const elapsed=(Date.now()-started)/1000;assert.equal(done.status,'partial');assert.equal(done.reason,'time_budget');assert(elapsed>=seconds&&elapsed<seconds+290);
 const checkpoint=JSON.parse(fs.readFileSync(path.join(dir,'checkpoint.json'))).state;assert(checkpoint.pending.length);assert.equal(checkpoint.inflight,null);assert(fs.existsSync(path.join(dir,'segments/0001/result.json')));
 return {seconds,elapsed,done,pending:checkpoint.pending.length,actual_llm_calls:0,reader:'controlled delayed Mock; real worker timer and filesystem'};
}
(async()=>{const long=process.argv.includes('--25min');const result=long?await wallCheck(1500):{checks:await coreChecks(),wall:await wallCheck(2)};fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({root,...result}));})().catch(e=>{console.error(e);process.exitCode=1});
