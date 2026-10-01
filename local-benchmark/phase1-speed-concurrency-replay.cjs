const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {estimateRequestTokens}=require('../agent/src/core/llm.cjs');
const root=path.resolve('.runtime/phase1-full-1790774023853'),out=path.resolve('.runtime/phase1-speed-concurrency-v1');
const calls=JSON.parse(fs.readFileSync(path.join(root,'scan/worker-run.json'))).calls;
const trace=fs.readFileSync(path.join(root,'scan/trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse),requests=trace.filter(x=>x.event==='llm_request');
assert.equal(calls.length,516);assert.equal(calls.length,requests.length);
const jobs=calls.map((c,i)=>{const r=requests[i];assert.equal(c.number,r.call_number);assert.equal(c.reserved_tokens,estimateRequestTokens(r.body));assert.equal(r.body.maxCompletionTokens,512);assert.equal(r.body.thinking.effort,'none');assert.equal(c.status,'ok');const ids=JSON.parse(r.body.messages[1].content).candidates.map(x=>x.node_id);assert(ids.length<=12);return {number:i+1,original_call_number:c.number,estimate:c.reserved_tokens,settled:c.usage.prompt_tokens+512,service:c.service_sec*1000,gap:i?Math.max(0,Date.parse(c.started_at)-calls[i-1].finished_at_ms):0,body_sha:crypto.createHash('sha256').update(JSON.stringify(r.body)).digest('hex'),ids};});
function simulate(concurrency,{overhead=true}={}){
 let now=0,next=0,nextRequest=0,complete=0,gate=null,waiting=[],active=[],reservations=[],rows=[],lastPrepare=0;
 function fill(){while(next<jobs.length&&waiting.length+active.length+(gate?1:0)<concurrency){const j=jobs[next++],ready=Math.max(now,lastPrepare)+(overhead?j.gap:0);lastPrepare=ready;waiting.push({j,ready});}}
 fill();
 while(complete<jobs.length){
  const done=active.filter(x=>x.end<=now+1e-6);active=active.filter(x=>x.end>now+1e-6);for(const x of done){x.res.tokens=x.j.settled;complete++;}
  if(complete===jobs.length)break;fill();if(!gate&&waiting.length){const x=waiting.shift();gate={...x,wake:Math.max(now,x.ready)};}
  if(gate&&gate.wake<=now+1e-6){reservations=reservations.filter(x=>x.at>now-61000);const used=reservations.reduce((n,x)=>n+x.tokens,0);if(now>=nextRequest&&used+gate.j.estimate<=58000){const res={at:now,tokens:gate.j.estimate};reservations.push(res);const x={j:gate.j,res,end:now+gate.j.service};active.push(x);rows.push({number:gate.j.number,sent_ms:now,finished_ms:x.end,ids:gate.j.ids,body_sha:gate.j.body_sha});nextRequest=now+1000;gate=null;continue;}gate.wake=now+1000;}
  const times=[...active.map(x=>x.end),...(gate?[gate.wake]:[])].filter(x=>x>now+1e-6);assert(times.length,'simulation deadlock');now=Math.min(...times);
 }
 const end=Math.max(...rows.map(x=>x.finished_ms));return {concurrency,overhead,calls:rows.length,total_sec:end/1000,completed_calls_25min:rows.filter(x=>x.finished_ms<=1500000).length,attempted_candidates_in_completed_calls_25min:rows.filter(x=>x.finished_ms<=1500000).reduce((s,x)=>s+x.ids.length,0),rows};
}
if(process.argv.includes('--sweep')){
 const target=path.resolve('.runtime/phase1-speed-sweep-simulation.json');assert(!fs.existsSync(target),'Preserve previous simulation');
 const results=[2,3,4,5].map(c=>({concurrency:c,with_recorded_gaps:simulate(c),no_gaps:simulate(c,{overhead:false})}));
 fs.writeFileSync(target,JSON.stringify({kind:'Historical-duration projection only, not live speed or F1',results},null,2));
 console.log(JSON.stringify(results.map(r=>({concurrency:r.concurrency,with_gaps_sec:r.with_recorded_gaps.total_sec,no_gaps_sec:r.no_gaps.total_sec})),null,2));process.exit(0);
}
const serial=simulate(1),parallel=simulate(2),pure1=simulate(1,{overhead:false}),pure2=simulate(2,{overhead:false});
assert.deepEqual(serial.rows.map(x=>x.body_sha),parallel.rows.map(x=>x.body_sha));assert.deepEqual(serial.rows.map(x=>x.ids),parallel.rows.map(x=>x.ids));
for(const r of [serial,parallel,pure1,pure2]){assert.equal(new Set(r.rows.map(x=>x.number)).size,516);for(let i=1;i<r.rows.length;i++)assert(r.rows[i].sent_ms-r.rows[i-1].sent_ms>=1000-1e-6);}
const result={kind:'clock simulation only; no API, F1 or operating adoption',source:root,settings:{tpm:58000,window_ms:61000,dispatch_ms:1000,output:512,max_calls:600},source_calls:jobs.length,source_candidates:jobs.reduce((s,j)=>s+j.ids.length,0),measured_span_sec:(calls.at(-1).finished_at_ms-Date.parse(calls[0].started_at))/1000,measured_service_sec:calls.reduce((s,c)=>s+c.service_sec,0),observed_gaps_sec:jobs.reduce((s,j)=>s+j.gap,0)/1000,serial,parallel,no_overhead_serial:pure1,no_overhead_parallel:pure2,gain_percent:100*(serial.total_sec-parallel.total_sec)/serial.total_sec,limitations:['Frozen historical response durations do not predict concurrent API latency','Observed work-preparation gaps treated as a single serialized preparation stage; actual collection dependencies absent','Source six incomplete response batches remain incomplete: completed calls are not completed judgments','25min candidate counts are scheduling projections, not newly measured recall','No new candidates beyond observed 516 requests']};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'replay.json'),JSON.stringify(result,null,2));
for(const key of ['serial','parallel','no_overhead_serial','no_overhead_parallel'])result[key]={...result[key],rows:undefined};console.log(JSON.stringify(result,null,2));

