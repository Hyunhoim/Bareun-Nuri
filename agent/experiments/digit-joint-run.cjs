// Frozen experiment runner. Dry preflight writes nothing and makes no API calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises'),{parseEnv}=require('node:util'),{createSession,configFromEnv}=require('../src/core/llm.cjs'),{parseEnvelope}=require('../src/core/json-envelope.cjs');
const operating=require('../src/core/judgment.cjs'),joint=require('./digit-joint-contract.cjs'),{estimate}=require('./semantic-search-run.cjs');
const INPUT='.runtime/throughput-hypotheses-v1/inputs.json',ORDER=['A','J','J','A'];
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function jobs(groups){return groups.flatMap(g=>Array.from({length:Math.ceil(g.candidates.length/12)},(_,i)=>({group:g.name,candidates:g.candidates.slice(i*12,i*12+12)})));}
async function preflight(){
 const groups=JSON.parse(fs.readFileSync(INPUT)).map(g=>({name:g.name,candidates:g.snapshot.candidates}));
 const env={...process.env,...parseEnv(fs.readFileSync('agent/.env','utf8'))},config={...configFromEnv('hcx',env),seed:42,maxTokens:512,maxCalls:60,tokensPerMinute:58000,minIntervalMs:1000,timeoutMs:180000,retryRateLimit:false,retryTransientTransport:false};
 assert.equal(config.reasoningEffort,'none');assert.equal(config.temperature,0);
 const plans={},batches=jobs(groups);let reserved=0;
 for(const mode of ['A','J']){plans[mode]=[];for(const p of batches){const e=await estimate(p.candidates,config,(mode==='A'?operating:joint).contract());assert(e.tokens<=58000);reserved+=e.tokens*2;plans[mode].push({...p,body:e.body});}}
 assert(batches.length*4<=60&&reserved<=500000);
 const queries=groups.flatMap(g=>g.candidates.map(c=>joint.digitQueries(c))),summary={candidates:queries.length,numeric_candidates:queries.filter(q=>q.length).length,numeric_tokens:queries.flat().length,max_tokens_per_candidate:Math.max(...queries.map(q=>q.length)),max_tokens_per_batch:Math.max(...batches.map(p=>p.candidates.reduce((n,c)=>n+joint.digitQueries(c).length,0))),calls:batches.length*4,reserved};
 return {config,plans,summary};
}
async function main(){
 const {config,plans,summary}=await preflight();console.log(JSON.stringify(summary));if(!process.argv.includes('--live'))return;
 const root=process.argv.find(x=>x.startsWith('--root='))?.slice(7)||'.runtime/digit-joint-v1',plan=process.argv.find(x=>x.startsWith('--plan='))?.slice(7)||'docs/digit-joint-plan.md';
 assert(fs.existsSync(plan),'Freeze a written plan before live execution');assert(!fs.existsSync(root),'Never overwrite or retry an existing run');
 fs.mkdirSync(root,{recursive:true});const save=(name,v)=>fs.writeFileSync(root+'/'+name+'.json',JSON.stringify(v,null,2));
 const files=[__filename,INPUT,plan,require.resolve('./digit-joint-contract.cjs'),require.resolve('./digit-generalization-methods.cjs'),require.resolve('../src/core/judgment.cjs'),require.resolve('../src/core/llm.cjs'),require.resolve('../src/core/jamo-reading.cjs'),require.resolve('../src/core/json-envelope.cjs')],hashes=Object.fromEntries(files.map(f=>[f,sha(f)]));
 fs.mkdirSync(root+'/source');for(const f of files)fs.copyFileSync(f,root+'/source/'+path.basename(f));const safe={...config};delete safe.apiKey;save('manifest',{hashes,settings:safe,order:ORDER,summary,input:INPUT,plan});
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('one_hour_deadline')),3600000),results=[];let fatal=null;
 try{for(const[index,mode]of ORDER.entries()){
  const name=String(index).padStart(2,'0')+'-'+mode,dir=root+'/'+name;fs.mkdirSync(dir);console.log(JSON.stringify({condition:name,phase:'quota_washout'}));await delay(61000,undefined,{signal:ctl.signal});
  const local=new AbortController(),timeout=setTimeout(()=>local.abort(Error('condition_deadline')),600000),start=performance.now(),rows=[],contract=(mode==='A'?operating:joint).contract();let response=null,error=null;
  const session=createSession(config,{contract,signal:AbortSignal.any([ctl.signal,local.signal]),deadlineAt:Date.now()+600000,log:e=>{if(e.event==='llm_request')assert.deepEqual(e.body,plans[mode][e.call_number-1].body);if(e.event==='llm_response')response=e.data;fs.appendFileSync(dir+'/trace.jsonl',JSON.stringify(e)+'\n');},onRequestState:e=>fs.appendFileSync(dir+'/lifecycle.jsonl',JSON.stringify(e)+'\n')});
  try{for(const[i,p]of plans[mode].entries()){
   for(const[f,h]of Object.entries(hashes))assert.equal(sha(f),h,'Frozen source changed');response=null;
   const decisions=await session.decide(p.candidates),call=session.calls.at(-1);assert(Number(call.rate_limit['x-ratelimit-limit-tokens'])>=60000&&Number(call.rate_limit['x-ratelimit-limit-requests'])>=60,'Provider limit changed');
   const parsed=parseEnvelope(response.choices[0].message.content),raw=Object.entries(parsed.decisions).map(([node_id,d])=>({node_id,...d}));assert.deepEqual(contract.validateModelDecisions(raw,p.candidates),decisions);
   rows.push({ordinal:i,group:p.group,raw,decisions,publication_acts:decisions.map(d=>({node_id:d.node_id,publication_act:d.publication_act})),numeric:mode==='J'?decisions.map(d=>({node_id:d.node_id,resolutions:d.numeric_resolutions})):null});
   fs.writeFileSync(dir+'/decisions.json',JSON.stringify(rows));fs.writeFileSync(dir+'/calls.json',JSON.stringify(session.calls));console.log(JSON.stringify({condition:name,done:i+1,total:plans[mode].length}));
  }}catch(e){error=String(e.message).replaceAll(config.apiKey,'[REDACTED]');}finally{clearTimeout(timeout);fs.writeFileSync(dir+'/calls.json',JSON.stringify(session.calls));}
  const result={condition:name,mode,status:error?'failed':'completed',error,wall_sec:(performance.now()-start)/1000,calls:session.calls.length,tokens:session.calls.reduce((s,c)=>s+(c.usage?.total_tokens||0),0)};fs.writeFileSync(dir+'/completion.json',JSON.stringify(result,null,2));results.push(result);save('results',results);if(error)throw Error(error);
 }}catch(e){fatal=String(e.message).replaceAll(config.apiKey,'[REDACTED]');}finally{clearTimeout(timer);save('completion',{status:fatal?'failed':'completed',error:fatal,conditions:results.length,no_automatic_retry:true});}if(fatal)process.exitCode=1;
}
module.exports={jobs,preflight};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});

