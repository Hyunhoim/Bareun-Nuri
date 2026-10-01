// Role-only calls; paired S predictions are verified historical data, not newly executed stages.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
const {setTimeout:delay}=require('node:timers/promises'),{createSession,configFromEnv}=require('../src/core/llm.cjs'),{parseEnvelope}=require('../src/core/json-envelope.cjs'),{estimate}=require('./semantic-search-run.cjs'),methods=require('./digit-mask-methods.cjs'),baselineMethods=require('./digit-request-methods.cjs');
const DATA='.runtime/digit-generalization-data-v1',BASE='.runtime/digit-role-pilot-v1',ROOT='.runtime/digit-mask-pilot-v1',PLAN='docs/digit-mask-plan.md';
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function loadBaseline(inputs){
 const manifest=read(BASE+'/manifest.json'),audit=read(BASE+'/audit.json');assert.equal(read(BASE+'/completion.json').status,'completed');assert.equal(audit.calls,224);for(const[f,h]of Object.entries(manifest.hashes))assert.equal(sha(f),h,'Historical S source changed');
 const files=[BASE+'/manifest.json',BASE+'/audit.json',BASE+'/completion.json',...Object.keys(manifest.hashes)],maps=[];
 for(const[index,name]of ['00-dev-S','03-dev-S'].entries()){
  const dir=BASE+'/'+name,records=read(dir+'/decisions.json'),calls=read(dir+'/calls.json'),completion=read(dir+'/completion.json'),trace=fs.readFileSync(dir+'/trace.jsonl','utf8').trim().split(/\r?\n/).map(JSON.parse),requests=trace.filter(e=>e.event==='llm_request'),responses=trace.filter(e=>e.event==='llm_response'),qs=baselineMethods.jobs(inputs,index===1,'S'),contract=baselineMethods.contract('S'),by=new Map();
  assert.equal(completion.status,'completed');for(const x of [qs,records,calls,requests,responses])assert.equal(x.length,56);
  for(const[i,batch]of qs.entries()){
   const rq=requests.find(e=>e.call_number===i+1),rs=responses.find(e=>e.call_number===i+1),record=records[i];assert.equal(calls[i].status,'ok');assert.equal(calls[i].http_status,200);assert.equal(rs.data.choices[0].finish_reason,'stop');assert.deepEqual(rq.body,(await estimate(batch,manifest.settings,contract)).body,'Frozen S body mismatch');
   const parsed=parseEnvelope(rs.data.choices[0].message.content),raw=contract.validateModelDecisions(Object.entries(parsed.decisions).map(([node_id,d])=>({node_id,...d})),batch),decisions=baselineMethods.postprocess('S',raw,batch);assert.deepEqual(raw,record.raw);assert.deepEqual(decisions,record.decisions);assert(!by.has(decisions[0].node_id));by.set(decisions[0].node_id,decisions[0]);
  }
  files.push(...['decisions.json','calls.json','completion.json','trace.jsonl'].map(f=>dir+'/'+f));maps.push(by);
 }
 return {maps,files:[...new Set(files)]};
}
async function preflight(){
 const inputs=read(DATA+'/dev-inputs.json');assert.equal(inputs.length,56);const baseline=await loadBaseline(inputs),env={...process.env,...parseEnv(fs.readFileSync('agent/.env','utf8'))},config={...configFromEnv('hcx',env),maxTokens:1024,maxCalls:140,seed:42,tokensPerMinute:58000,minIntervalMs:1000,timeoutMs:180000,retryRateLimit:false,retryTransientTransport:false};assert.equal(config.temperature,0);assert.equal(config.reasoningEffort,'none');
 const plans=[];let reserved=0;for(const reverse of [false,true]){const requests=[];for(const qs of methods.jobs(inputs,reverse)){const e=await estimate(qs,config,methods.contract());assert(e.tokens<=58000);reserved+=e.tokens;requests.push({qs,body:e.body});}plans.push({reverse,requests});}assert.equal(plans.reduce((n,p)=>n+p.requests.length,0),112);assert(reserved<=1000000);return {inputs,baseline,config,plans,reserved};
}
async function main(){
 const {baseline,config,plans,reserved}=await preflight();console.log(JSON.stringify({calls:112,reserved,baseline:'historical verified S00/S03; offline composition'}));if(!process.argv.includes('--live'))return;
 assert(fs.existsSync(PLAN));assert(!fs.existsSync(ROOT),'Never overwrite or retry a run');fs.mkdirSync(ROOT);const save=(name,v)=>fs.writeFileSync(ROOT+'/'+name+'.json',JSON.stringify(v,null,2));
 const files=[...new Set([__filename,PLAN,require.resolve('./digit-mask-methods.cjs'),require.resolve('../src/core/llm.cjs'),require.resolve('../src/core/json-envelope.cjs'),DATA+'/dev-inputs.json',DATA+'/dev-gold.json',...baseline.files])],hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),safe={...config};delete safe.apiKey;fs.mkdirSync(ROOT+'/source');for(const[i,f]of files.entries())fs.copyFileSync(f,ROOT+'/source/'+i+'-'+path.basename(f));save('manifest',{hashes,settings:safe,data:DATA,baseline:BASE,conditions:plans.map(p=>({reverse:p.reverse,requests:p.requests.length})),expected_calls:112,reserved});
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('one_hour_deadline')),3600000),results=[];let fatal=null;
 try{for(const[index,p]of plans.entries()){
  const name=String(index).padStart(2,'0')+'-mask',dir=ROOT+'/'+name;fs.mkdirSync(dir);console.log(JSON.stringify({condition:name,phase:'quota_washout'}));await delay(61000,undefined,{signal:ctl.signal});
  const local=new AbortController(),timeout=setTimeout(()=>local.abort(Error('condition_deadline')),600000),start=performance.now(),records=[];let error=null;
  const session=createSession(config,{contract:methods.contract(),signal:AbortSignal.any([ctl.signal,local.signal]),deadlineAt:Date.now()+600000,log:e=>{if(e.event==='llm_request')assert.deepEqual(e.body,p.requests[e.call_number-1].body);fs.appendFileSync(dir+'/trace.jsonl',JSON.stringify(e)+'\n');},onRequestState:e=>fs.appendFileSync(dir+'/lifecycle.jsonl',JSON.stringify(e)+'\n')});
  try{for(const[i,r]of p.requests.entries()){
   for(const[f,h]of Object.entries(hashes))assert.equal(sha(f),h,'Frozen source changed');const raw=await session.decide(r.qs),call=session.calls.at(-1);assert(Number(call.rate_limit['x-ratelimit-limit-tokens'])>=60000&&Number(call.rate_limit['x-ratelimit-limit-requests'])>=60,'Provider limit changed');const decisions=raw.map(d=>methods.compose(d,baseline.maps[index].get(d.node_id)));records.push({ordinal:i,raw,decisions});fs.writeFileSync(dir+'/decisions.json',JSON.stringify(records));fs.writeFileSync(dir+'/calls.json',JSON.stringify(session.calls));console.log(JSON.stringify({condition:name,done:i+1,total:p.requests.length}));
  }}catch(e){error=String(e.message).replaceAll(config.apiKey,'[REDACTED]');}finally{clearTimeout(timeout);fs.writeFileSync(dir+'/calls.json',JSON.stringify(session.calls));}
  const result={condition:name,reverse:p.reverse,status:error?'failed':'completed',error,role_only_wall_sec:(performance.now()-start)/1000,calls:session.calls.length,tokens:session.calls.reduce((n,c)=>n+(c.usage?.total_tokens||0),0)};fs.writeFileSync(dir+'/completion.json',JSON.stringify(result,null,2));results.push(result);save('results',results);if(error)throw Error(error);
 }}catch(e){fatal=String(e.message).replaceAll(config.apiKey,'[REDACTED]');}finally{clearTimeout(timer);save('completion',{status:fatal?'failed':'completed',error:fatal,conditions:results.length,no_automatic_retry:true});}if(fatal)process.exitCode=1;
}
module.exports={preflight,loadBaseline};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
