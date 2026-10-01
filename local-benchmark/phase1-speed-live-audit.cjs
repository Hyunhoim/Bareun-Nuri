const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {materialize}=require('../agent/src/core/bounded-scan-store.cjs');
const out='.runtime/phase1-speed-live-v1',read=n=>JSON.parse(fs.readFileSync(path.join(out,n))),done=read('completion.json'),ev=read('evaluation.json'),plan=read('plan.json'),source=plan.source;
const raw=fs.readdirSync(out).filter(n=>/^[AB][12]-\d{3}\.json$/.test(n)).map(read),sum=key=>raw.reduce((s,r)=>s+(r.raw?JSON.parse(r.raw).result?.usage?.[key]||0:0),0);
assert.equal(raw.length,done.callCount);assert.equal(new Set(raw.map(r=>r.uuid)).size,raw.length);
for(const row of raw)assert.equal(row.body_sha256,plan.immutable_requests[row.index].sha256);
const data=materialize(source+'/scan',JSON.parse(fs.readFileSync(source+'/scan/checkpoint.json')).state),gold=new Map(fs.readFileSync(source+'/gold-frozen.jsonl','utf8').trim().split('\n').map(JSON.parse).map(g=>[g.page_path+'|'+g.id,g]));
const labels=new Map();for(const c of data.work){const g=gold.get(new URL(c.url).pathname+'|'+(c.location.match(/#n([a-f0-9]{14})(?![a-f0-9])/)?.[1]||''));if(g)labels.set(c.node_id,g.is_violation);}
const maps=new Map(ev.labels.map(r=>[r.name,r.labels]));
function compare(a,b){const A=maps.get(a),B=maps.get(b),changes=[],lost=[],gained=[],newfp=[],fixedfp=[];for(const id of new Set([...Object.keys(A),...Object.keys(B)])){if(A[id]!==B[id])changes.push(id);if(!labels.has(id))continue;const p=A[id]==='이용권유',q=B[id]==='이용권유';if(labels.get(id)){if(p&&!q)lost.push(id);if(!p&&q)gained.push(id);}else{if(!p&&q)newfp.push(id);if(p&&!q)fixedfp.push(id);}}return {from:a,to:b,changes,lost,gained,newfp,fixedfp};}
const pairs=[compare('A1','B1'),compare('A2','B2'),compare('A1','A2'),compare('B1','B2')];
const metrics=ev.results.map(r=>({...r,precision:r.tp+r.fp?r.tp/(r.tp+r.fp):null,recall:r.tp+r.fn?r.tp/(r.tp+r.fn):null,f1:2*r.tp+r.fp+r.fn?2*r.tp/(2*r.tp+r.fp+r.fn):null}));
const result={raw_calls:raw.length,raw_usage:{prompt_tokens:sum('promptTokens'),completion_tokens:sum('completionTokens'),total_tokens:sum('totalTokens')},ledger_token_match:sum('totalTokens')===done.totalTokens,unknown:raw.filter(r=>r.state==='unknown').length,invalid:raw.filter(r=>r.state==='invalid_response').length,quarantine:raw.filter(r=>r.state==='quarantine').length,unique_request_ids:true,immutable_body_signatures:true,metrics,pairs,timing:done.rounds.map(r=>({name:r.name,wall_sec:r.wall_sec,service_sec:r.service_sec,queue_sec:r.queue_sec}))};
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
