// Offline audit and predeclared selection; no API calls or production writes.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {materialize}=require('../agent/src/core/bounded-scan-store.cjs');
const repeat3=process.argv.includes('--repeat3');
const dir=repeat3?'.runtime/phase1-speed-repeat3-v1':'.runtime/phase1-speed-sweep-v1',read=f=>JSON.parse(fs.readFileSync(f)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const plan=read(dir+'/plan.json'),done=read(dir+'/completion.json'),ev=read(dir+'/evaluation.json'),bodies=read(dir+'/bodies.json');
assert(done.rounds.length<=plan.rounds.length);if(!done.fatal){assert.equal(done.rounds.length,plan.rounds.length);assert.equal(done.callCount,24*plan.rounds.length);}
const data=materialize(plan.source+'/scan',read(plan.source+'/scan/checkpoint.json').state);
const gold=new Map(fs.readFileSync(plan.source+'/gold-frozen.jsonl','utf8').trim().split('\n').map(JSON.parse).map(g=>[g.page_path+'|'+g.id,g]));
const labeled=new Map();for(const c of data.work){const g=gold.get(new URL(c.url).pathname+'|'+(c.location.match(/#n([a-f0-9]{14})(?![a-f0-9])/)?.[1]||''));if(g)labeled.set(c.node_id,g.is_violation);}
const maps=new Map(ev.labels.map(x=>[x.name,x.labels])),metrics=new Map(ev.results.map(x=>[x.name,x]));
function changes(a,b){const A=maps.get(a),B=maps.get(b),out={from:a,to:b,act_changes:[],binary_changes:[],lost_tp:[],gained_tp:[],new_fp:[],fixed_fp:[],unlabeled_binary_changes:[]};for(const id of new Set([...Object.keys(A),...Object.keys(B)])){if(A[id]!==B[id])out.act_changes.push(id);const p=A[id]==='이용권유',q=B[id]==='이용권유';if(p===q)continue;out.binary_changes.push(id);if(!labeled.has(id)){out.unlabeled_binary_changes.push(id);continue;}if(labeled.get(id))(p?out.lost_tp:out.gained_tp).push(id);else(q?out.new_fp:out.fixed_fp).push(id);}return out;}
const uuids=new Set(),checks=[];let tokens=0;
for(const round of done.rounds){
 assert.equal(round.rows.length,24);const sent=round.rows.slice().sort((a,b)=>a.reserved_at-b.reserved_at);assert.deepEqual(sent.map(r=>r.index),Array.from({length:24},(_,i)=>i));let peak=0,maxReserved=0;
 for(let i=0;i<sent.length;i++){
  const r=sent[i];assert(!uuids.has(r.uuid));uuids.add(r.uuid);assert.deepEqual(read(`${dir}/${round.name}-${String(r.index).padStart(3,'0')}.json`),r);
  assert.equal(r.body_sha256,sha(JSON.stringify(bodies[r.index])));assert.equal(r.body_sha256,plan.immutable_requests[r.index].sha256);
  assert.deepEqual(r.ids,JSON.parse(bodies[r.index].messages[1].content).candidates.map(c=>c.node_id));assert(['committed','quarantine','unknown'].includes(r.state));
  if(r.raw){assert.equal(r.http_status,200);tokens+=JSON.parse(r.raw).result.usage.totalTokens;assert.deepEqual(JSON.parse(r.raw).result.usage,r.usage);}else assert.equal(r.state,'unknown');
  if(i)assert(r.reserved_at-sent[i-1].reserved_at>=1000);
  const active=sent.slice(0,i+1).filter(x=>!x.responded_at||x.responded_at>r.sent_at).length;peak=Math.max(peak,active);assert(active<=round.concurrency);
  const reserved=sent.slice(0,i+1).filter(x=>x.reserved_at>r.reserved_at-61000).reduce((s,x)=>s+(x.responded_at<r.reserved_at?x.usage.promptTokens+512:plan.immutable_requests[x.index].estimated_tokens),0);maxReserved=Math.max(maxReserved,reserved);assert(reserved<=58000,'Quota reservation exceeded');
 }
 checks.push({name:round.name,wall_sec:round.wall_sec,service_sec:round.service_sec,queue_sec:round.queue_sec,peak_active:peak,max_reserved:maxReserved,unknown:round.rows.filter(r=>r.state==='unknown').length,quarantined_indices:round.rows.filter(r=>r.state==='quarantine').map(r=>r.index),metrics:metrics.get(round.name)});
}
assert.equal(tokens,done.totalTokens);assert.equal(uuids.size,done.callCount);
const pairwise=[2,3,4,5].map(k=>({concurrency:k,repeat:maps.has(`C${k}R2`)?changes(`C${k}R1`,`C${k}R2`):null,versus2:[1,2].filter(r=>maps.has(`C${k}R${r}`)&&maps.has(`C2R${r}`)).map(r=>changes(`C2R${r}`,`C${k}R${r}`))}));
const arms=pairwise.map(p=>{const rs=checks.filter(r=>r.name.startsWith('C'+p.concurrency+'R'));const base=checks.filter(r=>r.name.startsWith('C2R'));return {concurrency:p.concurrency,times:rs.map(r=>r.wall_sec),mean_sec:rs.length?rs.reduce((s,r)=>s+r.wall_sec,0)/rs.length:null,eligible:rs.length===2&&p.versus2.every(x=>!x.lost_tp.length&&!x.new_fp.length)&&rs.every((r,i)=>!r.unknown&&r.quarantined_indices.length<=base[i].quarantined_indices.length)};});
const fastest=Math.min(...arms.filter(a=>a.eligible).map(a=>a.mean_sec));let selected=arms.filter(a=>a.eligible&&a.mean_sec<=fastest*1.05).sort((a,b)=>a.concurrency-b.concurrency)[0];
if(repeat3){const a=arms.find(x=>x.concurrency===2),b=arms.find(x=>x.concurrency===3);const bothFaster=[1,2].every(i=>{const A=checks.find(r=>r.name===`C2R${i}`),B=checks.find(r=>r.name===`C3R${i}`);return A&&B&&B.wall_sec<A.wall_sec;});selected=b.eligible&&a.eligible&&bothFaster&&b.mean_sec<a.mean_sec*.95?b:a.eligible?a:undefined;}
const sourceHashes=read(plan.source+'/manifest.json').source_hashes;for(const[f,h]of Object.entries(sourceHashes))assert.equal(sha(fs.readFileSync(f)),h,'Operating source drift');
assert.equal(sha(fs.readFileSync('test-set-operating-phase2/manifest.json')),'b9aafb8e33ef6a458eb3b2df295cc9605042a00ceca9c20e2616e897ac9859c8');const phase2=read('test-set-operating-phase2/private/status.json');assert.equal(phase2.evaluation_runs,0);assert.equal(phase2.training_runs,0);
if(repeat3){const prior=read(dir+'/previous-unknown-preservation.json');assert.equal(prior.state,'unknown');assert.equal(sha(fs.readFileSync(prior.file)),prior.sha256,'Previous unknown request changed');}
const result={calls:uuids.size,confirmed_tokens:tokens,unknown_requests:checks.reduce((s,r)=>s+r.unknown,0),body_and_id_match:true,shared_quota_check:true,operating_sources_unchanged:Object.keys(sourceHashes).length,phase2_unchanged:true,checks,pairwise,arms,selected_concurrency:selected?.concurrency??null,retained_prior_candidate:selected?null:2,stop_reason:done.fatal,rule:repeat3?plan.selection_rule:'Lowest eligible concurrency within 5 percent of fastest mean; both repeats required. Stopped on unknown response: retain prior candidate without claiming a winner. Integration candidate only; 25-minute operational gate not measured.'};
fs.writeFileSync(dir+'/audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:checks.map(r=>({...r,metrics:{tp:r.metrics.tp,fp:r.metrics.fp,fn:r.metrics.fn,f1:r.metrics.f1}})),pairwise:undefined},null,2));
