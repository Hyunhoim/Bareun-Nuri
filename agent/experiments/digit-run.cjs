// Opt-in paid resolver. Source snapshots and experiment budgets are shared across sequential runs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{parseEnv}=require('node:util');
const {createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs');
const {decideIdentified}=require('./contextualize.cjs'),contract=require('./digit-contract.cjs');
async function main(){
 const [input,out,manifestFile,order='original']=process.argv.slice(2);
 if(!input||!out||!manifestFile||!['original','reverse'].includes(order)||fs.existsSync(out))throw Error('Usage: digit-run.cjs EVIDENCE NEW_OUTPUT SEALED_MANIFEST [original|reverse]');
 const manifest=JSON.parse(fs.readFileSync(manifestFile)),root=path.dirname(manifestFile),lock=path.join(root,'active.lock');
 if(path.dirname(path.resolve(out))!==path.resolve(root))throw Error('Run output must be a direct child of the shared budget directory');
 const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const verify=()=>{for(const[f,h]of Object.entries(manifest.files))assert.equal(hash(f),h,'Changed sealed file '+f);};verify();
 if(manifest.files[input]!==hash(input))throw Error('Input not sealed');
 const snapshot=JSON.parse(fs.readFileSync(input)),observations=snapshot.technique_observations;if(!observations)throw Error('Observation sidecar required');
 const queries=contract.digitQueries(snapshot,observations),ordered=order==='reverse'?queries.slice().reverse():queries;
 let previousCalls=0,previousTokens=0;
 for(const dir of fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory())){const file=path.join(root,dir.name,'run.json');if(!fs.existsSync(file))continue;const run=JSON.parse(fs.readFileSync(file));previousCalls+=run.calls.length;if(!Number.isFinite(run.totalTokens))throw Error('Previous usage missing');previousTokens+=run.totalTokens;}
 if(previousCalls>=80||previousTokens>=80000)throw Error('Experiment budget exhausted');
 const env={...process.env,...parseEnv(fs.readFileSync(path.join(__dirname,'../.env'),'utf8'))},config={...configFromEnv('hcx',env),reasoningEffort:'none',maxTokens:2048,maxCalls:80-previousCalls,
  timeoutMs:180000,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:true,retryTransientTransport:true,seed:42};
 fs.mkdirSync(out,{recursive:true});const save=(n,v)=>fs.writeFileSync(path.join(out,n+'.json'),JSON.stringify(v,null,2));
 const handle=fs.openSync(lock,'wx');fs.closeSync(handle);
 const ctl=new AbortController(),cancel=()=>ctl.abort(Error('Cancelled')),timer=setTimeout(()=>ctl.abort(Error('One hour limit')),3600000);process.once('SIGINT',cancel);
 let session,status='failed',error;const judgments=[],started=performance.now();
 try{
  session=createSession(config,{contract,signal:ctl.signal,log:e=>{
   if(e.event==='llm_request'){const used=previousTokens+session.calls.reduce((sum,c)=>sum+(c.usage?.total_tokens||0),0);if(used+estimateRequestTokens(e.body)>80000)throw Error('Experiment token budget reached');}
   fs.appendFileSync(path.join(out,'trace.jsonl'),JSON.stringify(e)+'\n');
  }});
  save('settings',{model:config.model,thinking:config.reasoningEffort,temperature:config.temperature,seed:config.seed,maxTokens:config.maxTokens,batch:4,order});save('evidence',snapshot);save('queries',queries);save('source-manifest',manifest);
  for(let i=0;i<ordered.length;i+=4){judgments.push(...await decideIdentified(session,ordered.slice(i,i+4)));save('judgments',judgments);
   if(session.calls.some(c=>!Number.isFinite(c.usage?.total_tokens)))throw Error('API usage missing');
   if(previousTokens+session.calls.reduce((s,c)=>s+c.usage.total_tokens,0)>80000)throw Error('Experiment token budget exceeded');
   console.log(JSON.stringify({processed:judgments.length,total:queries.length,calls:session.calls.length}));
  }
  verify();save('observations',contract.applyDigitJudgments(snapshot,observations,queries,judgments));status='completed';
 }catch(e){error=String(e.message).replaceAll(config.apiKey,'[REDACTED]');throw Error(error);}
 finally{clearTimeout(timer);process.removeListener('SIGINT',cancel);fs.unlinkSync(lock);const calls=session?.calls||[];save('run',{status,error,order,calls,actualCalls:true,elapsedSec:(performance.now()-started)/1000,
  totalTokens:calls.every(c=>Number.isFinite(c.usage?.total_tokens))?calls.reduce((s,c)=>s+c.usage.total_tokens,0):null});}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
