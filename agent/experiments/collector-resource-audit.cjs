// Re-read resource identities and page evidence; no browser or API calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {normalize}=require('./collector-discovery-run.cjs');
const root=path.resolve(process.argv[2]),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rows=read('progress.json'),manifest=read('manifest.json'),oracle=new Map();
assert.equal(rows.length,12);assert.equal(read('completion.json').status,'completed');assert(read('source-after.json').unchanged);
let pages=0,samples=0,identities=0,rejectedOlder=0,missingParents=0;
for(const r of rows){
 assert.equal(r.dataset,'real-dom20');assert.equal(r.pages,20);assert.equal(r.candidates,3543);assert(r.attempts.every(a=>a.status==='completed'));
 assert.equal(r.peak_concurrency,Number(r.arm.slice(4)));
 for(const a of r.attempts){const s=read(`${r.id}/page-${a.index}.json`),h=hash(normalize(s));assert.equal(h,a.evidence_hash);
  if(oracle.has(a.url))assert.equal(h,oracle.get(a.url),'Page evidence drift');else oracle.set(a.url,h);pages++;}
 const resource=read(`${r.id}/resources.json`);assert.equal(resource.stderr,'');assert(resource.samples.length>0);assert(r.resources.available);
 for(const s of resource.samples){
  assert(!s.error);assert(s.identities.length>0);const byId=new Map(s.identities.map(p=>[p.pid,p]));assert.equal(byId.size,s.identities.length);assert(byId.has(s.root_pid));
  assert.equal(s.processes,s.identities.length);assert.equal(s.working_set_sum_bytes,s.identities.reduce((a,p)=>a+p.working_set_bytes,0));
  for(const p of s.identities){assert(p.created_ms<=s.at);if(p.pid!==s.root_pid){const parent=byId.get(p.parent_pid);if(parent)assert(p.created_ms>=parent.created_ms,'Older child under reused parent PID');else missingParents++;}}
  samples++;identities+=s.identities.length;rejectedOlder+=s.rejected_older_children.length;
 }
 assert.equal(r.resources.peak_working_set_sum_bytes,Math.max(...resource.samples.map(s=>s.working_set_sum_bytes)));
}
const median=a=>a.sort((x,y)=>x-y)[1];
const groups=manifest.arms.map(arm=>{const a=rows.filter(r=>r.arm===arm);assert.equal(a.length,3);return{arm,peak_mib:Math.max(...a.map(r=>r.resources.peak_working_set_sum_bytes))/1048576,median_peak_mib:median(a.map(r=>r.resources.peak_working_set_sum_bytes))/1048576,per_run_peak_mib:a.map(r=>r.resources.peak_working_set_sum_bytes/1048576)};});
const result={runs:rows.length,pages,candidate_observations:rows.reduce((s,r)=>s+r.candidates,0),evidence_differences:0,samples,identities,rejected_older_relations:rejectedOlder,identities_with_missing_live_parent:missingParents,groups,scope:'Supplemental working-set measurement; do not replace primary benchmark timings.',api_calls:0};
fs.writeFileSync(path.join(root,'resource-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
