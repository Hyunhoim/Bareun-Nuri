// Read-only audit of the completed diagnostic; never sends requests.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root='.runtime/phase1-speed-live-v1',source='.runtime/phase1-full-1790774023853';
const read=f=>JSON.parse(fs.readFileSync(f)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const plan=read(root+'/plan.json'),bodies=read(root+'/bodies.json'),done=read(root+'/completion.json');
assert.equal(done.fatal,null);assert.equal(done.rounds.length,4);
const uuids=new Set();let actualTokens=0,reordered=0;
for(const round of done.rounds){
 assert.equal(round.rows.length,24);
 const sent=round.rows.slice().sort((a,b)=>a.sent_at-b.sent_at);
 assert.deepEqual(sent.map(r=>r.index),Array.from({length:24},(_,i)=>i));
 for(let i=1;i<sent.length;i++){assert(sent[i].sent_at-sent[i-1].sent_at>=1000);if(sent[i].responded_at<sent[i-1].responded_at)reordered++;}
 for(const r of round.rows){
  assert(!uuids.has(r.uuid));uuids.add(r.uuid);
  const disk=read(root+'/'+r.round+'-'+String(r.index).padStart(3,'0')+'.json');assert.deepEqual(disk,r);
  assert.equal(r.body_sha256,sha(JSON.stringify(bodies[r.index])));assert.equal(r.body_sha256,plan.immutable_requests[r.index].sha256);
  assert.deepEqual(r.ids,JSON.parse(bodies[r.index].messages[1].content).candidates.map(c=>c.node_id));
  assert(['committed','quarantine'].includes(r.state));assert.equal(r.http_status,200);
  const raw=JSON.parse(r.raw);actualTokens+=raw.result.usage.totalTokens;assert.deepEqual(raw.result.usage,r.usage);
 }
}
assert.equal(actualTokens,done.totalTokens);assert.equal(uuids.size,done.callCount);
const manifest=read(source+'/manifest.json');for(const[f,h]of Object.entries(manifest.source_hashes))assert.equal(sha(fs.readFileSync(f)),h,'Operating source changed: '+f);
const phase2=read('test-set-operating-phase2/private/status.json');assert.equal(phase2.evaluation_runs,0);assert.equal(phase2.training_runs,0);
assert.equal(sha(fs.readFileSync('test-set-operating-phase2/manifest.json')),'b9aafb8e33ef6a458eb3b2df295cc9605042a00ceca9c20e2616e897ac9859c8');
const result={requests:uuids.size,actual_tokens:actualTokens,reversed_adjacent_response_pairs:reordered,body_id_and_raw_usage_match:true,operating_source_files_unchanged:Object.keys(manifest.source_hashes).length,phase2_unchanged:true,scope:'Frozen-request diagnostic audit, not crash/resume or 25-minute operational validation'};
fs.writeFileSync(root+'/root-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
