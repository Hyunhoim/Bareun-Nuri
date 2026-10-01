// Bounded diagnostic: reuse contracts/transport, never feed evaluation labels to the model.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseEnv}=require('node:util'),{setTimeout:delay}=require('node:timers/promises');
const {createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs');
const direct=require('./direct-contract.cjs'),{atomic,acquireLock}=require('../src/core/scan.cjs');
const contract={...direct,promptJson:true,formatRepair:false};
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ROOT='.runtime/reasoning-navigation-v1',EFFORTS=['none','medium'],REPEATS=3;
const settings={provider:'hcx',model:'HCX-007',temperature:0,seed:42,maxTokens:10240,timeoutMs:180000,maxCalls:200,minIntervalMs:0,retryRateLimit:false,retryTransientTransport:false};
const inputFile='.runtime/stage2-direct/single63/evidence.json',goldFile='.runtime/stage2-routing/diagnostic-labels.json';
function candidate(c){const local={...c,node_id:'1'};return {...local,source_ids:direct.initialEvidence(local).source_ids};}
async function requestBody(c,effort){
 const sentinel=Error('capture only');let body;
 const session=createSession({...settings,reasoningEffort:effort},{contract,log:e=>{if(e.event==='llm_request'){body=e.body;throw sentinel;}}});
 try{await session.decide([candidate(c)]);throw Error('Capture unexpectedly returned');}catch(e){if(e!==sentinel)throw e;}return body;
}
async function prepare(root=ROOT){
 assert(!fs.existsSync(root),'Use a fresh run directory');fs.mkdirSync(root,{recursive:true});
 const kinds=['context-dependent','context-pair-normal','direct-ad','quotation','metadata-next-to-ad','insufficient'];
 const labels=read(goldFile).filter(g=>kinds.includes(g.kind)),all=read(inputFile).candidates;
 assert.equal(labels.length,30);assert.equal(labels.filter(g=>g.is_ad).length,12);assert.equal(labels.filter(g=>g.expected_review).length,2);
 const cases=labels.map(g=>{const c=all.find(c=>c.node_id===g.node_id);assert(c);return c;});
 atomic(root,'cases.json',cases);atomic(root,'labels.json',labels);atomic(root,'settings.json',{...settings,efforts:EFFORTS,repeats:REPEATS,request_limit:200,token_limit:600000,seconds:3600});
 const bodies=[];for(const c of cases){const a=await requestBody(c,'none'),b=await requestBody(c,'medium');assert.deepEqual({...a,thinking:undefined},{...b,thinking:undefined});assert(!a.responseFormat&&!b.responseFormat);bodies.push({id:c.node_id,body:a,estimate:estimateRequestTokens(a)});}
 atomic(root,'request-templates.json',bodies);
 const files=[__filename,'docs/reasoning-navigation-plan.md','agent/src/core/llm.cjs','agent/experiments/direct-contract.cjs','agent/experiments/intent-contract.cjs','agent/experiments/context-contract.cjs',inputFile,goldFile,...['cases.json','labels.json','settings.json','request-templates.json'].map(f=>path.join(root,f))];
 atomic(root,'manifest.json',Object.fromEntries(files.map(f=>[f,sha(f)])));console.log(JSON.stringify({prepared:root,cases:cases.length,requests:cases.length*EFFORTS.length*REPEATS,largest_estimate:Math.max(...bodies.map(x=>x.estimate))}));
}
function unchanged(root){for(const [f,h]of Object.entries(read(path.join(root,'manifest.json'))))assert.equal(sha(f),h,'Frozen file changed: '+f);}
async function live(root=ROOT){
 unchanged(root);assert(!fs.existsSync(path.join(root,'results.json')),'No automatic replay of a started run');
 const lock=acquireLock(root,'reasoning.lock'),begin=performance.now(),ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('one-hour budget')),3600000);
 const env={...process.env,...parseEnv(fs.readFileSync('agent/.env','utf8'))},base={...configFromEnv('hcx',env),...settings};
 const cases=read(path.join(root,'cases.json')),templates=read(path.join(root,'request-templates.json'));
 const results=[],ledger=[],sessions={};let active,consecutive=0,status='running',reason=null;
 const save=()=>{atomic(root,'results.json',results);atomic(root,'budget.json',{status,reason,elapsed_sec:(performance.now()-begin)/1000,requests:ledger});};
 for(const effort of EFFORTS)sessions[effort]=createSession({...base,reasoningEffort:effort},{signal:ctl.signal,contract,log:e=>{
  if(e.event==='llm_request'){
   const expected={...templates.find(t=>t.id===active.id).body,thinking:{effort}};assert.deepEqual(e.body,expected);
   active.sent_at=Date.now();active.body_hash=crypto.createHash('sha256').update(JSON.stringify(e.body)).digest('hex');
   fs.appendFileSync(path.join(root,'trace.jsonl'),JSON.stringify({repeat:active.repeat,id:active.id,effort,...e})+'\n');save();
  } else if(e.event==='llm_response'){
   active.usage=e.data.usage;active.tokens=e.data.usage?.total_tokens??null;active.finish_reason=e.data.choices?.[0]?.finish_reason;
   fs.appendFileSync(path.join(root,'trace.jsonl'),JSON.stringify({repeat:active.repeat,id:active.id,effort,...e})+'\n');save();
  }
 }});
 save();
 try{
  for(let repeat=0;repeat<REPEATS;repeat++)for(let i=0;i<cases.length;i++)for(const effort of (repeat+i)%2?[...EFFORTS].reverse():EFFORTS){
   ctl.signal.throwIfAborted();unchanged(root);const c=cases[i],estimate=templates[i].estimate;
   assert(ledger.length<200&&ledger.reduce((n,r)=>n+(r.tokens??r.reserved),0)+estimate<=600000,'Shared request/token budget exhausted');
   const queued=performance.now();
   while(true){const now=Date.now(),recent=ledger.filter(r=>r.sent_at&&r.sent_at>now-61000);const used=recent.reduce((n,r)=>n+r.reserved,0);
    if(used+estimate<=52000&&now-(ledger.at(-1)?.sent_at||0)>=1000)break;await delay(1000,undefined,{signal:ctl.signal});}
   active={repeat:repeat+1,id:c.node_id,effort,reserved:estimate,tokens:null,status:'inflight',queue_wait_sec:(performance.now()-queued)/1000};ledger.push(active);save();
   const started=performance.now(),session=sessions[effort];
   try{const [decision]=await session.decide([candidate(c)]);active.status='ok';consecutive=0;results.push({repeat:repeat+1,id:c.node_id,effort,decision:{...decision,node_id:c.node_id}});}
   catch(e){active.status='failed';active.error=String(e.message).replaceAll(base.apiKey,'[REDACTED]');consecutive++;results.push({repeat:repeat+1,id:c.node_id,effort,error:active.error});}
   active.elapsed_sec=(performance.now()-started)/1000;active.service_sec=session.calls.at(-1)?.service_sec??null;active.http_status=session.calls.at(-1)?.http_status??null;
   save();console.log(JSON.stringify({done:ledger.length,total:cases.length*2*REPEATS,repeat:repeat+1,effort,status:active.status,seconds:+active.elapsed_sec.toFixed(2),tokens:active.tokens}));
   if(consecutive>=3||[401,403,429].includes(active.http_status))throw Error('Failure stop rule');
  }
  status='completed';unchanged(root);
 }catch(e){status='partial';reason=String(e.message).replaceAll(base.apiKey,'[REDACTED]');console.log(JSON.stringify({stopped:reason}));}
 finally{clearTimeout(timer);save();fs.unlinkSync(lock);}return report(root);
}
function classification(r){return r?.error||!r?.decision?'error':r.decision.needs_review?'review':r.decision.is_violation?'ad':'normal';}
function metrics(rows,labels){
 let tp=0,fp=0,fn=0,correct=0,reviewCorrect=0,normalReview=0,failures=0;const groups={};
 for(const g of labels){const r=rows.find(r=>r.id===g.node_id),pred=classification(r),expected=g.expected_review?'review':g.is_ad?'ad':'normal';
  failures+=Number(pred==='error');correct+=Number(pred===expected);if(g.expected_review)reviewCorrect+=Number(pred==='review');else{tp+=Number(g.is_ad&&pred==='ad');fp+=Number(!g.is_ad&&pred==='ad');fn+=Number(g.is_ad&&pred!=='ad');normalReview+=Number(!g.is_ad&&pred==='review');}
  const group=groups[g.kind]??={n:0,correct:0};group.n++;group.correct+=Number(pred===expected);
 }
 const precision=tp+fp?tp/(tp+fp):0,recall=tp+fn?tp/(tp+fn):0;
 return {n:labels.length,tp,fp,fn,precision,recall,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):0,correct,accuracy:correct/labels.length,reviewCorrect,normalReview,failures,groups};
}
function report(root=ROOT){
 unchanged(root);const labels=read(path.join(root,'labels.json')),results=read(path.join(root,'results.json')),budget=read(path.join(root,'budget.json')),summary={status:budget.status,reason:budget.reason,efforts:{},paired:[]};
 for(const effort of EFFORTS){const rs=results.filter(r=>r.effort===effort),calls=budget.requests.filter(r=>r.effort===effort);const repeats=Array.from({length:REPEATS},(_,i)=>metrics(rs.filter(r=>r.repeat===i+1),labels));
  const changed=labels.filter(g=>new Set(rs.filter(r=>r.id===g.node_id).map(classification)).size>1).map(g=>g.node_id);
  summary.efforts[effort]={repeats,changed,change_rate:changed.length/labels.length,calls:calls.length,tokens:calls.reduce((n,c)=>n+(c.tokens||0),0),unconfirmed:calls.filter(c=>c.tokens===null).length,
   service_sec:calls.reduce((n,c)=>n+(c.service_sec||0),0),queue_sec:calls.reduce((n,c)=>n+c.queue_wait_sec,0),truncated:calls.filter(c=>c.finish_reason==='length').length};
 }
 for(let i=1;i<=REPEATS;i++){const a=results.filter(r=>r.effort==='none'&&r.repeat===i),b=results.filter(r=>r.effort==='medium'&&r.repeat===i);
  summary.paired.push({repeat:i,lost:labels.filter(g=>g.is_ad&&classification(a.find(r=>r.id===g.node_id))==='ad'&&classification(b.find(r=>r.id===g.node_id))!=='ad').map(g=>g.node_id),changes:labels.filter(g=>classification(a.find(r=>r.id===g.node_id))!==classification(b.find(r=>r.id===g.node_id))).map(g=>({id:g.node_id,kind:g.kind,expected:g.expected_review?'review':g.is_ad?'ad':'normal',none:classification(a.find(r=>r.id===g.node_id)),medium:classification(b.find(r=>r.id===g.node_id))}))});
 }
 const a=summary.efforts.none,b=summary.efforts.medium,avg=x=>x.repeats.reduce((n,r)=>n+r.accuracy,0)/REPEATS;
 summary.gates={complete:budget.status==='completed'&&results.length===labels.length*2*REPEATS,retained:summary.paired.every(r=>!r.lost.length),fp:b.repeats.every((r,i)=>r.fp<=a.repeats[i].fp),normal_review:b.repeats.every((r,i)=>r.normalReview<=a.repeats[i].normalReview),insufficient:b.repeats.every((r,i)=>r.reviewCorrect>=a.repeats[i].reviewCorrect),gain:avg(b)-avg(a)>=.05,repeat_gain:b.repeats.filter((r,i)=>r.correct>a.repeats[i].correct).length>=2,stable:b.change_rate<=a.change_rate,valid:!a.truncated&&!b.truncated&&[...a.repeats,...b.repeats].every(r=>!r.failures),cost:b.tokens<=a.tokens*4&&b.service_sec<=a.service_sec*4};
 summary.pass=Object.values(summary.gates).every(Boolean);summary.elapsed_sec=budget.elapsed_sec;atomic(root,'reasoning-summary.json',summary);console.log(JSON.stringify({summary:root+'/reasoning-summary.json',pass:summary.pass,gates:summary.gates}));return summary;
}
async function selftest(){
 const c={node_id:'secret-id',raw_text:'접수 안내',normalized_text:'접수 안내',frame_urls:[],links:[],context_evidence:{units:[{relation:'before',text:'도서관 독서 교실'},{relation:'target'}]}};
 const a=await requestBody(c,'none'),b=await requestBody(c,'medium');assert.deepEqual({...a,thinking:null},{...b,thinking:null});assert(!a.responseFormat);assert.deepEqual(JSON.parse(a.messages[1].content).candidates[0].source_ids,['target','context_0']);
 const original=global.fetch;try{let calls=0;global.fetch=async()=>{calls++;return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:'stop',message:{content:'broken'},usage:{promptTokens:1,completionTokens:1,totalTokens:2}}}),{status:200});};
  const s=createSession({...settings,apiKey:'test',endpoint:'http://127.0.0.1',reasoningEffort:'none'},{contract});await assert.rejects(s.decide([candidate(c)]));assert.equal(calls,1);
 }finally{global.fetch=original;}
 const gold=[{node_id:'x',is_ad:true},{node_id:'y',is_ad:false},{node_id:'z',expected_review:true}];const m=metrics([{id:'x',decision:{needs_review:true}},{id:'y',decision:{is_violation:true}},{id:'z',decision:{needs_review:true}}],gold);assert.equal(m.fn,1);assert.equal(m.fp,1);assert.equal(m.reviewCorrect,1);
 console.log('PASS common requests, source IDs, first-pass failure accounting, no repair, conservative metrics');
}
if(require.main===module){const [action,root=ROOT]=process.argv.slice(2);Promise.resolve().then(()=>({prepare,live,report,test:selftest}[action]||(()=>{throw Error('prepare|live|report|test');}))(root)).catch(e=>{console.error(e.stack);process.exitCode=1;});}
module.exports={metrics,requestBody,classification};
