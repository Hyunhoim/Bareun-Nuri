// Opt-in stage-4 trial of the current worker contract, never imported by worker.cjs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{parseEnv}=require('node:util');
const {createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs');
const {outputResult}=require('../src/core/output.cjs'),{planReuse,expandDecisions}=require('./reuse.cjs');
function budgetUsage(call){
 if(Number.isFinite(call.usage?.total_tokens)&&call.usage.total_tokens>=0)return call.usage.total_tokens;
 if(call.http_status===429&&Number.isFinite(call.reserved_tokens)&&call.reserved_tokens>0)return call.reserved_tokens;
 throw Error('API usage missing; no zero-cost assumption');
}
async function main(){
 const [mode,input,out,manifestFile]=process.argv.slice(2);
 if(!['baseline','reuse','baseline-repeat'].includes(mode)||!input||!out||!manifestFile||fs.existsSync(out))throw Error('Usage: reuse-run.cjs MODE EVIDENCE NEW_OUTPUT MANIFEST');
 const root=path.dirname(manifestFile),manifest=JSON.parse(fs.readFileSync(manifestFile));assert.equal(path.dirname(path.resolve(out)),path.resolve(root));
 const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const verify=()=>{for(const[f,h]of Object.entries(manifest.files))assert.equal(hash(f),h,'Frozen file changed '+f);};verify();assert.equal(hash(input),manifest.files[input]);
 let previousCalls=0,previousTokens=0;
 for(const d of fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory())){const f=path.join(root,d.name,'run.json');if(!fs.existsSync(f))continue;const r=JSON.parse(fs.readFileSync(f));previousCalls+=r.calls.length;previousTokens+=r.calls.reduce((s,c)=>s+budgetUsage(c),0);}
 if(previousCalls>=64||previousTokens>=400000)throw Error('Stage-4 experiment budget exhausted');
 const snapshot=JSON.parse(fs.readFileSync(input)),plan=planReuse(snapshot),candidates=mode==='reuse'?plan.representatives:snapshot.candidates;
 const env={...process.env,...parseEnv(fs.readFileSync(path.join(__dirname,'../.env'),'utf8'))};
 const config={...configFromEnv('hcx',env),temperature:0,reasoningEffort:'none',seed:42,maxTokens:3072,maxCalls:64-previousCalls,timeoutMs:180000,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:true,retryTransientTransport:true};
 const lock=path.join(root,'active.lock'),handle=fs.openSync(lock,'wx');fs.closeSync(handle);fs.mkdirSync(out);
 const save=(n,v)=>fs.writeFileSync(path.join(out,n+'.json'),JSON.stringify(v,null,2));
 const ctl=new AbortController(),cancel=()=>ctl.abort(Error('Cancelled')),timer=setTimeout(()=>ctl.abort(Error('One hour limit')),3600000);process.once('SIGINT',cancel);
 const started=new Date().toISOString(),begin=performance.now(),answers=[];let session,status='failed',error;
 try{
  session=createSession(config,{signal:ctl.signal,log:e=>{
   if(e.event==='llm_request'&&previousTokens+session.calls.slice(0,-1).reduce((s,c)=>s+budgetUsage(c),0)+estimateRequestTokens(e.body)>400000)throw Error('Token budget reached');
   fs.appendFileSync(path.join(out,'trace.jsonl'),JSON.stringify(e)+'\n');
  }});
  save('evidence',snapshot);save('plan',{mode,aliases:plan.aliases,representatives:plan.representatives.map(c=>c.node_id)});save('source-manifest',manifest);
  save('settings',{model:config.model,temperature:config.temperature,thinking:config.reasoningEffort,seed:config.seed,maxTokens:config.maxTokens,batch:16,mode});
  for(let i=0;i<candidates.length;i+=16){
   answers.push(...await session.decide(candidates.slice(i,i+16)));save('representative-decisions',answers);
   if(previousTokens+session.calls.reduce((s,c)=>s+budgetUsage(c),0)>400000)throw Error('Token budget exceeded');
   console.log(JSON.stringify({mode,processed:answers.length,total:candidates.length,calls:session.calls.length}));
  }
  const decisions=mode==='reuse'?expandDecisions(snapshot,plan,answers):answers;
  const output=outputResult(snapshot,decisions,started,(performance.now()-begin)/1000,'hcx');verify();
  save('decisions',decisions);save('result',output.result);save('diagnostics',output.diagnostics);status='completed';
 }catch(e){error=String(e.message).replaceAll(config.apiKey,'[REDACTED]');throw Error(error);}
 finally{
  clearTimeout(timer);process.removeListener('SIGINT',cancel);fs.unlinkSync(lock);const calls=session?.calls||[];
  save('run',{status,error,mode,calls,elapsedSec:(performance.now()-begin)/1000,actualCalls:true,candidates:snapshot.candidates.length,judgedCandidates:candidates.length,
   totalTokens:calls.every(c=>Number.isFinite(c.usage?.total_tokens))?calls.reduce((s,c)=>s+c.usage.total_tokens,0):null,knownTokens:calls.reduce((s,c)=>s+(c.usage?.total_tokens||0),0)});
 }
}
module.exports={budgetUsage};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
