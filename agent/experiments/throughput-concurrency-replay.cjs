const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {estimateRequestTokens}=require('../src/core/llm.cjs');
const root=path.resolve('.runtime/scale-large-live-v1'),out=path.resolve('.runtime/throughput-concurrency-v1');
const calls=JSON.parse(fs.readFileSync(path.join(root,'calls.json'))).filter(x=>x.status==='ok');
const trace=fs.readFileSync(path.join(root,'scan/trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse),requests=trace.filter(x=>x.event==='llm_request');
assert.equal(calls.length,requests.length);
const jobs=calls.map((c,i)=>{const r=requests[i];assert.equal(c.number,r.call_number);assert.equal(c.reserved_tokens,estimateRequestTokens(r.body));assert.equal(r.body.maxCompletionTokens,512);const ids=JSON.parse(r.body.messages[1].content).candidates.map(x=>x.node_id);assert(ids.length<=4);return {number:c.number,estimate:c.reserved_tokens,settled:c.usage.prompt_tokens+512,service:c.service_sec*1000,gap:i?Math.max(0,Date.parse(c.started_at)-calls[i-1].finished_at_ms):0,body_sha:crypto.createHash('sha256').update(JSON.stringify(r.body)).digest('hex'),ids};});
function simulate(concurrency,{overhead=true,poll=true}={}){
 let now=0,next=0,nextRequest=0,complete=0,gate=null,waiting=[],active=[],reservations=[],rows=[],lastPrepare=0;
 function fill(){while(next<jobs.length&&waiting.length+active.length+(gate?1:0)<concurrency){const j=jobs[next++],ready=Math.max(now,lastPrepare)+(overhead?j.gap:0);lastPrepare=ready;waiting.push({j,ready});}}
 fill();
 while(complete<jobs.length){
  const done=active.filter(x=>x.end<=now+1e-6);active=active.filter(x=>x.end>now+1e-6);for(const x of done){x.res.tokens=x.j.settled;complete++;}
  if(complete===jobs.length)break;fill();if(!gate&&waiting.length){const x=waiting.shift();gate={...x,wake:Math.max(now,x.ready)};}
  if(gate&&gate.wake<=now+1e-6){reservations=reservations.filter(x=>x.at>now-61000);const used=reservations.reduce((n,x)=>n+x.tokens,0);if(now>=nextRequest&&used+gate.j.estimate<=52000){const res={at:now,tokens:gate.j.estimate};reservations.push(res);const x={j:gate.j,res,end:now+gate.j.service};active.push(x);rows.push({number:gate.j.number,sent_ms:now,finished_ms:x.end,ids:gate.j.ids,body_sha:gate.j.body_sha});nextRequest=now+1000;gate=null;continue;}gate.wake=now+(poll?1000:Math.max(1,Math.min(nextRequest>now?nextRequest-now:Infinity,...reservations.map(r=>r.at+61000-now),...active.map(a=>a.end-now))));}
  const times=[...active.map(x=>x.end),...(gate?[gate.wake]:[])].filter(x=>x>now+1e-6);assert(times.length,'simulation deadlock');now=Math.min(...times);
 }
 const end=Math.max(...rows.map(x=>x.finished_ms));return {concurrency,overhead,poll,calls:rows.length,total_sec:end/1000,completed_25min:rows.filter(x=>x.finished_ms<=1500000).length,rows};
}
const serial=simulate(1),parallel=simulate(2),pure1=simulate(1,{overhead:false}),pure2=simulate(2,{overhead:false});
assert.deepEqual(serial.rows.map(x=>x.body_sha),parallel.rows.map(x=>x.body_sha));assert.deepEqual(serial.rows.map(x=>x.ids),parallel.rows.map(x=>x.ids));
const result={kind:'clock replay only; service durations frozen, no API and no new F1',source:root,source_call_count:jobs.length,settings:{tpm:52000,window_ms:61000,dispatch_ms:1000,output:512,max_calls:600},measured_span_sec:(calls.at(-1).finished_at_ms-Date.parse(calls[0].started_at))/1000,serial,parallel,no_overhead_serial:pure1,no_overhead_parallel:pure2,gain_percent:100*(serial.total_sec-parallel.total_sec)/serial.total_sec,same_request_sequence:true,limitations:['No new requests beyond observed 467','Frozen service durations cannot establish concurrency API latency','FIFO and page work release dependencies not implemented','Input batches fixed; actual scheduler concurrent changes require separate test']};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'replay.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,serial:{...serial,rows:undefined},parallel:{...parallel,rows:undefined},no_overhead_serial:{...pure1,rows:undefined},no_overhead_parallel:{...pure2,rows:undefined}},null,2));

