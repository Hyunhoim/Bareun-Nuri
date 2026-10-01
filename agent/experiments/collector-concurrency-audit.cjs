// Independent re-read of saved page evidence. No browser/API calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {evidence}=require('./collector-reuse.test.cjs'),{compare}=require('./collector-discovery-run.cjs');
const root=path.resolve(process.argv[2]||'.runtime/collector-concurrency-v1'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),rows=[],packets=new Map(),oracle=new Map();
let pages=0,candidates=0;
const datasets=read(path.join(root,'datasets.json'));
const manifest=read(path.join(root,'manifest.json')),baseline=manifest.baseline,arms=manifest.arms||['fifo2','fifo3','fifo4','fifo5'];
function normalized(s){const e=evidence(s);for(const p of e.pages)p.issues?.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return e;}
for(const d of fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory())){
 const folder=path.join(root,d.name),file=path.join(folder,'result.json');if(!fs.existsSync(file))continue;
 const r=read(file);rows.push(r);const ids=new Set(),found=new Set(),saved=new Map();
 for(const a of r.attempts.filter(a=>a.status==='completed')){
  assert(a.committed_ms<=(r.section==='fixed'?600000:20000));const s=read(path.join(folder,`page-${a.index}.json`));
  const h=hash(normalized(s));assert.equal(h,a.evidence_hash);assert.equal(s.candidates.length,a.candidates);
  const cs=new Map(s.candidates.map(c=>[c.node_id,hash(c)]));
  for(const c of s.candidates){assert(!ids.has(c.node_id));ids.add(c.node_id);found.add(c.url+'\n'+c.location+'\n'+c.raw_text);}
  const packet={hash:h,candidates:cs};saved.set(a.url,packet);if(r.section==='fixed'&&r.arm===baseline){const k=r.dataset+'|'+a.url;if(oracle.has(k))assert.equal(oracle.get(k).hash,h,'Baseline repeat drift');oracle.set(k,packet);}
  pages++;candidates+=s.candidates.length;
 }
 assert.equal(r.pages,saved.size);assert.equal(r.candidates,ids.size);packets.set(r.id,saved);
 const dataset=datasets.explore.find(x=>x.id===r.dataset);
 if(dataset&&r.gold){for(const positive of [true,false])assert.equal(positive?r.gold.ads_collected:r.gold.normal_collected,dataset.labels.filter(l=>l.is_ad===positive&&found.has(l.page+'\n'+l.location+'\n'+l.text)).length);
  const allowed=new Set([new URL(dataset.entry).origin,...dataset.labels.flatMap(l=>l.location.match(/src="([^"]+)"/)?.slice(1,2)||[]).map(u=>new URL(u).origin)]);
  assert(r.requests.every(q=>q.method==='GET'&&allowed.has(new URL(q.url).origin)));
 }
}
const differences=[];let compared=0,oraclePages=0;
for(const r of rows.filter(r=>r.arm!==baseline||r.section==='explore'))for(const[u,p]of packets.get(r.id)){
 const reference=oracle.get(r.dataset+'|'+u);assert(reference,'Missing full-collection reference: '+u);oraclePages++;compared+=p.candidates.size;
 if(p.hash!==reference.hash)differences.push({run:r.id,url:u,lost:[...reference.candidates.keys()].filter(id=>!p.candidates.has(id)),added:[...p.candidates.keys()].filter(id=>!reference.candidates.has(id)),changed:[...p.candidates.keys()].filter(id=>reference.candidates.has(id)&&reference.candidates.get(id)!==p.candidates.get(id))});
}
const benchmark=rows.filter(r=>r.round!==99),summary=compare(benchmark,baseline),g=summary.groups;
const baselineMs=g.filter(x=>x.section==='fixed'&&x.arm===baseline).reduce((s,x)=>s+x.median_wall_ms,0),candidatesGate=[];
for(const arm of arms.filter(a=>a!==baseline)){
 const fixed=g.filter(x=>x.section==='fixed'&&x.arm===arm),exp=g.filter(x=>x.section==='explore'&&x.arm===arm),ms=fixed.reduce((s,x)=>s+x.median_wall_ms,0);
 const checks={complete:benchmark.length===60&&g.length===20&&g.every(x=>x.runs===3),unchanged:!differences.some(d=>d.run.endsWith('-'+arm)),no_failures:fixed.every(x=>x.checks.every(c=>!c.failures&&!c.missing.length)),wins:fixed.every(x=>x.checks.filter(c=>c.faster).length>=2),total_speed:ms<=baselineMs*.9,per_dataset:fixed.every(x=>x.median_wall_ms<=g.find(b=>b.section==='fixed'&&b.dataset===x.dataset&&b.arm===baseline).median_wall_ms*1.05),ads_retained:exp.every(x=>x.checks.every(c=>c.ads_delta>=0))};
 candidatesGate.push({arm,median_sum_ms:ms,reduction_vs_baseline_percent:100*(baselineMs-ms)/baselineMs,checks,pass:Object.values(checks).every(Boolean)});
}
const passed=candidatesGate.filter(c=>c.pass),best=passed.length?Math.min(...passed.map(c=>c.median_sum_ms)):null;
const recommended=passed.filter(c=>c.median_sum_ms<=best*1.05).sort((a,b)=>Number(a.arm.slice(4))-Number(b.arm.slice(4)))[0]?.arm||baseline;
const report={runs:rows.length,benchmark_runs:benchmark.length,pages_verified:pages,candidate_observations:candidates,reference_compared_pages:oraclePages,reference_compared_candidates:compared,differences,baseline,baseline_median_sum_ms:baselineMs,candidates:candidatesGate,recommended,recommendation_scope:'Local diagnostic candidate, not operating adoption',summary,api_calls:0};
fs.writeFileSync(path.join(root,'audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,summary:undefined,differences:differences.slice(0,5)},null,2));
