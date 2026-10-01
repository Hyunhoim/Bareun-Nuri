const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const read=f=>JSON.parse(fs.readFileSync(f));
function audit(dir){
 const e=read(dir+'/evaluation.json'),manifest=read(dir+'/manifest.json'),calls=read(dir+'/calls.json');
 const prior=new Map(),originalPages=new Map();for(const f of fs.readdirSync('.runtime/jamo-context-live-c-v1/snapshots')){const s=read('.runtime/jamo-context-live-c-v1/snapshots/'+f);originalPages.set(s.pages[0].url,s);for(const c of s.candidates)prior.set(c.node_id,c);}
 const hash=x=>require('node:crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex'),snapshotProvenance=[];
 let preserved=0;for(const f of fs.readdirSync(dir+'/snapshots')){const s=read(dir+'/snapshots/'+f);for(const c of s.candidates){assert.deepEqual(c,prior.get(c.node_id),'Changed DOM candidate');preserved++;}
  const {snapshot_sha256,collected_at,collection_elapsed_sec,...derived}=s,original=structuredClone(derived);
  original.pages[0].navigation.links=originalPages.get(s.pages[0].url).pages[0].navigation.links;
  assert.equal(hash(original),snapshot_sha256,'Original collected content hash');
  snapshotProvenance.push({file:f,original_collector_hash:snapshot_sha256,derived_fixture_hash:hash(derived)});
 }
 const events=fs.readFileSync(dir+'/scan/trace.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 const requests=events.filter(x=>x.event==='llm_request'),responses=events.filter(x=>x.event==='llm_response');
 const sent=calls.filter(c=>c.sent_at_ms);assert.equal(requests.length,sent.length);assert.equal(responses.length,sent.length,'Unknown response');assert(sent.every(c=>c.status==='ok'));
 const ids=requests.flatMap(x=>JSON.parse(x.body.messages[1].content).candidates.map(c=>c.node_id));assert.equal(new Set(ids).size,ids.length,'Duplicate judged work');const uncommitted=ids.length-e.judged_work;assert.equal(uncommitted,e.inflight?.phase==='responded'?e.inflight.ids.length:0);
 const r=e.controlled64;assert.equal(r.tp+r.fn,r.ads);assert.equal(r.judged,r.rows.filter(x=>x.judged).length);
 return {name:manifest.profile.name,status:e.status,reason:e.reason,pages:e.pages,expected_pages:manifest.profile.pages,
  candidates:e.candidates,expected_candidates:manifest.profile.candidates,judged:e.merged_judged,completion_rate:e.merged_judged/manifest.profile.candidates,
  wall_sec:e.completion.wall_sec,calls:sent.length,tokens:sent.reduce((n,c)=>n+c.usage.total_tokens,0),service_sec:sent.reduce((n,c)=>n+c.service_sec,0),queue_sec:calls.reduce((n,c)=>n+(c.queue_wait_sec||0),0),
  evidence_chars:manifest.profile.evidence_chars,controlled:{...r,rows:undefined},outside:e.unlabelled_positive_count,preserved_candidates:preserved,transport_unknown:0,uncommitted_responded_work:uncommitted,snapshot_provenance:snapshotProvenance};
}
if(require.main===module){const results=[];for(const size of ['small','medium','large']){const dir='.runtime/scale-'+size+'-live-v1';if(fs.existsSync(dir+'/evaluation.json'))results.push(audit(dir));}
console.log(JSON.stringify(results,null,2));if(process.argv.includes('--save')){const out='.runtime/scale-capacity-summary-v1.json';assert(!fs.existsSync(out));assert.equal(results.length,3);fs.writeFileSync(out,JSON.stringify(results,null,2));}}
module.exports={audit};
