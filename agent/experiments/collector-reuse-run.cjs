const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Module=require('node:module');
const {collect,createCollector,canonical,inScope}=require('../src/core/collect.cjs');
const {start}=require('./scope-site.cjs'),{fixture,evidence,checkFixture,options}=require('./collector-reuse.test.cjs');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]||path.join(root,'.runtime/collector-reuse-'+Date.now()));
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const save=(name,v)=>fs.writeFileSync(path.join(out,name),JSON.stringify(v,null,2));
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
function frozen(){const file=path.join(root,'agent/src/core/collect.cjs'),m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(path.join(root,'.runtime/collector-reuse-baseline/collect.cjs'),'utf8'),file);return m.exports.collect;}
async function measure(dataset,mode,round){
 const events=[],snapshots=[],seen=new Set(),pending=[...(dataset.urls||[dataset.entry])],signal=new AbortController().signal,begin=performance.now();
 const reader=mode==='reuse'?await createCollector({onTiming:e=>events.push(e)}):null;
 try{
  while(pending.length){
   const url=pending.shift(),key=canonical(url);if(seen.has(key))continue;seen.add(key);
   const s=await (reader?reader.collect:collect)(url,{...options,signal,entryUrl:dataset.entry,onTiming:e=>events.push(e)});snapshots.push(s);
   if(!dataset.urls)for(const l of s.pages[0].navigation.links)if(inScope(l.url,new URL(dataset.entry),'/')&&!seen.has(canonical(l.url)))pending.push(l.url);
   if(snapshots.length%10===0)console.log(JSON.stringify({dataset:dataset.id,mode,round,pages:snapshots.length}));
  }
 }finally{if(reader)await reader.close();}
 const wall_ms=performance.now()-begin,phases={};
 for(const e of events){if(e.kind==='page_collection')for(const [k,v] of Object.entries(e.phases_ms))phases[k]=(phases[k]||0)+v;
  else{const k=e.kind==='browser_launch'?'launch':'browser_close';phases[k]=(phases[k]||0)+e.total_ms;}}
 const result={dataset:dataset.id,mode,round,wall_ms,phases_ms:phases,pages:snapshots.length,candidates:snapshots.reduce((n,s)=>n+s.candidates.length,0),
  evidence_hash:hash(snapshots.map(evidence)),events};
 if(dataset.labels){const found=new Map(snapshots.flatMap(s=>s.candidates).map(c=>[c.url+'\n'+c.location,c]));
  result.gold={ads:dataset.labels.filter(l=>l.is_ad).length,normal:dataset.labels.filter(l=>!l.is_ad).length,
   missing:dataset.labels.filter(l=>!found.has(l.page+'\n'+l.location)||found.get(l.page+'\n'+l.location).raw_text!==l.text)};
 }else result.fixture=checkFixture(snapshots);
 save(`${dataset.id}-${round}-${mode}.json`,{...result,snapshots:round===0?snapshots:undefined});
 console.log(JSON.stringify({...result,events:undefined}));return {result,snapshots};
}
async function main(){
 assert(!fs.existsSync(out),'Use a new output directory');fs.mkdirSync(out,{recursive:true});
 for(const [source,name] of [['agent/src/core/collect.cjs','tested-collect.cjs'],['agent/src/worker.cjs','tested-worker.cjs'],['agent/experiments/collector-reuse.test.cjs','tested-fixture.cjs']])fs.copyFileSync(path.join(root,source),path.join(out,name));
 save('manifest.json',{node:process.version,platform:process.platform,playwright:require('playwright/package.json').version,
  baseline_sha256:hash(fs.readFileSync(path.join(root,'.runtime/collector-reuse-baseline/collect.cjs'),'utf8')),
  collector_sha256:hash(fs.readFileSync(path.join(root,'agent/src/core/collect.cjs'),'utf8')),started_at:new Date().toISOString(),llm_calls:0});
 const existing=await start();let fresh;
 try{
  fresh=await fixture();const old=frozen(),datasets=[...existing.sites,{...fresh,id:'behavior'}],calibration=[];
  for(const url of [...existing.sites.map(s=>s.entry),...fresh.urls]){
   const a=await old(url,options),b=await collect(url,options);assert.deepEqual(evidence(a),evidence(b),'instrumentation drift: '+url);calibration.push({url,hash:hash(evidence(a))});
  }save('instrumentation-parity.json',calibration);console.log('PASS frozen baseline parity: '+calibration.length+' pages');
  const results=[];
  for(let round=0;round<3;round++)for(const dataset of datasets){
   const pair=[];for(const mode of round%2?['reuse','baseline']:['baseline','reuse'])pair.push(await measure(dataset,mode,round));
   assert.deepEqual(pair[0].snapshots.map(evidence),pair[1].snapshots.map(evidence),'reuse drift: '+dataset.id);
   results.push(...pair.map(p=>p.result));save('progress.json',results);
  }
  const groups=datasets.map(d=>{
   const a=results.filter(r=>r.dataset===d.id&&r.mode==='baseline'),b=results.filter(r=>r.dataset===d.id&&r.mode==='reuse');
   const baseline_ms=median(a.map(r=>r.wall_ms)),reuse_ms=median(b.map(r=>r.wall_ms)),wins=a.filter((r,i)=>b[i].wall_ms<r.wall_ms).length;
   return {dataset:d.id,pages:a[0].pages,candidates:a[0].candidates,baseline_ms,reuse_ms,reduction_percent:100*(baseline_ms-reuse_ms)/baseline_ms,wins,
    evidence_identical:a.every((r,i)=>r.evidence_hash===b[i].evidence_hash),gold:a[0].gold,fixture:a[0].fixture};
  });
  const pass=groups.every(g=>g.evidence_identical&&g.wins>=2&&g.reduction_percent>=5&&(!g.gold||g.gold.missing.length===0));
  save('summary.json',{pass,groups,results:results.map(r=>({...r,events:undefined})),llm_calls:0});console.log(JSON.stringify({pass,groups,out}));
 }finally{if(fresh)await fresh.close();await existing.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
