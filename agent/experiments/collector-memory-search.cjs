// Bounded local search. Operating collection and judgment code remain untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execute}=require('./collector-concurrency-run.cjs');
const {mixedFixtures}=require('./collector-discovery-run.cjs');
const {fixture}=require('./collector-reuse.test.cjs');
const {startServer}=require('./replica-intent-site.cjs');
const ROOT=path.resolve(__dirname,'../..'),CAP=4*1024**3,STOP=3.25*1024**3;
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const save=(f,x)=>fs.writeFileSync(f,JSON.stringify(x,null,2)),median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
function assess(r,reference,expected){
 const hashes=new Map(reference?.evidence.map(e=>[e.url,e.hash])||[]),missing=reference?reference.evidence.filter(e=>!r.evidence.some(x=>x.url===e.url)).map(e=>e.url):[];
 const changed=r.evidence.filter(e=>hashes.has(e.url)&&hashes.get(e.url)!==e.hash).map(e=>e.url);
 const checks={complete:!r.memory_stop&&r.stop==='queue_exhausted'&&r.attempts.every(a=>a.status==='completed')&&(expected==null||r.pages===expected),memory:r.resources.available&&r.resources.peak_working_set_sum_bytes<CAP,unchanged:!changed.length&&!missing.length};
 return{checks,pass:Object.values(checks).every(Boolean),missing,changed};
}
async function main(){
 const out=path.resolve(process.argv[2]||'.runtime/collector-memory-search-v1');assert(!fs.existsSync(out));fs.mkdirSync(path.join(out,'jobs'),{recursive:true});
 const sources=['agent/src/core/collect.cjs','agent/src/core/frame-access.cjs','agent/src/core/frontier.cjs','agent/src/core/techniques.cjs','agent/src/core/judgment.cjs','agent/src/core/llm.cjs','agent/src/core/bounded-scan.cjs','agent/src/core/bounded-scan-store.cjs','agent/src/worker.cjs','agent/experiments/collector-memory-search.cjs','agent/experiments/collector-concurrency-run.cjs','agent/experiments/collector-discovery-run.cjs','agent/experiments/collector-reuse.test.cjs','agent/experiments/replica-intent-site.cjs','agent/experiments/scope-site.cjs','docs/collector-memory-search-plan-v2.md'];
 const hashes=()=>Object.fromEntries(sources.map(f=>[f,sha(path.join(ROOT,f))])),initial=hashes();
 for(const f of sources){const p=path.join(out,'frozen-source',f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(ROOT,f),p);}
 save(path.join(out,'manifest.json'),{at:new Date().toISOString(),sources:initial,cap_bytes:CAP,stop_bytes:STOP,monitor_interval_ms:500,node:process.version,api_calls:0});
 const rows=[],decisions=[],begin=performance.now();let replica,mixed,behavior,reference,bound=41;
 try{
  replica=await startServer(undefined,{split:'dev',port:0});mixed=await mixedFixtures();behavior=await fixture();
  const pages=replica.pages.filter(p=>p.status===200);assert.equal(pages.length,63);
  const sourceRoot=path.join(ROOT,'.runtime/replica-intent-data-v1'),datasetManifest=read(path.join(sourceRoot,'manifest.json'));
  for(const p of pages){const f=(fs.existsSync(path.join(sourceRoot,'pages',p.source_id+'.html'))?'pages/':'dom/')+p.source_id+'.html';assert.equal(sha(path.join(sourceRoot,f)),datasetManifest.files[f]);}
  const d={id:'real-dom63',entry:replica.entryUrl,urls:pages.map(p=>replica.origin+p.pathname)},datasets={fixed:[d,{...behavior,id:'behavior'}],explore:mixed.sites};
  save(path.join(out,'datasets.json'),{fixed:datasets.fixed.map(x=>({id:x.id,entry:x.entry,urls:x.urls})),explore:mixed.sites.map(x=>({id:x.id,entry:x.entry,urls:x.urls,labels:x.labels}))});
  async function run(dataset,n,round,section,stage){
   assert(rows.length<41,'41-run safety budget');assert(performance.now()-begin<3600000,'One-hour safety budget');
   const job={dataset:{id:dataset.id,entry:dataset.entry,urls:dataset.urls,labels:dataset.labels,memoryStopBytes:STOP,monitorIntervalMs:500,diskEvidence:true},arm:'fifo'+n,round,section,out};
   const id=`${section}-${dataset.id}-${round}-${job.arm}`,file=path.join(out,'jobs',id+'.json');save(file,job);mixed.setRun(id);
   const execution=await execute(file,section==='fixed'?630000:60000),folder=path.join(out,id),r=read(path.join(folder,'result.json'));
   r.stage=stage;r.requests=mixed.requests.filter(q=>q.run===id);r.process_wall_ms=execution.wall_ms;
   const resources=read(path.join(folder,'resources.json'));r.monitor_errors=resources.samples.filter(s=>s.error).length;
   if(r.monitor_errors||resources.stderr||!r.resources.available)throw Error('Invalid memory measurement: '+id);
   save(path.join(folder,'result.json'),r);save(path.join(folder,'process.json'),execution);rows.push(r);save(path.join(out,'progress.json'),rows);
   return r;
  }
  function evaluate(r,ref,expected){const q=assess(r,ref,expected);decisions.push({id:r.id,n:Number(r.arm.slice(4)),stage:r.stage,wall_ms:r.wall_ms,peak_bytes:r.resources.peak_working_set_sum_bytes,...q});
   save(path.join(out,'decisions.json'),decisions);if(q.changed.length||(q.missing.length&&!r.memory_stop))console.log(JSON.stringify({regression:true,id:r.id,...q}));return q;}
  const base5=await run(d,5,0,'fixed','search');let q=evaluate(base5,null,63);
  if(q.pass)reference=base5;else{if(!base5.memory_stop)throw Error('Baseline collection failed');bound=5;reference=await run(d,1,0,'fixed','search');assert(evaluate(reference,null,63).pass,'Safe reference failed');}
  const baseline=Number(reference.arm.slice(4));save(path.join(out,'reference.json'),{id:reference.id,baseline});
  async function search(n){if(rows.some(r=>r.stage==='search'&&r.arm==='fifo'+n)||n>=bound)return;
   const r=await run(d,n,0,'fixed','search');evaluate(r,reference,63);if(r.memory_stop){bound=Math.min(bound,n);console.log(JSON.stringify({memory_bound:n,peak_bytes:r.resources.peak_working_set_sum_bytes}));}}
  for(const n of [1,10,15,20,25,30,35,40])await search(n);
  const coarse=decisions.filter(x=>x.stage==='search'&&x.pass).sort((a,b)=>a.wall_ms-b.wall_ms)[0];assert(coarse);
  const neighbors=Array.from({length:9},(_,i)=>coarse.n-4+i).filter(n=>n>=1&&n<=40&&n<bound);
  save(path.join(out,'refinement.json'),{coarse_winner:coarse.n,bound,neighbors});
  for(const n of neighbors)await search(n);
  const top=decisions.filter(x=>x.stage==='search'&&x.pass).sort((a,b)=>a.wall_ms-b.wall_ms).slice(0,3).map(x=>x.n),selected=[...new Set([...top,baseline])];
  save(path.join(out,'confirmation-plan.json'),{selected,rounds:3,selection:'minimum median among all-pass configurations',baseline,bound});
  for(let round=1;round<=3;round++)for(let i=0;i<selected.length;i++){const n=selected[(i+round-1)%selected.length];evaluate(await run(d,n,round,'fixed','confirm'),reference,63);}
  const confirmed=selected.map(n=>{const a=decisions.filter(x=>x.stage==='confirm'&&x.n===n);return{n,runs:a.length,pass:a.length===3&&a.every(x=>x.pass),median_ms:median(a.map(x=>x.wall_ms)),times_ms:a.map(x=>x.wall_ms),peak_bytes:Math.max(...a.map(x=>x.peak_bytes))};}).sort((a,b)=>a.median_ms-b.median_ms);
  const winner=confirmed.find(x=>x.pass);assert(winner,'No confirmed configuration');save(path.join(out,'confirmation.json'),{confirmed,winner,baseline});
  const validation=[];
  for(const [section,list] of [['fixed',[{...behavior,id:'behavior'}]],['explore',mixed.sites]])for(const dataset of list)for(let round=10;round<12;round++){
   const order=[...new Set(round===10?[baseline,winner.n]:[winner.n,baseline])],cell=[];
   for(const n of order)cell.push(await run(dataset,n,round,section,'validation'));
   const base=cell.find(r=>r.arm==='fifo'+baseline);for(const r of cell){const expected=section==='fixed'?dataset.urls.length:undefined,v=assess(r,base,expected);const adsRetained=!r.gold||r.gold.ads_collected>=base.gold.ads_collected;validation.push({id:r.id,...v,ads_retained:adsRetained,pass:v.pass&&adsRetained});}
   save(path.join(out,'validation.json'),validation);
  }
  const valid=validation.every(x=>x.pass);save(path.join(out,'completion.json'),{status:'completed',runs:rows.length,elapsed_ms:performance.now()-begin,confirmed_fastest:winner.n,validation_pass:valid,recommended:valid?winner.n:null,baseline,api_calls:0});
 }catch(e){save(path.join(out,'completion.json'),{status:'failed',runs:rows.length,error:e.message,api_calls:0});throw e;}
 finally{if(replica)await replica.close();if(mixed)await mixed.close();if(behavior)await behavior.close();const after=hashes();save(path.join(out,'source-after.json'),{sources:after,unchanged:JSON.stringify(initial)===JSON.stringify(after)});}
 console.log(JSON.stringify({completed:true,out,...read(path.join(out,'completion.json'))}));
}
module.exports={assess};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
