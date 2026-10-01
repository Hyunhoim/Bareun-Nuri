// Offline audit only: full request and source evidence, never production cache.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const stable=x=>JSON.stringify(sort(x));
function sort(x){return Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;}
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function main(){
 const source=path.resolve('.runtime/jamo-context-live-c-v1'),out=path.resolve('.runtime/exact-cache-v3');
 assert(!fs.existsSync(out),'Fresh output required');fs.mkdirSync(out,{recursive:true});
 const plan={baseline:'operational C saved actual requests',hypothesis:'Exactly identical requests with identical source evidence may be reused without rebuilding batches.',criteria:'Only previously confirmed identical whole requests and full source evidence qualify; node IDs, order, source ownership, styles, observations, model and settings remain part of the key. No remapping or text-only reuse. If zero hits, stop without paid expansion.',limits:{apiCalls:0},known_limit:'One observed replica run; not an independent site or proof of universal zero cache benefit.'};
 fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify(plan,null,2));
 const manifest=read(path.join(source,'manifest.json')),files=[path.join(source,'manifest.json'),path.join(source,'scan/trace.jsonl'),__filename];
 const candidates=new Map(),observations=new Map(),sourceIds=new Map();
 const splitFile=path.join(source,'source-archive/agent/src/core/scan.cjs'),currentSplit=require.resolve('../src/core/scan.cjs');files.push(splitFile,currentSplit);assert.equal(sha(fs.readFileSync(splitFile)),sha(fs.readFileSync(currentSplit)));const {splitCandidate}=require(currentSplit);
 for(const name of fs.readdirSync(path.join(source,'snapshots')).sort()){
  const file=path.join(source,'snapshots',name),s=read(file);files.push(file);
  for(const c of s.candidates)for(const work of splitCandidate(c)){assert(!candidates.has(work.node_id)||stable(candidates.get(work.node_id))===stable(work),'Inconsistent candidate ID');candidates.set(work.node_id,work);sourceIds.set(work.node_id,c.node_id);}
  for(const o of s.technique_observations||[])observations.set(o.node_id,o);
 }
 const events=fs.readFileSync(path.join(source,'scan/trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const seenBody=new Map(),seenFull=new Map(),seenHypothetical=new Map(),pending=new Map(),rows=[];
 let tokens=0,targets=0,bodyHits=0,fullHits=0,hypotheticalHits=0,savedTokens=0;
 for(const e of events){
  if(e.event==='llm_request'){
   const cs=JSON.parse(e.body.messages[1].content).candidates;targets+=cs.length;
   const evidence=cs.map(c=>{assert(candidates.has(c.node_id),'Missing source candidate');const sourceId=sourceIds.get(c.node_id);assert(observations.has(sourceId),'Missing observation');return {candidate:candidates.get(c.node_id),observation:observations.get(sourceId)};});
   const body=sha(stable({settings:manifest.settings,body:e.body}));
   const full=sha(stable({settings:manifest.settings,body:e.body,evidence}));
   // Diagnostic upper bound only: removing IDs alone is not safe result reattribution.
   const hypothetical=sha(stable({settings:manifest.settings,body:{...e.body,messages:e.body.messages.map((m,i)=>i===1?{...m,content:stable({...JSON.parse(m.content),candidates:cs.map(({node_id,...rest})=>rest)})}:m)},evidence:evidence.map(({candidate,observation})=>({candidate:Object.fromEntries(Object.entries(candidate).filter(([k])=>k!=='node_id')),observation:Object.fromEntries(Object.entries(observation).filter(([k])=>k!=='node_id'))}))}));
   const row={call:e.call_number,targets:cs.length,body_key:body,full_key:full,body_hit:seenBody.has(body),eligible_hit:seenFull.has(full),id_removed_diagnostic_hit:seenHypothetical.has(hypothetical)};
   bodyHits+=+row.body_hit;fullHits+=+row.eligible_hit;hypotheticalHits+=+row.id_removed_diagnostic_hit;
   pending.set(e.call_number,{row,body,full,hypothetical});rows.push(row);
  }else if(e.event==='llm_response'){
   const p=pending.get(e.call_number);assert(p,'Response without request');
   const choice=e.data.choices[0];assert.equal(choice.finishReason||choice.finish_reason,'stop');
   const content=choice.message.content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/,'$1');
   const parsed=JSON.parse(content);assert(parsed.decisions&&Object.keys(parsed.decisions).length===p.row.targets);
   const usage=e.data.usage;const total=usage.totalTokens??usage.total_tokens;assert(Number.isFinite(total));tokens+=total;if(p.row.eligible_hit)savedTokens+=total;
   seenBody.set(p.body,true);seenFull.set(p.full,true);seenHypothetical.set(p.hypothetical,true);pending.delete(e.call_number);
  }
 }
 assert.equal(pending.size,0);
 // Independent quadratic equality check: no hashing or sort canonicalization.
 const requests=events.filter(e=>e.event==='llm_request');let independent=0;
 requests.forEach((r,i)=>{if(requests.slice(0,i).some(p=>JSON.stringify(p.body)===JSON.stringify(r.body)))independent++;});
 assert.equal(independent,bodyHits);
 const result={requests:rows.length,targets,candidates:candidates.size,body_exact_hits:bodyHits,full_evidence_eligible_hits:fullHits,id_removed_diagnostic_hits:hypotheticalHits,confirmed_tokens:tokens,eligible_saved_tokens:savedTokens,independent_exact_body_hits:independent,api_calls:0,decision:fullHits?'further_validation_required':'reject_no_observed_reuse',scope:plan.known_limit,source_hashes:Object.fromEntries(files.map(f=>[path.relative(process.cwd(),f),sha(fs.readFileSync(f))]))};
 fs.writeFileSync(path.join(out,'rows.json'),JSON.stringify(rows,null,2));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,source_hashes:undefined},null,2));
}
if(require.main===module)main();
