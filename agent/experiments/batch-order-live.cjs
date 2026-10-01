// Experiment-only derivative of call-budget-live.cjs; the core and store are isolated clones.
// Frozen 25-minute baseline / bounded-store experiment; never imported by worker.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {setTimeout:delay}=require('node:timers/promises');
const core=require('../src/core/scan.cjs'),experiment=require('./batch-order-core.cjs'),loaded=experiment.loadCore(),bounded=loaded.core;
const {contract}=require('../src/core/judgment.cjs');
const {createSession}=require('../src/core/llm.cjs');
const {fitBatch}=require('../src/core/request-budget.cjs');
const {createCollector}=require('../src/core/collect.cjs');
const {configuration,archive,verifyDataset,createTraceMonitor}=require('./replica-intent-run.cjs');
const {startServer}=require('./replica-intent-site.cjs');
const project=path.resolve(__dirname,'../..'),read=f=>JSON.parse(fs.readFileSync(f));
const sha=f=>require('node:crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const limits=Object.freeze({pages:200,calls:600,seconds:1500,nodes:0,memoryBytes:768*1024*1024});
function loadJudgment(modulePath){
 if(!modulePath)return {judgment:contract(),sourceFiles:[],module:null,comparison:'600-call cap with immutable checkpoint at 300 committed calls. Within-run prefix comparison, not independent AB. No input changes.'};
 const file=path.resolve(modulePath),relative=path.relative(path.join(project,'agent/experiments'),file);
 assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Judgment override must be an explicit experiment module');
 const candidate=require(file);assert.equal(typeof candidate.contract,'function');
 assert(Array.isArray(candidate.sourceFiles)&&candidate.sourceFiles.includes(file),'Candidate must declare its frozen source files');
 assert.equal(typeof candidate.comparison,'string');
 return {judgment:candidate.contract(),sourceFiles:candidate.sourceFiles,module:file,comparison:candidate.comparison};
}
async function main(argv=process.argv.slice(2)){
 const arg=(k,d)=>argv.includes(k)?argv[argv.indexOf(k)+1]:d;
 const mock=argv.includes('--mock');assert(mock!==argv.includes('--live'),'Choose explicit --live or --mock');
 const variant=arg('--variant','srpt8');assert(['srpt8','srpt8-3072'].includes(variant));
 const root=path.resolve(arg('--out','.runtime/goal-live-'+Date.now())),relative=path.relative(path.join(project,'.runtime'),root);
 assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&!fs.existsSync(root),'Fresh .runtime child required');
 const site=arg('--site','replica');assert(['replica','scheduling'].includes(site));
 const data=path.resolve(arg('--data',site==='replica'?'.runtime/replica-intent-data-v1':'.runtime/goal-scheduling-site-v1')),datasetHash=verifyDataset(data);
 const {config:base,env}=configuration(),config={...base,maxTokens:['baseline','srpt8-3072'].includes(variant)?3072:512,seed:42,maxCalls:600,timeoutMs:180000,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:false,retryTransientTransport:false};
 assert.equal(config.reasoningEffort,'none');assert.equal(config.temperature,0);
 const safe={...config};delete safe.apiKey;const selected=loadJudgment(arg('--judgment-module')),judgment=selected.judgment,ctl=new AbortController();
 fs.mkdirSync(root,{recursive:true});const job=path.join(root,'scan');fs.mkdirSync(job);
 const locations={},hashes=archive(root,data,'dev',{sourceLocations:locations});
 for(const file of [__filename,require.resolve('../src/core/bounded-scan.cjs'),require.resolve('../src/core/bounded-scan-store.cjs'),path.resolve(arg('--plan','docs/call-input-plan.md')),...selected.sourceFiles,...loaded.sourceFiles,...(site==='scheduling'?[path.join(data,'serve.cjs'),path.join(data,'gold.json')]:[])]){
  const rel=path.relative(project,file),dest=path.join(root,'source-archive',rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);hashes[rel]=sha(file);locations[rel]=file;
 }
 const save=(name,x)=>core.atomic(root,name+'.json',x),trace=path.join(job,'trace.jsonl'),monitor=createTraceMonitor(trace);
 let server,collector,session,state,error,timer,hardTimer,start,snapshotCount=0,lastProgress=0,peakRss=process.memoryUsage().rss;
 const event=e=>{if(e.event==='llm_request'){const c=JSON.parse(e.body.messages[1].content).candidates;assert(c.length>0&&c.length<=4,'Operating request batch limit');assert.equal(e.body.maxCompletionTokens,config.maxTokens);}fs.appendFileSync(trace,JSON.stringify({at:new Date().toISOString(),...e})+'\n');};
 const stop=reason=>{if(!ctl.signal.aborted){save('external-stop',{reason,budget:monitor()});ctl.abort(Error(reason));}};
 const interrupt=()=>stop('external_interruption');process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 try{
  if(!mock){console.log(JSON.stringify({phase:'quota_washout',seconds:61,variant}));await delay(61000,undefined,{signal:ctl.signal});}
  server=site==='replica'?await startServer(data,{split:'dev'}):await require(path.join(data,'serve.cjs')).start();
  const entry=server.boardUrl||server.entryUrl;
  const identity={provider:mock?'mock':'hcx',model:mock?'SCHEMA_ONLY':config.model,settings:safe,code:core.digest(hashes),dataset:datasetHash,variant};
  save('manifest',{variant,site,mock,entry,limits,settings:safe,hashes,identity,dataset:data,dataset_sha256:datasetHash,token_limit:1500000,concurrency:1,batch:4,
   judgment_module:selected.module?path.relative(project,selected.module):null,comparison:'C baseline vs original batches rotated across three regions; identical within-batch evidence. Historical C baseline timing limitation applies.'});
  start=performance.now();
  timer=setInterval(()=>{try{const b=monitor();peakRss=Math.max(peakRss,process.memoryUsage().rss);if(b.known_tokens+b.unconfirmed_reserved+52000>=1500000)stop('experiment_token_protection');if(performance.now()-start>=1770000)stop('finalization_deadline');}catch(e){stop('monitor_failure');}},250);
  hardTimer=setTimeout(()=>{save('completion',{status:'hard_stopped',reason:'30_minute_hard_stop',budget:monitor(),no_automatic_retry:true});process.exit(2);},1800000);
  const run=bounded.run;
  state=await run({dir:job,entry,scope:'/',mode:'fifo',limits,identity,signal:ctl.signal,graceSeconds:210,observeTechniques:true,
   policy:variant.startsWith('srpt8')?'srpt':'rr',activeWindow:8,aging:8,
   readPage:async(url,signal)=>{
    collector ||= await createCollector({channel:env.BROWSER_CHANNEL||'msedge',onTiming:e=>fs.appendFileSync(path.join(job,'collection-timing.jsonl'),JSON.stringify(e)+'\n')});
    try{const original=await collector.collect(url,{entryUrl:entry,scope:'/',followLinks:false,recordNavigation:true,allowLongText:true,allowEmpty:true,maxPages:1,maxNodes:10000,observeTechniques:true,signal});
     const s=await experiment.prepareSnapshot(original,config,judgment);
     const out=path.join(root,'snapshots');fs.mkdirSync(out,{recursive:true});core.atomic(out,String(++snapshotCount).padStart(4,'0')+'.json',s);return s;
    }catch(e){if(!collector.isConnected())stop('Browser disconnected');throw e;}
   },
   createJudge:({signal,maxCalls,deadlineAt,onRequestState})=>{
    assert(!session,'One shared sequential quota owner');
    if(mock){const calls=[];session={calls,tracksRequests:false,fitBatch:items=>fitBatch(items,config,judgment,4),async decide(items){signal.throwIfAborted();assert(Date.now()<deadlineAt&&calls.length<maxCalls);calls.push({number:calls.length+1,provider:'mock',status:'ok',usage:null,service_sec:0});return judgment.validateModelDecisions(items.map(c=>({node_id:c.node_id,publication_act:'일반정보'})),items);}};return session;}
    session=createSession({...config,maxCalls},{contract:judgment,signal,deadlineAt,onRequestState,log:event});
    session.fitBatch=items=>fitBatch(items,config,judgment,4);return session;
   },
   onProgress:s=>{
    if(s.calls===300&&!s.inflight&&!fs.existsSync(path.join(root,'prefix-300.json')))save('prefix-300',{sha256:core.digest(s),state:structuredClone(s)});
    peakRss=Math.max(peakRss,process.memoryUsage().rss);
    if(performance.now()-lastProgress<5000&&s.status==='running')return;
    lastProgress=performance.now();const p={status:s.status,reason:s.reason,pages:s.pages.length,candidates:s.candidates?.length??s.pages.reduce((n,p)=>n+p.candidates,0),judged_work:s.decisions?.length??s.pages.reduce((n,p)=>n+p.offset,0),calls:s.calls,pending:s.pending.length,elapsed_sec:(performance.now()-start)/1000,rss:process.memoryUsage().rss};
    fs.appendFileSync(path.join(root,'progress.jsonl'),JSON.stringify(p)+'\n');console.log(JSON.stringify(p));
   }
  });
 }catch(e){error=String(e.message).replaceAll(config.apiKey,'[REDACTED]');}
 finally{
  clearInterval(timer);let closeTimer;
  try{await Promise.race([collector?.close(),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error('Collector cleanup timeout')),30000);})]);}catch(e){error ||= e.message;}finally{clearTimeout(closeTimer);}
  try{await server?.close();}catch(e){error ||= e.message;}
  const changed=Object.entries(hashes).filter(([f,h])=>!fs.existsSync(locations[f]||path.join(project,f))||sha(locations[f]||path.join(project,f))!==h).map(([f])=>f);
  try{assert.equal(verifyDataset(data),datasetHash);}catch(e){error ||= e.message;}
  if(changed.length)error ||= 'Frozen source changed';save('source-after',{verified:!changed.length,changed});
  if(state)save('calls',state.call_records);
  save('completion',{status:error?'failed':state?.status||'failed',reason:error||state?.reason,mock,wall_sec:start?(performance.now()-start)/1000:null,budget:monitor(),pages:state?.pages.length||0,peak_rss:peakRss,source_verified:!changed.length,no_automatic_retry:true});
  clearTimeout(hardTimer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
 }
 if(error||state?.status==='failed')throw Error(error||state.reason);
 return state;
}
module.exports={main,limits,loadJudgment};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
