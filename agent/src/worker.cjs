const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { parseEnv } = require('node:util');
const { collect } = require('./core/collect.cjs');
const { configFromEnv, createSession } = require('./core/llm.cjs');
const { outputResult } = require('./core/output.cjs');
const controller = new AbortController();
let running = false;
const emit = value => process.stdout.write(JSON.stringify(value)+'\n');
function save(dir,name,value) {
  const file=path.join(dir,name), temp=file+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(value,null,2),'utf8');fs.renameSync(temp,file);
}
async function run(input) {
  const started=performance.now(),startedAt=new Date().toISOString();
  let config,session,snapshot,decisions=[],timer;
  const state={status:'running',phase:'collecting',pages:0,candidates:0,processed:0,calls:0,totalTokens:null,startedAt};
  try {
    const url=new URL(input.url);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw Error('HTTP(S) URL without credentials required');
    if(!['hcx','mock'].includes(input.provider)) throw Error('Unknown provider');
    for(const [field,max] of [['maxPages',200],['maxNodes',10000],['maxCalls',300],['timeoutSeconds',1800]])
      if(!Number.isInteger(input[field])||input[field]<1||input[field]>max) throw Error('Invalid '+field);
    fs.mkdirSync(input.jobDir,{recursive:true});
    const env={...process.env,...(fs.existsSync(input.envFile)?parseEnv(fs.readFileSync(input.envFile,'utf8')):{})};
    config={...configFromEnv(input.provider,env),maxTokens:3072,timeoutMs:180000,maxCalls:input.maxCalls,
      minIntervalMs:input.provider==='hcx'?1000:0,tokensPerMinute:input.provider==='hcx'?52000:undefined,
      retryRateLimit:true,retryTransientTransport:true,seed:42};
    timer=setTimeout(()=>controller.abort(Error('Run time limit exceeded')),input.timeoutSeconds*1000);
    session=createSession(config,{signal:controller.signal,log:event=>{
      if(event.event==='llm_request') {state.calls=session.calls.length;emit({type:'progress',...state});}
      fs.appendFileSync(path.join(input.jobDir,'trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n');
    }});
    emit({type:'progress',...state});
    snapshot=await collect(input.url,{signal:controller.signal,channel:env.BROWSER_CHANNEL||'msedge',
      maxPages:input.maxPages,maxNodes:input.maxNodes,onProgress:progress=>{
        Object.assign(state,progress);emit({type:'progress',...state});
      }});
    save(input.jobDir,'evidence.json',snapshot);
    state.phase='judging';
    for(let offset=0;offset<snapshot.candidates.length;offset+=16) {
      controller.signal.throwIfAborted();
      decisions.push(...await session.decide(snapshot.candidates.slice(offset,offset+16)));
      state.processed=decisions.length;state.calls=session.calls.length;
      save(input.jobDir,'partial-decisions.json',decisions);emit({type:'progress',...state});
    }
    controller.signal.throwIfAborted();
    const output=outputResult(snapshot,decisions,startedAt,(performance.now()-started)/1000,input.provider);
    save(input.jobDir,'result.json',output.result);save(input.jobDir,'diagnostics.json',output.diagnostics);
    state.status=output.diagnostics.length||snapshot.blocked_requests.length?'completed_with_warnings':'completed';
    state.needsReview=output.diagnostics.length;state.blockedRequests=snapshot.blocked_requests.length;
    state.findings=output.result.findings.length;state.phase='finished';
  } catch(error) {
    state.status=controller.signal.reason?.message==='Cancelled by user'?'cancelled':'failed';
    state.phase='finished';state.error=String(error.message).replaceAll(config?.apiKey||'NO_SECRET','[REDACTED]');
  } finally {
    clearTimeout(timer);state.elapsedSec=(performance.now()-started)/1000;state.calls=session?.calls.length||0;
    const calls=session?.calls||[];
    state.totalTokens=calls.length&&calls.every(c=>Number.isFinite(c.usage?.total_tokens))?calls.reduce((s,c)=>s+c.usage.total_tokens,0):null;
    save(input.jobDir,'run.json',{...state,calls,provider:input.provider,model:config?.model||null});
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
