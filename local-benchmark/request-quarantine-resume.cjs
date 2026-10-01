// Test the real checkpoint in an isolated copy, with network forbidden.
require('./request-quarantine-preload.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{parseEnv}=require('node:util');
const {run,executionSignature,materialize}=require('../agent/src/core/bounded-scan.cjs'),{digest}=require('../agent/src/core/scan.cjs');
const {contract,MAX_BATCH}=require('../agent/src/core/judgment.cjs'),{configFromEnv,createSession}=require('../agent/src/core/llm.cjs'),{fitBatch}=require('../agent/src/core/request-budget.cjs'),anti=require('../agent/src/core/antispoof.cjs');
async function main(){
 const dir=path.resolve(process.argv[2]),source=path.join(dir,'scan'),target=path.join(dir,'resume-offline');assert(!fs.existsSync(target));
 const original=fs.readFileSync(path.join(source,'checkpoint.json')),cp=JSON.parse(original),s=cp.state;assert(!s.inflight);
 const env={...process.env,...parseEnv(fs.readFileSync('agent/.env','utf8'))},config={...configFromEnv('hcx',env),maxTokens:512,timeoutMs:180000,maxCalls:600,minIntervalMs:1000,tokensPerMinute:58000,retryRateLimit:true,retryTransientTransport:false,seed:42};
 const core=path.resolve('agent/src/core'),identity={provider:'hcx',model:config.model,code:digest([fs.readFileSync('agent/src/worker.cjs','utf8'),...['collect.cjs','scan.cjs','bounded-scan.cjs','bounded-scan-store.cjs','frontier.cjs','frame-access.cjs','llm.cjs','json-envelope.cjs','output.cjs','request-budget.cjs','jamo.cjs','jamo-reading.cjs','judgment.cjs','techniques.cjs','confusables-latin.json'].map(f=>fs.readFileSync(path.join(core,f),'utf8'))]),settings:{...config,apiKey:undefined},judgment:'publication-act-v1-batch'+MAX_BATCH,antispoof:{...anti.identity(),bridge:digest(fs.readFileSync(path.join(core,'antispoof.cjs'),'utf8'))}};
 const scheduling={policy:'srpt',activeWindow:8,quantum:1,aging:8,batchSize:12,collectionConcurrency:5};
 assert.equal(executionSignature({entry:s.entry,scope:'/',identity,observeTechniques:true,...scheduling}),s.signature,'Must test exact original identity, not migrate it');
 fs.cpSync(source,target,{recursive:true});const old=materialize(target,s).decisions,quarantined=new Set(s.issues.flatMap(x=>x.quarantined_ids||[]));let calls=0;
 global.fetch=async(url,options)=>{calls++;const cs=JSON.parse(JSON.parse(options.body).messages[1].content).candidates;assert(cs.every(c=>!quarantined.has(c.node_id)));return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:'stop',message:{content:JSON.stringify({decisions:Object.fromEntries(cs.map(c=>[c.node_id,{publication_act:'일반정보'}]))})},usage:{promptTokens:1,completionTokens:1,totalTokens:2}}}),{status:200});};
 const after=await run({dir:target,entry:s.entry,scope:'/',mode:'fifo',identity,observeTechniques:true,...scheduling,limits:{pages:s.attempts.length+1,calls:s.calls+1,seconds:s.elapsed_sec+60,nodes:0},
 readPage:async url=>({pages:[{url,navigation:{links:[]},readiness:{settled:true}}],candidates:[],technique_observations:[],collection_issues:[]}),
 createJudge:opts=>{const x=createSession({...config,maxCalls:opts.maxCalls,minIntervalMs:0},{...opts,contract:contract()});x.fitBatch=items=>fitBatch(items,config,contract(),12);return x;}});
 assert.equal(calls,1);assert.equal(after.status,'partial');assert.equal(after.reason,'call_budget');const by=new Map(materialize(target,after).decisions.map(d=>[d.node_id,d]));for(const d of old)assert.deepEqual(by.get(d.node_id),d);
 const coverage=JSON.parse(fs.readFileSync(path.join(target,'coverage.json')));assert([...quarantined].every(id=>coverage.unjudged.some(x=>x.node_id===id)));assert(fs.readFileSync(path.join(source,'checkpoint.json')).equals(original));
 const out={status:'passed',same_identity:true,original_unchanged:true,prior_decisions_preserved:old.length,quarantined_preserved:quarantined.size,stub_calls:calls,live_api_calls:0};fs.writeFileSync(path.join(dir,'resume-audit.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
