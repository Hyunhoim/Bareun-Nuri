// One research-only tail pass. Original checkpoints and committed decisions stay immutable.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
const {createStore,materialize}=require('../agent/src/core/bounded-scan-store.cjs'),{digest}=require('../agent/src/core/scan.cjs');
const {createSession,configFromEnv}=require('../agent/src/core/llm.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{createAntiSpoof}=require('../agent/src/core/antispoof.cjs');
const {score}=require('./phase1-operating-evaluate.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function batches(dir,s){
 assert(!s.inflight,'Unconfirmed request must not be retried');assert.equal(s.pending.length,0,'Finish ordinary crawl first');assert(s.pages.every(p=>p.offset===p.work),'Finish ordinary judgments first');
 const store=createStore(dir),out=[];
 for(const p of s.pages){const {work}=store.load(p),by=new Map(work.map(c=>[c.node_id,c]));for(const ref of p.batches){const b=store.read(ref);if(!b.quarantine)continue;
 assert.deepEqual(b.ids,b.quarantine.requested_ids);assert.equal(b.decisions.length,0);const items=b.ids.map(id=>by.get(id));assert(items.every(Boolean));out.push({source:ref,items,original:b.quarantine});}store.evict(p.id);}
 assert.equal(new Set(out.flatMap(b=>b.items.map(c=>c.node_id))).size,out.reduce((n,b)=>n+b.items.length,0));return out;
}
async function onePass(pending,judge,save,deadline){
 const results=[];let stopped=null;
 for(const b of pending){if(Date.now()>=deadline){stopped='time_budget';break;}if(judge.calls.length>=60){stopped='call_budget';break;}
 const r={source:b.source,ids:b.items.map(c=>c.node_id),status:'prepared',decisions:[]};results.push(r);save(results);
 try{r.decisions=await judge.decide(b.items);r.status='complete';}
 catch(e){r.status=e.code==='confirmed_incomplete_decisions'?'quarantined_again':'failed';r.error=e.message;r.quarantine=e.quarantine;save(results);if(r.status==='failed'){stopped='failure_no_retry';break;}}
 save(results);
 }return {results,stopped};
}
async function main(dir){
 const job=path.join(dir,'scan'),cpFile=path.join(job,'checkpoint.json'),original=fs.readFileSync(cpFile),cp=JSON.parse(original);assert.equal(digest(cp.state),cp.sha256);
 const pins=read(path.join(dir,'manifest.json')).source_hashes;for(const[f,h]of Object.entries(pins))assert.equal(sha(f),h,'Source drift');
 const pending=batches(job,cp.state),out=path.join(dir,'quarantine-tail');fs.mkdirSync(out); // Existing output forbids accidental second dispatch.
 const save=(name,value)=>{const f=path.join(out,name+'.json');fs.writeFileSync(f+'.tmp',JSON.stringify(value,null,2));fs.renameSync(f+'.tmp',f);};
 const started=Date.now(),deadline=started+600000,controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('tail_time_budget')),600000);
 const env={...process.env,...parseEnv(fs.readFileSync('agent/.env','utf8'))},config={...configFromEnv('hcx',env),maxTokens:512,timeoutMs:180000,maxCalls:60,minIntervalMs:1000,tokensPerMinute:58000,retryRateLimit:true,retryTransientTransport:false,seed:42};
 save('plan',{started_at:new Date(started).toISOString(),source_checkpoint_sha256:sha(cpFile),batches:pending.length,items:pending.reduce((n,b)=>n+b.items.length,0),max_calls:60,max_seconds:600,settings:{...config,apiKey:undefined}});
 const append=(name,event)=>fs.appendFileSync(path.join(out,name+'.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n');
 const judge=createSession(config,{signal:controller.signal,deadlineAt:deadline,contract:contract(),onRequestState:e=>append('lifecycle',e),log:e=>append('trace',e)}),anti=createAntiSpoof({python:env.ANTISPOOF_PYTHON,signal:controller.signal,deadlineAt:deadline});
 const decide=judge.decide.bind(judge);judge.decide=async items=>anti.annotate(items,await decide(items));let outcome;
 try{outcome=await onePass(pending,judge,results=>{save('attempts',results);save('calls',judge.calls);},deadline);}
 finally{clearTimeout(timer);anti.close();save('calls',judge.calls);assert(fs.readFileSync(cpFile).equals(original),'Original checkpoint changed');for(const[f,h]of Object.entries(pins))assert.equal(sha(f),h);}
 const extra=outcome.results.flatMap(r=>r.decisions),base=materialize(job,cp.state).decisions;assert(extra.every(d=>!base.some(x=>x.node_id===d.node_id)));
 const gold=fs.readFileSync(path.join(dir,'gold-frozen.jsonl'),'utf8').trim().split('\n').map(JSON.parse),evaluation=score(job,cp.state,gold,extra);
 save('evaluation',evaluation);const report={wall_sec:(Date.now()-started)/1000,original_unchanged:true,ordinary_status:cp.state.status,ordinary_reason:cp.state.reason,batches:pending.length,attempted:outcome.results.length,recovered_candidates:extra.length,unresolved_candidates:pending.reduce((n,b)=>n+b.items.length,0)-extra.length,stopped:outcome.stopped,calls:judge.calls.length,tokens:judge.calls.reduce((n,c)=>n+(c.usage?.total_tokens||0),0),overall:evaluation.overall,conditional_technique:evaluation.technique_given_correct_ad.technique_pairs};save('report',report);console.log(JSON.stringify(report));
}
async function check(){let count=0;const pending=[{source:{file:'one'},items:[{node_id:'a'}]},{source:{file:'two'},items:[{node_id:'b'}]}],judge={calls:[],async decide(items){this.calls.push({});if(++count===1)throw Object.assign(Error('partial'),{code:'confirmed_incomplete_decisions'});return items;}};const r=await onePass(pending,judge,()=>{},Date.now()+1000);assert.equal(count,2);assert.equal(r.results[0].decisions.length,0);assert.equal(r.results[1].status,'complete');assert.equal(r.stopped,null);
 const failed=await onePass(pending,{calls:[],async decide(){throw Error('transport_unknown')}},()=>{},Date.now()+1000);assert.equal(failed.results.length,1);assert.equal(failed.stopped,'failure_no_retry');
 const expired=await onePass(pending,judge,()=>{},0);assert.equal(expired.results.length,0);assert.equal(expired.stopped,'time_budget');
 assert.throws(()=>batches('',{inflight:{},pending:[],pages:[]}));assert.throws(()=>batches('',{inflight:null,pending:['url'],pages:[]}));assert.throws(()=>batches('',{inflight:null,pending:[],pages:[{offset:0,work:1}]}));console.log('Tail pass checks passed; no API');}
(process.argv.includes('--selftest')?check():main(path.resolve(process.argv[2]))).catch(e=>{console.error(e.message);process.exitCode=1;});
