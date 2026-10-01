const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { parseEnv } = require('node:util');
const { createCollector } = require('../../src/core/collect.cjs');
const { configFromEnv, createSession } = require('../../src/core/llm.cjs');
const {digest}=require('../../src/core/scan.cjs');
const {run:scan,executionSignature}=require('./bounded-scan.cjs');
const {fitBatch}=require('../../src/core/request-budget.cjs');
const {contract:judgmentContract,MAX_BATCH}=require('../../src/core/judgment.cjs');
const {identity:antiSpoofIdentity,createAntiSpoof}=require('../../src/core/antispoof.cjs');
const controller = new AbortController();
let running = false;
const emit = value => process.stdout.write(JSON.stringify(value)+'\n');
function save(dir,name,value) {
  const file=path.join(dir,name), temp=file+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(value,null,2),'utf8');fs.renameSync(temp,file);
}
async function run(input) {
  const started=performance.now(),startedAt=input.firstStartedAt||new Date().toISOString();
  let config,scanState,collector,collectorReady,antiSpoof,segments,segment,hardTimer;
  let artifactsAccepted=false;
  const state={status:'running',phase:'collecting',pages:0,candidates:0,processed:0,calls:0,totalTokens:null,startedAt};
  try {
    const url=new URL(input.url);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw Error('HTTP(S) URL without credentials required');
    if(!['hcx','mock'].includes(input.provider)) throw Error('Unknown provider');
    for(const [field,max] of [['maxPages',200],['maxCalls',600],['timeoutSeconds',3600]])
      if(!Number.isInteger(input[field])||input[field]<1||input[field]>max) throw Error('Invalid '+field);
    if(!Number.isInteger(input.maxNodes)||input.maxNodes<0||input.maxNodes>10000)throw Error('Invalid maxNodes');
    fs.mkdirSync(input.jobDir,{recursive:true});
    const checkpoint=path.join(input.jobDir,'checkpoint.json');
    const previous=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;
    if(previous&&digest(previous.state)!==previous.sha256)throw Error('Checkpoint checksum mismatch');
    const env={...process.env,...(fs.existsSync(input.envFile)?parseEnv(fs.readFileSync(input.envFile,'utf8')):{})};
    config={...configFromEnv(input.provider,env),maxTokens:input.provider==='hcx'?512:3072,timeoutMs:180000,maxCalls:input.maxCalls,
      minIntervalMs:input.provider==='hcx'?1000:0,tokensPerMinute:input.provider==='hcx'?58000:undefined,
      retryRateLimit:true,retryTransientTransport:false,seed:42};
    const judgment=input.provider==='hcx'?judgmentContract():undefined;
    const identity={provider:input.provider,model:config.model,code:digest([fs.readFileSync(__filename,'utf8'),fs.readFileSync(path.join(__dirname,'bounded-scan.cjs'),'utf8'),...['collect.cjs','scan.cjs','bounded-scan.cjs','bounded-scan-store.cjs','frontier.cjs','frame-access.cjs','llm.cjs','json-envelope.cjs','output.cjs','request-budget.cjs','jamo.cjs','jamo-reading.cjs','judgment.cjs','techniques.cjs','confusables-latin.json'].map(f=>fs.readFileSync(path.resolve(__dirname,'../../src/core',f),'utf8'))]),settings:{...config,apiKey:undefined},judgment:judgment?'publication-act-v1-batch'+MAX_BATCH:'baseline'};
    const scheduling={policy:'srpt',activeWindow:8,quantum:1,aging:8,batchSize:judgment?MAX_BATCH:4,collectionConcurrency:5};
    if(judgment)identity.antispoof={...antiSpoofIdentity(),bridge:digest(fs.readFileSync(path.resolve(__dirname,'../../src/core/antispoof.cjs'),'utf8'))};
    if(previous&&previous.state.signature!==executionSignature({entry:input.url,scope:'/',identity,observeTechniques:!!judgment,...scheduling}))throw Error('Cannot resume changed input/code/model/strategy');
    if(previous?.state.inflight&&(previous.state.inflight.phase!=='wave'||previous.state.inflight.requests.some(r=>!['prepared','rejected','durable'].includes(r.phase))))throw Error('Unconfirmed in-flight judgment: automatic retry refused');
    const segmentFile=path.join(input.jobDir,'segments.json');
    segments=fs.existsSync(segmentFile)?JSON.parse(fs.readFileSync(segmentFile,'utf8')):[];
    segment={number:segments.length+1,started_at:input.segmentStartedAt||startedAt,status:'running',
      idle_sec:segments.length?Math.max(0,(Date.parse(input.segmentStartedAt||startedAt)-Date.parse(segments.at(-1).finished_at||segments.at(-1).started_at))/1000):0};
    if(!Number.isFinite(Date.parse(segment.started_at)))throw Error('Invalid segment start');
    artifactsAccepted=true;
    segments.push(segment);save(input.jobDir,'segments.json',segments);
    const remaining=Math.max(.001,input.timeoutSeconds-(Date.now()-Date.parse(segment.started_at))/1000);
    hardTimer=setTimeout(()=>controller.abort(Error('finalization_deadline')),(remaining+270)*1000);
    scanState=await scan({dir:input.jobDir,entry:input.url,scope:'/',mode:'fifo',observeTechniques:!!judgment,...scheduling,
      limits:{pages:(previous?.state.attempts.length||0)+input.maxPages,nodes:input.maxNodes,
        calls:(previous?.state.calls||0)+input.maxCalls,seconds:(previous?.state.elapsed_sec||0)+remaining,memoryBytes:768*1024*1024},
      graceSeconds:210,identity,signal:controller.signal,
      readPage:async(url,signal)=>{
        signal.throwIfAborted();
        collector ||= await (collectorReady ||= createCollector({channel:env.BROWSER_CHANNEL||'msedge',
          onTiming:event=>fs.appendFileSync(path.join(input.jobDir,'collection-timing.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n')}));
        try { return await collector.collect(url,{entryUrl:input.url,scope:'/',followLinks:false,recordNavigation:true,allowLongText:true,allowEmpty:true,
          maxPages:1,maxNodes:10000,observeTechniques:!!judgment,signal}); }
        catch(error) {
          // A dead shared process must not turn the remaining queue into visited failures.
          if(!collector.isConnected())controller.abort(Error('Browser disconnected; pending URLs preserved'));
          throw error;
        }
      },
      createJudge:({signal,maxCalls,deadlineAt,onRequestState})=>{
        // Deadline/lifecycle apply to real dispatch, not the no-network fitBatch estimator.
        const tracked=createSession({...config,maxCalls},{signal,deadlineAt,onRequestState,contract:judgment,
          log:event=>fs.appendFileSync(path.join(input.jobDir,'trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n')});
        if(input.provider==='hcx'){
          tracked.fitBatch=items=>fitBatch(items,config,judgment,MAX_BATCH);
          antiSpoof=createAntiSpoof({python:env.ANTISPOOF_PYTHON,signal,deadlineAt});
          const decide=tracked.decide.bind(tracked);
          let cpu=Promise.resolve();tracked.decide=async items=>{const values=await decide(items);const result=cpu.then(()=>antiSpoof.annotate(items,values));cpu=result.catch(()=>{});return result;};
        }return tracked;
      },
      onProgress:s=>{
        Object.assign(state,{status:'running',phase:'scanning',pages:s.pages.length,candidates:s.pages.reduce((n,p)=>n+p.candidates,0),processed:s.pages.reduce((n,p)=>n+p.offset-(p.quarantined_work||0),0),quarantined:s.pages.reduce((n,p)=>n+(p.quarantined_work||0),0),calls:s.calls,
          pendingPages:s.pending.length,excludedLinks:s.excluded.length,collectionIssues:s.issues.length,elapsedSec:s.elapsed_sec});
        emit({type:'progress',...state});
      }});
    state.status=scanState.status;state.reason=scanState.reason;state.phase='finished';
    state.unstablePages=scanState.pages.filter(p=>p.readiness?.settled===false).length;
    const diagnostics=JSON.parse(fs.readFileSync(path.join(input.jobDir,'diagnostics.json')));
    state.needsReview=diagnostics.length;state.findings=JSON.parse(fs.readFileSync(path.join(input.jobDir,'result.json'))).findings.length;
    if(state.status==='completed'&&diagnostics.length)state.status='completed_with_warnings';
  } catch(error) {
    state.status=controller.signal.reason?.message==='Cancelled by user'?'cancelled':'failed';
    const failure=controller.signal.aborted?controller.signal.reason:error;
    state.phase='finished';state.error=String(failure?.message||error.message).replaceAll(config?.apiKey||'NO_SECRET','[REDACTED]');
  } finally {
    antiSpoof?.close();
    let closeTimer;
    try { await Promise.race([collector?.close(),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error('Browser cleanup timeout')),30000);})]); }
    catch(error) { state.status='failed';state.error='Browser cleanup failed: '+String(error.message).replaceAll(config?.apiKey||'NO_SECRET','[REDACTED]'); }
    finally {clearTimeout(closeTimer);clearTimeout(hardTimer);}
    state.segmentElapsedSec=segment?Math.max(0,(Date.now()-Date.parse(segment.started_at))/1000):(performance.now()-started)/1000;
    state.elapsedSec=Math.max(0,(Date.now()-Date.parse(input.firstStartedAt||scanState?.started_at||startedAt))/1000);
    state.activeElapsedSec=(segments||[]).slice(0,-1).reduce((n,s)=>n+(s.elapsed_sec||0),0)+state.segmentElapsedSec;
    state.exceeded30Minutes=state.elapsedSec>1800;state.calls=scanState?.calls||0;
    const calls=scanState?.call_records||[];
    state.totalTokens=calls.length&&calls.every(c=>Number.isFinite(c.usage?.total_tokens))?calls.reduce((s,c)=>s+c.usage.total_tokens,0):null;
    if(artifactsAccepted&&segment){
      Object.assign(segment,{finished_at:new Date().toISOString(),elapsed_sec:state.segmentElapsedSec,status:state.status,reason:scanState?.reason||state.error});
      save(input.jobDir,'segments.json',segments);state.segmentNumber=segment.number;
      const resultFile=path.join(input.jobDir,'result.json');
      if(fs.existsSync(resultFile)){const result=JSON.parse(fs.readFileSync(resultFile,'utf8'));
        Object.assign(result.meta,{started_at:input.firstStartedAt||scanState?.started_at||startedAt,finished_at:segment.finished_at,elapsed_sec:state.elapsedSec});save(input.jobDir,'result.json',result);}
      const archive=path.join(input.jobDir,'segments',String(segment.number).padStart(4,'0'));fs.mkdirSync(archive,{recursive:true});
      for(const name of ['result.json','coverage.json','run.json',...(input.provider==='hcx'?['diagnostics.json','technique-diagnostics.json']:[])])if(fs.existsSync(path.join(input.jobDir,name)))fs.copyFileSync(path.join(input.jobDir,name),path.join(archive,name));
      save(archive,'segment.json',segment);
    }
    if(artifactsAccepted)save(input.jobDir,'worker-run.json',{...state,calls,provider:input.provider,model:config?.model||null});
    emit({type:'done',...state});process.exitCode=['failed','cancelled'].includes(state.status)?1:0;lines.close();process.stdin.pause();
  }
}
const lines=readline.createInterface({input:process.stdin});
lines.on('line',line=>{
  try {
    const value=JSON.parse(line);
    if(value.action==='cancel') controller.abort(Error('Cancelled by user'));
    else if(!running) {running=true;run(value).catch(()=>{emit({type:'fatal',error:'Agent persistence failure'});process.exit(1);});}
  } catch {emit({type:'fatal',error:'Invalid worker input'});process.exitCode=1;lines.close();}
});
lines.on('close',()=>{if(running&&!controller.signal.aborted) controller.abort(Error('Parent connection closed'));});
