// Fixed historical request ABBA diagnostic. No operating changes or automatic retries.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {setTimeout:delay}=require('node:timers/promises');
const {estimateRequestTokens}=require('../agent/src/core/llm.cjs');
const {parseEnvelope}=require('../agent/src/core/json-envelope.cjs');
const {contract}=require('../agent/src/core/judgment.cjs');
const {materialize}=require('../agent/src/core/bounded-scan-store.cjs');
const {cap384}=require('./payload-cap.cjs');
const source='.runtime/phase1-full-1790774023853',out='.runtime/payload-live-v1';
const read=p=>JSON.parse(fs.readFileSync(p)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const trace=fs.readFileSync(source+'/scan/trace.jsonl','utf8').trim().split('\n').map(JSON.parse),requests=trace.filter(x=>x.event==='llm_request'),responses=trace.filter(x=>x.event==='llm_response');
assert.equal(requests.length,516);assert.equal(responses.length,516);
const indices=Array.from({length:24},(_,i)=>Math.round(i*(requests.length-1)/23));
const jobs=indices.map(i=>{const body=requests[i].body,text=JSON.stringify(body),ids=JSON.parse(body.messages[1].content).candidates.map(c=>c.node_id);assert(ids.length<=12);assert.equal(body.maxCompletionTokens,512);return {source_index:i,body,text,sha256:sha(text),ids};});
function validate(content,ids){
 const v=parseEnvelope(content);assert(v&&!Array.isArray(v)&&Object.keys(v).length===1&&v.decisions&&!Array.isArray(v.decisions),'bad top-level');
 const got=Object.keys(v.decisions);assert(got.length>0&&got.every(id=>ids.includes(id)),'unknown or empty IDs');
 contract().validateModelDecisions(got.map(node_id=>({...v.decisions[node_id],node_id})),got.map(node_id=>({node_id,raw_text:''})));
 if(got.length<ids.length)return {status:'quarantine',missing:ids.filter(id=>!got.includes(id)),labels:{}};
 assert.deepEqual(got.slice().sort(),ids.slice().sort());return {status:'valid',labels:Object.fromEntries(got.map(id=>[id,v.decisions[id].publication_act]))};
}
const plan={source,selection:'24 evenly spaced request indices chosen without gold/error inspection',indices,rounds:[{name:'A1',concurrency:1},{name:'B1',concurrency:2},{name:'B2',concurrency:2},{name:'A2',concurrency:1}],budget:{max_calls:120,max_actual_tokens:500000,max_elapsed_sec:1200},settings:{output:512,none:true,tpm:58000,window_ms:61000,dispatch_interval_ms:1000,between_rounds_ms:61000},immutable_requests:jobs.map(j=>({source_index:j.source_index,sha256:j.sha256,ids:j.ids,estimated_tokens:estimateRequestTokens(j.body)})),adoption:'Diagnostic only. No production adoption without accuracy, request lifecycle and 25min integration validation.',created_at:new Date().toISOString()};
function save(name,value){const file=path.join(out,name);fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);}
plan.rounds=[{name:'A1',concurrency:3,output:512},{name:'B1',concurrency:3,output:384},{name:'B2',concurrency:3,output:384},{name:'A2',concurrency:3,output:512}];
plan.budget={max_calls:96,max_actual_tokens:500000,max_elapsed_sec:1200};
plan.settings.output=[512,384];
plan.execution='Fixed waves of three, not rolling replacement. Same input/body except output ceiling.';
plan.selection_rule='Both paired comparisons preserve labeled true positives, do not increase false positives, quarantines or response failures, and show mean time improvement greater than5percent with both pairs faster. Otherwise keep512. Diagnostic only.';
async function main(){
 assert(!fs.existsSync(out),'Refuse to overwrite/restart an existing run');fs.mkdirSync(out,{recursive:true});save('plan.json',plan);save('bodies.json',jobs.map(j=>j.body));
 process.loadEnvFile('agent/.env');const key=process.env.CLOVASTUDIO_API_KEY;assert(key,'Missing API key');
 const started=Date.now();let totalTokens=0,callCount=0,fatal=null;const all=[];
 for(const round of plan.rounds){
  if(all.length){console.log(JSON.stringify({event:'quota_cooldown',round:round.name}));await delay(60000);await delay(1000);}
  let nextSend=0,reservations=[],gate=Promise.resolve();const begun=Date.now(),rows=[];
  async function acquire(job){const previous=gate;let release;gate=new Promise(r=>release=r);await previous;try{while(true){assert(!fatal,'Other request failed');assert(Date.now()-started<plan.budget.max_elapsed_sec*1000,'Time budget');assert(totalTokens<plan.budget.max_actual_tokens,'Token budget');reservations=reservations.filter(r=>r.at>Date.now()-61000);if(Date.now()>=nextSend&&reservations.reduce((s,r)=>s+r.tokens,0)+estimateRequestTokens(job.body)<=58000)break;await delay(1000);}const r={at:Date.now(),tokens:estimateRequestTokens(job.body)};reservations.push(r);nextSend=r.at+1000;return r;}finally{release();}}
  async function worker(ix){if(fatal)return;const sourceJob=jobs[ix],body=round.output===384?cap384(sourceJob.body):structuredClone(sourceJob.body),text=JSON.stringify(body),job={...sourceJob,body,text,sha256:sha(text)},uuid=crypto.randomUUID(),file=`${round.name}-${String(ix).padStart(3,'0')}.json`,row={uuid,round:round.name,index:ix,source_index:job.source_index,body_sha256:job.sha256,ids:job.ids,max_output:round.output,body:job.body,state:'prepared',prepared_at:Date.now()};save(file,row);
   try{const reservation=await acquire(job);assert(++callCount<=plan.budget.max_calls,'Call budget');assert.equal(sha(job.text),job.sha256);row.reserved_at=reservation.at;row.sent_at=Date.now();row.state='sent';save(file,row);
    const response=await fetch('https://clovastudio.stream.ntruss.com/v3/chat-completions/HCX-007',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:job.text,signal:AbortSignal.timeout(90000)});
    const raw=await response.text();row.responded_at=Date.now();row.http_status=response.status;row.headers=Object.fromEntries([...response.headers].filter(([k])=>/ratelimit|retry-after/i.test(k)));row.raw=raw;row.state='responded';save(file,row);assert(response.ok,'HTTP rejected');const data=JSON.parse(raw);assert.equal(data.status.code,'20000');row.usage=data.result.usage;totalTokens+=row.usage.totalTokens;reservation.tokens=row.usage.promptTokens+round.output;assert.equal(data.result.finishReason,'stop');
    row.validation=validate(data.result.message.content,job.ids);row.state=row.validation.status==='valid'?'committed':'quarantine';row.service_sec=(row.responded_at-row.sent_at)/1000;row.queue_sec=(row.sent_at-row.prepared_at)/1000;save(file,row);rows.push(row);console.log(JSON.stringify({round:round.name,index:ix,state:row.state,service_sec:row.service_sec,tokens:totalTokens}));
   }catch(e){row.error=String(e.message).replaceAll(key,'[REDACTED]');row.error_code=e.cause?.code||e.code||null;row.error_cause=e.cause?.message?String(e.cause.message).replaceAll(key,'[REDACTED]'):null;row.state=row.state==='sent'?'unknown':row.state==='responded'?'invalid_response':'not_sent';save(file,row);rows.push(row);fatal=row.error;}
  }
  for(let start=0;start<jobs.length&&!fatal;start+=3)await Promise.all(jobs.slice(start,start+3).map((_,i)=>worker(start+i)));const summary={name:round.name,concurrency:round.concurrency,wall_sec:(Date.now()-begun)/1000,service_sec:rows.reduce((s,r)=>s+(r.service_sec||0),0),queue_sec:rows.reduce((s,r)=>s+(r.queue_sec||0),0),rows:rows.sort((a,b)=>a.index-b.index)};all.push(summary);save('progress.json',{callCount,totalTokens,fatal,rounds:all});if(fatal)break;
 }
 save('completion.json',{callCount,totalTokens,fatal,elapsed_sec:(Date.now()-started)/1000,rounds:all});score(all);if(fatal)process.exitCode=1;
}
function score(rounds){
 const cp=read(source+'/scan/checkpoint.json'),data=materialize(source+'/scan',cp.state),byId=new Map(data.work.map(c=>[c.node_id,c]));
 const gold=new Map(fs.readFileSync(source+'/gold-frozen.jsonl','utf8').trim().split('\n').map(JSON.parse).map(g=>[g.page_path+'|'+g.id,g]));
 const entries=jobs.flatMap(j=>j.ids.map(id=>{const c=byId.get(id);assert(c);const k=new URL(c.url).pathname+'|'+(c.location.match(/#n([a-f0-9]{14})(?![a-f0-9])/)?.[1]||'');return {id,gold:gold.get(k)||null};}));
 const original=jobs.map(j=>validate(responses[j.source_index].data.choices[0].message.content,j.ids));
 const sets=[{name:'historical',labels:Object.assign({},...original.map(v=>v.labels))},...rounds.map(r=>({name:r.name,labels:Object.assign({},...r.rows.map(x=>x.validation?.labels||{}))}))];
 const base=sets[0].labels,results=sets.map(s=>{let tp=0,fp=0,fn=0;const lost=[],gained=[],newfp=[],changes=[];for(const e of entries){const p=s.labels[e.id]==='이용권유',b=base[e.id]==='이용권유';if(s.labels[e.id]!==base[e.id])changes.push(e.id);if(!e.gold)continue;if(e.gold.is_violation){tp+=p?1:0;fn+=p?0:1;if(b&&!p)lost.push(e.id);if(!b&&p)gained.push(e.id);}else{fp+=p?1:0;if(!b&&p)newfp.push(e.id);}}return {name:s.name,tp,fp,fn,precision:tp/(tp+fp),recall:tp/(tp+fn),f1:2*tp/(2*tp+fp+fn),judged:Object.keys(s.labels).length,lost,gained,newfp,changes};});
 save('evaluation.json',{scope:'Observed Phase1 subset regression; exact labeled locations, no independent holdout; no technique or whole-site F1',selected_candidates:entries.length,labeled:entries.filter(e=>e.gold).length,ads:entries.filter(e=>e.gold?.is_violation).length,results,labels:sets});console.log(JSON.stringify({evaluation:results,selected_candidates:entries.length,labeled:entries.filter(e=>e.gold).length}));
}
if(process.argv.includes('--selftest')){assert.equal(validate(JSON.stringify({decisions:{a:{publication_act:'일반정보'}}}),['a']).status,'valid');assert.equal(validate(JSON.stringify({decisions:{a:{publication_act:'일반정보'}}}),['a','b']).status,'quarantine');assert.throws(()=>validate(JSON.stringify({decisions:{z:{publication_act:'일반정보'}}}),['a']));assert.throws(()=>validate(JSON.stringify({decisions:{a:{publication_act:'bad'}}}),['a']));assert.equal(new Set(indices).size,24);console.log('Fixed request selection and validation checks passed');}else if(process.argv.includes('--score'))score(read(out+'/completion.json').rounds);else if(process.argv.includes('--live'))main().catch(e=>{console.error(String(e.message));process.exitCode=1;});else console.log(JSON.stringify(plan,null,2));

