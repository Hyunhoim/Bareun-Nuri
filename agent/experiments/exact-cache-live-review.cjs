// Read-only audit of a completed batch-order experiment; no API or clone loading.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {splitCandidate}=require('../src/core/scan.cjs'),{contract}=require('../src/core/judgment.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function stable(x){return JSON.stringify(order(x));}function order(x){return Array.isArray(x)?x.map(order):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,order(x[k])])):x;}
function dataset(root){const candidates=new Map(),work=new Map(),observations=new Map();for(const f of fs.readdirSync(path.join(root,'snapshots'))){const s=read(path.join(root,'snapshots',f));for(const c of s.candidates){candidates.set(c.node_id,c);for(const w of splitCandidate(c))work.set(w.node_id,w);}for(const o of s.technique_observations)observations.set(o.node_id,o);}return {candidates,work,observations};}
function trace(root){return fs.readFileSync(path.join(root,'scan/trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse);}
function main(){
 const base=path.resolve('.runtime/jamo-context-live-c-v1'),root=path.resolve('.runtime/batch-order-live-v1');assert(fs.existsSync(path.join(root,'completion.json')),'Wait for completion; no partial evaluation');
 const completion=read(path.join(root,'completion.json')),manifest=read(path.join(root,'manifest.json')),oldManifest=read(path.join(base,'manifest.json'));assert(completion.source_verified);assert(read(path.join(root,'source-after.json')).verified);
 const sourceFailures=[];for(const [f,h]of Object.entries(manifest.hashes)){const source=path.join(root,'source-archive',f);if(!fs.existsSync(source)||sha(fs.readFileSync(source))!==h)sourceFailures.push(f);}assert.deepEqual(sourceFailures,[]);
 assert.deepEqual(manifest.settings,oldManifest.settings);assert.equal(manifest.limits.seconds,1500);assert.equal(manifest.batch,4);assert.equal(manifest.concurrency,1);
 const sourceNames=Object.keys(manifest.hashes);assert(sourceNames.some(f=>f.replaceAll('\\','/').endsWith('batch-order-core-v1/core.cjs')));assert(sourceNames.some(f=>f.replaceAll('\\','/').endsWith('batch-order-core-v1/store.cjs')));
 const a=dataset(base),b=dataset(root);let common=0;for(const [id,c]of b.candidates)if(a.candidates.has(id)){assert.deepEqual(c,a.candidates.get(id),'Candidate evidence changed '+id);assert.deepEqual(b.observations.get(id),a.observations.get(id),'Observation changed '+id);common++;}
 const oldReq=trace(base).filter(e=>e.event==='llm_request'),oldBatches=new Map(oldReq.map(e=>[JSON.parse(e.body.messages[1].content).candidates.map(c=>c.node_id).join('|'),e.body]));
 const events=trace(root),responses=new Map(events.filter(e=>e.event==='llm_response').map(e=>[e.call_number,e])),requests=events.filter(e=>e.event==='llm_request'),state=read(path.join(root,'scan/checkpoint.json')).state,committed=new Map();
 for(const p of state.pages)for(const ref of p.batches)for(const d of read(path.join(root,'scan',ref.file)).decisions){assert(!committed.has(d.node_id));committed.set(d.node_id,d);}
 let commonBatches=0,targets=0,tokens=0,maxOutputTokens=0,fenced=0;const acts=[];
 for(const req of requests){const body=req.body,cs=JSON.parse(body.messages[1].content).candidates;assert.equal(body.maxCompletionTokens,512);assert.equal(body.temperature,0);assert.equal(body.seed,42);assert(cs.length>0&&cs.length<=4);const key=cs.map(c=>c.node_id).join('|');if(oldBatches.has(key)){assert.equal(stable(body),stable(oldBatches.get(key)),'Common batch request changed');commonBatches++;}
  const response=responses.get(req.call_number);assert(response,'Unconfirmed request');const choice=response.data.choices[0];assert.equal(choice.finishReason||choice.finish_reason,'stop');let content=choice.message.content.trim();if(content.startsWith('```'))fenced++;content=content.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/,'$1');const parsed=JSON.parse(content),items=cs.map(c=>{assert(b.work.has(c.node_id));return b.work.get(c.node_id);});
  const raw=Object.entries(parsed.decisions).map(([node_id,value])=>({node_id,...value}));const decisions=contract().validateModelDecisions(raw,items);assert.equal(decisions.length,items.length);
  for(const d of decisions){assert(committed.has(d.node_id));assert.deepEqual(d,committed.get(d.node_id),'Saved decision differs from response');acts.push({id:d.node_id,ad:d.is_violation});}
  targets+=cs.length;const usage=response.data.usage;tokens+=usage.totalTokens??usage.total_tokens;maxOutputTokens=Math.max(maxOutputTokens,usage.completionTokens??usage.completion_tokens??0);
 }
 assert.equal(targets,committed.size);assert.equal(responses.size,requests.length);assert.equal(state.inflight,null);
 const calls=read(path.join(root,'calls.json'));assert.equal(calls.filter(c=>c.status==='ok').length,requests.length);
 const result={requests:requests.length,targets,common_batches_body_identical:commonBatches,new_batches:requests.length-commonBatches,common_raw_and_observations_identical:common,source_archives_verified:sourceNames.length,cloned_core_and_store_archived:true,confirmed_tokens:tokens,max_output_tokens:maxOutputTokens,fenced_responses_accepted:fenced,unknown_requests:0,saved_decisions_match_raw:true,api_calls:0,scope:'Independent saved-artifact audit. Does not infer new F1 or speed.'};
 const file=path.resolve('.runtime/exact-cache-v3/live-review.json');assert(!fs.existsSync(file));fs.writeFileSync(file,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
if(require.main===module)main();
