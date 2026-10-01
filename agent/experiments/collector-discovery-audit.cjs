// Re-score saved evidence only. No browser or API execution.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {evidence}=require('./collector-reuse.test.cjs');
const {compare}=require('./collector-discovery-run.cjs');
const root=path.resolve(process.argv[2]||'.runtime/collector-discovery-v1');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const datasets=read(path.join(root,'datasets.json')),rows=[];let pages=0,candidates=0,commonCandidates=0;
const snapshots=new Map(),differences=[];
function normalized(s){const e=evidence(s);for(const p of e.pages)p.issues?.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return e;}
for(const dir of fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory())){
 const folder=path.join(root,dir.name),result=path.join(folder,'result.json');if(!fs.existsSync(result))continue;
 const r=read(result);rows.push(r);const ids=new Set();
 for(const a of r.attempts.filter(x=>x.status==='completed')){
  const s=read(path.join(folder,`page-${a.index}.json`));assert(a.committed_ms<=(r.section==='fixed'?600000:20000));
  assert.equal(hash(normalized(s)),a.evidence_hash);assert.equal(s.candidates.length,a.candidates);
  for(const c of s.candidates){assert(!ids.has(c.node_id),'duplicate candidate ID');ids.add(c.node_id);}
  snapshots.set(r.id+'|'+a.url,s);pages++;candidates+=s.candidates.length;
 }
 assert.equal(r.pages,r.attempts.filter(x=>x.status==='completed').length);assert.equal(ids.size,r.candidates);
 const d=datasets.explore.find(d=>d.id===r.dataset);
 if(d&&r.gold){const available=new Set(r.attempts.filter(a=>a.status==='completed').flatMap(a=>snapshots.get(r.id+'|'+a.url).candidates.map(c=>c.url+'\n'+c.location+'\n'+c.raw_text)));
  assert.equal(r.gold.ads_collected,d.labels.filter(l=>l.is_ad&&available.has(l.page+'\n'+l.location+'\n'+l.text)).length);
 }
 if(r.discovery){const origin=new URL(d.entry).origin;
  assert(r.discovery.urls.every(u=>new URL(u).origin===origin));
  const allowed=new Set([origin,...d.labels.filter(l=>l.location.startsWith('iframe')).map(l=>new URL(l.location.match(/src="([^"]+)"/)[1]).origin)]);
  assert(r.requests.every(q=>q.method==='GET'&&allowed.has(new URL(q.url).origin)),'unexpected request boundary');
 }
}
for(const r of rows.filter(r=>r.arm!=='fifo1')){
 const b=rows.find(b=>b.section===r.section&&b.dataset===r.dataset&&b.round===r.round&&b.arm==='fifo1');if(!b)continue;
 for(const e of r.evidence){const x=snapshots.get(b.id+'|'+e.url),y=snapshots.get(r.id+'|'+e.url);if(!x)continue;
  commonCandidates+=y.candidates.length;
  const expected=new Map(x.candidates.map(c=>[c.node_id,c])),actual=new Map(y.candidates.map(c=>[c.node_id,c]));
  const delta={run:r.id,url:e.url,lost:[...expected.keys()].filter(id=>!actual.has(id)),gained:[...actual.keys()].filter(id=>!expected.has(id)),changed:[...actual.keys()].filter(id=>expected.has(id)&&hash(expected.get(id))!==hash(actual.get(id)))};
  if(delta.lost.length||delta.gained.length||delta.changed.length||hash(normalized(x))!==hash(normalized(y)))differences.push(delta);
 }
}
const summary=compare(rows),fixed=summary.groups.filter(g=>g.section==='fixed'),pairs=fixed.filter(g=>g.arm==='fifo2');
const baseMs=fixed.filter(g=>g.arm==='fifo1').reduce((s,g)=>s+g.median_wall_ms,0),parallelMs=pairs.reduce((s,g)=>s+g.median_wall_ms,0);
const fixedChecks={complete:rows.filter(r=>r.section==='fixed').length===18,identical:pairs.every(g=>g.checks.every(c=>!c.evidence_different.length&&!c.missing.length)),no_new_failures:pairs.every(g=>g.checks.every(c=>!c.failures)),wins:pairs.every(g=>g.checks.filter(c=>c.faster).length>=2),speed:parallelMs<=baseMs*.9};
const exp=summary.groups.filter(g=>g.section==='explore'),k=exp.filter(g=>g.arm==='katana1'),b=exp.filter(g=>g.arm==='fifo1');
const katanaChecks={complete:rows.filter(r=>r.section==='explore').length===18,ads_retained:k.every(g=>g.checks.every(c=>c.ads_delta>=0)),evidence:k.every(g=>g.checks.every(c=>!c.evidence_different.length)),pages:k.reduce((s,g)=>s+g.mean_pages,0)>=b.reduce((s,g)=>s+g.mean_pages,0)*1.1};
const result={completed_runs:rows.length,pages_verified:pages,candidate_observations_verified:candidates,common_candidate_observations:commonCandidates,differences,
 fixed:{checks:fixedChecks,pass:Object.values(fixedChecks).every(Boolean),median_sum_baseline_ms:baseMs,median_sum_parallel_ms:parallelMs,reduction_percent:100*(baseMs-parallelMs)/baseMs},
 katana:{checks:katanaChecks,pass:Object.values(katanaChecks).every(Boolean)},summary,api_calls:0};
fs.writeFileSync(path.join(root,'independent-audit.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,summary:undefined,differences:differences.slice(0,5)},null,2));
