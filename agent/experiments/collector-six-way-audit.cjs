const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {normalize}=require('./collector-discovery-run.cjs');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function memoryStats(samples,start,end){
 const valid=samples.filter(s=>!s.error&&Number.isFinite(s.working_set_sum_bytes)).sort((a,b)=>a.at-b.at);let area=0,covered=0,maxGap=0;
 for(let i=1;i<valid.length;i++){const a=valid[i-1],b=valid[i],lo=Math.max(start,a.at),hi=Math.min(end,b.at);if(hi<=lo||b.at<=a.at)continue;
  const at=t=>a.working_set_sum_bytes+(b.working_set_sum_bytes-a.working_set_sum_bytes)*(t-a.at)/(b.at-a.at);area+=(at(lo)+at(hi))/2*(hi-lo);covered+=hi-lo;maxGap=Math.max(maxGap,b.at-a.at);}
 const inside=valid.filter(s=>s.at>=start&&s.at<=end);
 return{mean_bytes:covered?area/covered:null,peak_bytes:inside.length?Math.max(...inside.map(s=>s.working_set_sum_bytes)):null,samples:inside.length,covered_ms:covered,coverage_ratio:covered/(end-start),max_gap_ms:maxGap,errors:samples.filter(s=>s.error).length};
}
function selftest(){const s=[{at:0,working_set_sum_bytes:0},{at:10,working_set_sum_bytes:10}];assert.equal(memoryStats(s,0,10).mean_bytes,5);assert.equal(memoryStats(s,2,8).mean_bytes,5);assert.equal(memoryStats(s,0,20).coverage_ratio,.5);assert.equal(memoryStats(s,0,10).peak_bytes,10);assert.equal(memoryStats([],0,10).mean_bytes,null);console.log('PASS time-weighted memory windows and missing coverage');}
function audit(root){
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),progress=read('progress.json'),dataset=read('dataset.json'),rows=progress.completed;
 const reference=rows.find(r=>r.arm==='fifo5'&&r.pages===dataset.urls.length&&r.stop==='queue_exhausted');assert(reference,'No complete fifo5 reference; cannot establish loss');
 const oracle=new Map(),results=[];let verifiedPages=0,verifiedCandidates=0,identities=0,missingParents=0,rejectedOlder=0;
 const order=[reference,...rows.filter(r=>r.id!==reference.id)];
 for(const r of order){const missing=[],changed=[],added=[],ids=new Set();let pages=0,candidates=0;
  for(const a of r.attempts.filter(a=>a.status==='completed')){
   assert(a.committed_ms<=600000);const snapshot=read(`${r.id}/page-${a.index}.json`);assert.equal(snapshot.candidates.length,a.candidates);
   const actual=hash(normalize(snapshot));assert.equal(actual,a.evidence_hash);const nodeIds=new Set(snapshot.candidates.map(c=>c.node_id));
   for(const id of nodeIds){assert(!ids.has(id),'Duplicate candidate id');ids.add(id);}assert.equal(nodeIds.size,snapshot.candidates.length);
   if(r.id===reference.id)oracle.set(a.url,{hash:actual,ids:nodeIds});
   else{const base=oracle.get(a.url);assert(base,'Unexpected collected URL');if(base.hash!==actual)changed.push(a.url);for(const id of base.ids)if(!nodeIds.has(id))missing.push(id);for(const id of nodeIds)if(!base.ids.has(id))added.push(id);}
   pages++;candidates+=snapshot.candidates.length;
  }
  assert.equal(pages,r.pages);assert.equal(candidates,r.candidates);
  const collected=new Set(r.attempts.filter(a=>a.status==='completed').map(a=>a.url)),missingPages=dataset.urls.filter(u=>!collected.has(u));
  if(r.id!==reference.id)for(const u of missingPages)for(const id of oracle.get(u)?.ids||[])missing.push(id);
  const resource=read(`${r.id}/resources.json`);assert.equal(resource.stderr,'');
  for(const s of resource.samples.filter(s=>!s.error)){
   const byId=new Map(s.identities.map(p=>[p.pid,p]));assert(byId.has(s.root_pid));assert.equal(byId.size,s.identities.length);
   assert.equal(s.working_set_sum_bytes,s.identities.reduce((n,p)=>n+p.working_set_bytes,0));for(const p of s.identities){const parent=byId.get(p.parent_pid);if(parent)assert(p.created_ms>=parent.created_ms);else if(p.pid!==s.root_pid)missingParents++;}identities+=byId.size;rejectedOlder+=(s.rejected_older_children||[]).length;
  }
  const memory=memoryStats(resource.samples,r.started_at_ms,r.collection_finished_at_ms);
  results.push({id:r.id,arm:r.arm,round:r.round,wall_ms:r.wall_ms,pages,candidates,peak_concurrency:r.peak_concurrency,stop:r.stop,memory,missing_pages:missingPages,missing_candidates:missing.length,changed_pages:changed,added_candidates:added.length,complete:pages===dataset.urls.length&&r.stop==='queue_exhausted'});
  verifiedPages+=pages;verifiedCandidates+=candidates;console.log(JSON.stringify({audited:r.id,pages,candidates,missing:missing.length,changed:changed.length}));
 }
 const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null,median=a=>a.length?a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)]:null;
 const groups=[5,10,15,20,25,30].map(n=>{const a=results.filter(r=>r.arm==='fifo'+n),failures=progress.failures.filter(r=>r.n===n),complete=a.filter(r=>r.complete),memory=a.filter(r=>r.memory.mean_bytes!=null&&!r.memory.errors);
  return{concurrency:n,runs:a.length,completed_runs:complete.length,process_failures:failures.length,all_three_complete:complete.length===3&&failures.length===0,
   mean_wall_seconds:mean(complete.map(r=>r.wall_ms/1000)),median_wall_seconds:median(complete.map(r=>r.wall_ms/1000)),time_range_seconds:complete.length?[Math.min(...complete.map(r=>r.wall_ms/1000)),Math.max(...complete.map(r=>r.wall_ms/1000))]:null,
   mean_memory_gib:mean(memory.map(r=>r.memory.mean_bytes/1024**3)),max_observed_memory_gib:memory.length?Math.max(...memory.map(r=>r.memory.peak_bytes))/1024**3:null,memory_runs:memory.length,min_memory_coverage:memory.length?Math.min(...memory.map(r=>r.memory.coverage_ratio)):null,max_sample_gap_ms:memory.length?Math.max(...memory.map(r=>r.memory.max_gap_ms)):null,
   missing_candidates:a.reduce((s,r)=>s+r.missing_candidates,0),changed_page_observations:a.reduce((s,r)=>s+r.changed_pages.length,0),missing_page_observations:a.reduce((s,r)=>s+r.missing_pages.length,0),unverified_failed_runs:failures.map(r=>r.id)};});
 const output={reference:reference.id,reference_pages:reference.pages,reference_candidates:reference.candidates,verified_pages:verifiedPages,verified_candidate_observations:verifiedCandidates,process_identity_observations:identities,missing_parent_observations:missingParents,rejected_older_child_observations:rejectedOlder,groups,runs:results,failures:progress.failures,api_calls:0};
 fs.writeFileSync(path.join(root,'audit.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({...output,runs:undefined},null,2));
}
module.exports={memoryStats};
if(require.main===module){if(process.argv[2]==='selftest')selftest();else audit(path.resolve(process.argv[2]));}
