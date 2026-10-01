const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execute}=require('./collector-concurrency-run.cjs'),{startServer}=require('./replica-intent-site.cjs');
const ROOT=path.resolve(__dirname,'../..'),read=f=>JSON.parse(fs.readFileSync(f,'utf8')),save=(f,x)=>fs.writeFileSync(f,JSON.stringify(x,null,2));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
 const out=path.resolve(process.argv[2]||'.runtime/collector-six-way-v1');assert(!fs.existsSync(out));fs.mkdirSync(path.join(out,'jobs'),{recursive:true});
 const sources=['agent/src/core/collect.cjs','agent/src/core/frame-access.cjs','agent/src/core/frontier.cjs','agent/src/core/techniques.cjs','agent/src/core/judgment.cjs','agent/src/core/llm.cjs','agent/src/core/bounded-scan.cjs','agent/src/core/bounded-scan-store.cjs','agent/src/worker.cjs','agent/experiments/collector-six-way-run.cjs','agent/experiments/collector-concurrency-run.cjs','agent/experiments/collector-discovery-run.cjs','agent/experiments/collector-reuse.test.cjs','agent/experiments/replica-intent-site.cjs','docs/collector-six-way-plan.md'];
 const hashes=()=>Object.fromEntries(sources.map(f=>[f,sha(path.join(ROOT,f))])),initial=hashes();
 for(const f of sources){const p=path.join(out,'frozen-source',f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(ROOT,f),p);}
 save(path.join(out,'manifest.json'),{at:new Date().toISOString(),sources:initial,arms:[5,10,15,20,25,30],rounds:3,memory_limit:null,monitor_interval_ms:500,node:process.version,api_calls:0});
 const rows=[],failures=[],start=performance.now();let server;
 try{
  server=await startServer(undefined,{split:'dev',port:0});const pages=server.pages.filter(p=>p.status===200);assert.equal(pages.length,63);
  const dataset={id:'real-dom63',entry:server.entryUrl,urls:pages.map(p=>server.origin+p.pathname),diskEvidence:true,monitorIntervalMs:500};
  const root=path.join(ROOT,'.runtime/replica-intent-data-v1'),m=read(path.join(root,'manifest.json'));
  for(const p of pages){const f=(fs.existsSync(path.join(root,'pages',p.source_id+'.html'))?'pages/':'dom/')+p.source_id+'.html';assert.equal(sha(path.join(root,f)),m.files[f]);}
  save(path.join(out,'dataset.json'),dataset);const arms=[5,10,15,20,25,30],schedule=[];
  for(let round=0;round<3;round++)for(let i=0;i<arms.length;i++)schedule.push({round,n:arms[(i+round*2)%arms.length]});save(path.join(out,'schedule.json'),schedule);
  for(const {round,n} of schedule){
   assert(performance.now()-start<3600000,'Overall one-hour safety budget');
   const id=`fixed-real-dom63-${round}-fifo${n}`,file=path.join(out,'jobs',id+'.json'),folder=path.join(out,id),begin=performance.now();
   save(file,{dataset,arm:'fifo'+n,round,section:'fixed',out});
   try{
    const execution=await execute(file,630000),r=read(path.join(folder,'result.json'));r.process_wall_ms=execution.wall_ms;save(path.join(folder,'result.json'),r);save(path.join(folder,'process.json'),execution);rows.push(r);
    const base=rows.find(x=>x.arm==='fifo5'&&x.pages===63&&x.stop==='queue_exhausted');
    if(base){const hashes=new Map(base.evidence.map(e=>[e.url,e.hash]));const changed=r.evidence.filter(e=>hashes.has(e.url)&&hashes.get(e.url)!==e.hash);if(changed.length)console.log(JSON.stringify({regression:true,id,changed:changed.map(e=>e.url)}));}
   }catch(e){const failure={id,n,round,error:e.message,elapsed_ms:performance.now()-begin,saved_page_files:fs.existsSync(folder)?fs.readdirSync(folder).filter(f=>/^page-\d+\.json$/.test(f)).length:0};failures.push(failure);save(path.join(out,'failure-'+id+'.json'),failure);console.log(JSON.stringify({process_failed:true,...failure}));}
   save(path.join(out,'progress.json'),{completed:rows,failures});
  }
  save(path.join(out,'completion.json'),{status:failures.length?'completed_with_failures':'completed',runs:rows.length,failures:failures.length,elapsed_ms:performance.now()-start,api_calls:0});
 }catch(e){save(path.join(out,'completion.json'),{status:'interrupted',runs:rows.length,failures:failures.length,error:e.message,api_calls:0});throw e;}
 finally{if(server)await server.close();const after=hashes();save(path.join(out,'source-after.json'),{sources:after,unchanged:JSON.stringify(initial)===JSON.stringify(after)});}
 console.log(JSON.stringify({out,...read(path.join(out,'completion.json'))}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
