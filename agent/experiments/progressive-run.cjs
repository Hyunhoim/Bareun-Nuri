const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
const {collect}=require('../src/core/collect.cjs'),{createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs');
const {run,atomic,acquireLock}=require('./progressive.cjs');
const {fitBatch}=require('./request-budget.cjs');
async function main(){
 const [entry,dir,mode,pages,calls,seconds,provider='mock']=process.argv.slice(2);
 if(!entry||!dir||!mode)throw Error('Usage: progressive-run.cjs URL DIR fifo|priority|filter PAGES CALLS SECONDS mock|hcx');
 const url=new URL(entry);assert(['127.0.0.1','localhost'].includes(url.hostname),'Trial runner is local-site only');
 const root=path.dirname(dir),manifestPath=path.join(root,'manifest.json');
 const manifest=JSON.parse(fs.readFileSync(manifestPath));
 const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const verify=()=>{for(const [p,h]of Object.entries(manifest.files))assert.equal(hash(p),h,'Frozen file changed: '+p);};verify();
 const env=provider==='hcx'?{...process.env,...parseEnv(fs.readFileSync(path.join(__dirname,'../.env'),'utf8'))}:{};
 const config={...configFromEnv(provider,env),temperature:0,reasoningEffort:'none',seed:42,maxTokens:3072,timeoutMs:180000,
  minIntervalMs:provider==='hcx'?1000:0,tokensPerMinute:provider==='hcx'?52000:undefined,retryRateLimit:true,retryTransientTransport:true};
 const budgetPath=path.join(root,'budget.json');
 const budget=fs.existsSync(budgetPath)?JSON.parse(fs.readFileSync(budgetPath)):{requests:[]};
 const used=()=>budget.requests.reduce((n,c)=>n+(Number.isFinite(c.tokens)?c.tokens:c.reserved),0);
 const liveLock=acquireLock(root,'live.lock');
 try{
  const state=await run({dir,entry,scope:'/'+url.pathname.split('/').filter(Boolean)[0]+'/',mode,
   limits:{pages:Number(pages),calls:Number(calls),seconds:Number(seconds)},identity:{provider,manifest:hash(manifestPath),model:config.model,temperature:0,thinking:'none',seed:42,maxTokens:3072},
   readPage:(target,signal)=>collect(target,{scope:'/'+url.pathname.split('/').filter(Boolean)[0]+'/',followLinks:false,recordNavigation:true,allowLongText:true,maxPages:1,maxNodes:10000,signal}),
   createJudge:o=>{
    const indices=new Map();
    const session=createSession({...config,maxCalls:o.maxCalls},{signal:o.signal,log:e=>{
     if(e.event==='llm_request'){
      const reserved=estimateRequestTokens(e.body);
      if(budget.requests.length>=96||used()+reserved>900000)throw Error('Shared experiment budget reached');
      const index=budget.requests.length;indices.set(e.call_number,index);budget.requests.push({run:path.basename(dir),call:e.call_number,reserved,tokens:null});
      atomic(root,'budget.json',budget);
     }
     if(e.event==='llm_response'){
      const record=budget.requests[indices.get(e.call_number)];assert(record,'Missing request reservation');
      if(!Number.isFinite(e.data?.usage?.total_tokens)&&provider==='hcx')throw Error('API usage missing');
      record.tokens=e.data?.usage?.total_tokens??null;atomic(root,'budget.json',budget);
     }
     fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify(e)+'\n');
    }});
    const decide=session.decide;session.decide=async cs=>{console.log(JSON.stringify({mode,split:url.pathname,batch:cs.length,requests:budget.requests.length}));
     try{return await decide(cs);}catch(e){e.message=e.message.replaceAll(config.apiKey||'NO_SECRET','[REDACTED]');throw e;}};
    if(provider==='hcx')session.fitBatch=cs=>fitBatch(cs,config);
    return session;
   }});
  verify();console.log(JSON.stringify({status:state.status,reason:state.reason,pages:state.pages.length,decisions:state.decisions.length,calls:state.calls,elapsed:state.elapsed_sec}));
  if(state.status==='failed'||state.inflight)process.exitCode=1;
 }finally{fs.unlinkSync(liveLock);}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
