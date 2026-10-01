// Reuse the collection benchmark; isolate each measurement in a fresh Node process.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mixedFixtures,measure,compare}=require('./collector-discovery-run.cjs');
const {fixture}=require('./collector-reuse.test.cjs');
const {startServer}=require('./replica-intent-site.cjs');
const ROOT=path.resolve(__dirname,'../..'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),save=(f,x)=>fs.writeFileSync(f,JSON.stringify(x,null,2));
async function child(configFile){
 const config=read(configFile);await measure(config.dataset,config.arm,config.round,config.section,config.out,{setRun:()=>{},requests:[]});
}
function execute(file,timeout){return new Promise((resolve,reject)=>{
 const started=performance.now(),p=spawn(process.execPath,[__filename,'child',file],{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',error='';
 const timer=setTimeout(()=>{spawn('taskkill.exe',['/PID',String(p.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});reject(Error('Bounded benchmark process timeout'));},timeout);
 p.stdout.on('data',b=>{output+=b;process.stdout.write(b);});p.stderr.on('data',b=>error+=b);
 p.once('error',e=>{clearTimeout(timer);reject(e);});p.once('close',code=>{clearTimeout(timer);code===0?resolve({wall_ms:performance.now()-started,output,stderr:error}):reject(Error('Child exit '+code+': '+error));});
});}
async function main(){
 const mode=process.argv[2];assert(['run','resources'].includes(mode),'Use run or resources');
 const counts=(process.argv[4]||'2,3,4,5').split(',').map(Number);assert(counts.length===4&&new Set(counts).size===4&&counts.every(n=>Number.isInteger(n)&&n>=1&&n<=20),'Provide four distinct concurrency values from 1 to 20');
 const arms=counts.map(n=>'fifo'+n),baseline=arms[0],plan=process.argv[5]||'docs/collector-concurrency-plan.md';
 const out=path.resolve(process.argv[3]||'.runtime/collector-concurrency-v1');assert(!fs.existsSync(out),'Use a fresh output directory');fs.mkdirSync(path.join(out,'jobs'),{recursive:true});
 const sources=['agent/src/core/collect.cjs','agent/src/core/frontier.cjs','agent/src/core/frame-access.cjs','agent/src/core/techniques.cjs','agent/src/core/judgment.cjs','agent/src/core/llm.cjs','agent/src/core/bounded-scan.cjs','agent/src/worker.cjs','agent/experiments/collector-discovery-run.cjs','agent/experiments/collector-concurrency-run.cjs','agent/experiments/collector-concurrency-audit.cjs','agent/experiments/collector-reuse.test.cjs','agent/experiments/scope-site.cjs','agent/experiments/replica-intent-site.cjs',plan];
 const hashes=()=>Object.fromEntries(sources.map(f=>[f,sha(path.join(ROOT,f))]));const initial=hashes();
 for(const f of sources){const to=path.join(out,'frozen-source',f);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(ROOT,f),to);}
 save(path.join(out,'manifest.json'),{at:new Date().toISOString(),sources:initial,node:process.version,playwright:require('playwright/package.json').version,mode,baseline,arms,rounds:3,api_calls:0});
 const mixed=await mixedFixtures(),behavior=await fixture();let replica;const rows=[],begin=performance.now();
 try{
  replica=await startServer(undefined,{split:'dev',port:0});
  const original=read(path.join(ROOT,'.runtime/real-replica-v1/live-runs/busan-board-fifo.json')).attempts.slice(0,20);assert.equal(original.length,20);
  const urls=original.map(u=>{const x=new URL(u);return replica.origin+x.pathname+x.search;});
  const fixed=[mixed.sites[0],{...behavior,id:'behavior'},{id:'real-dom20',entry:replica.entryUrl,urls}];
  const reference=mixed.sites[1],jobs=[{dataset:{id:reference.id,entry:reference.entry,urls:reference.urls,labels:reference.labels},arm:baseline,round:99,section:'fixed',out}];
  for(const [section,datasets]of [['fixed',fixed],['explore',mixed.sites]])for(let round=0;round<3;round++)for(const [i,d]of datasets.entries()){
   const order=arms.map((_,j)=>arms[(j+round+i)%arms.length]);
   for(const arm of order)jobs.push({dataset:{id:d.id,entry:d.entry,urls:d.urls,labels:d.labels},arm,round,section,out});
  }
  save(path.join(out,'datasets.json'),{fixed:fixed.map(d=>({id:d.id,entry:d.entry,urls:d.urls})),explore:mixed.sites.map(d=>({id:d.id,entry:d.entry,labels:d.labels}))});
  const selected=mode==='resources'?jobs.filter(j=>j.section==='fixed'&&j.dataset.id==='real-dom20'):jobs;
  save(path.join(out,'schedule.json'),selected.map(j=>({dataset:j.dataset.id,arm:j.arm,round:j.round,section:j.section})));
  for(const job of selected){
   if(performance.now()-begin>3600000)throw Error('Overall one-hour safety budget');
   const id=`${job.section}-${job.dataset.id}-${job.round}-${job.arm}`,file=path.join(out,'jobs',id+'.json');save(file,job);mixed.setRun(id);
   const execution=await execute(file,job.section==='fixed'?630000:60000),folder=path.join(out,id),r=read(path.join(folder,'result.json'));
   r.requests=mixed.requests.filter(q=>q.run===id);r.process_wall_ms=execution.wall_ms;r.isolated_process=true;save(path.join(folder,'result.json'),r);save(path.join(folder,'process.json'),execution);
   rows.push(r);save(path.join(out,'progress.json'),rows);
   // Immediate regression signal, including when the baseline finishes after a candidate.
   const cell=rows.filter(x=>x.dataset===r.dataset&&x.round===r.round&&x.section===r.section),base=cell.find(x=>x.arm===baseline);
   if(base)for(const candidate of cell.filter(x=>x.arm!==baseline)){const expected=new Map(base.evidence.map(e=>[e.url,e.hash]));const different=candidate.evidence.filter(e=>expected.has(e.url)&&expected.get(e.url)!==e.hash);
    if(different.length)console.log(JSON.stringify({regression:true,id:candidate.id,evidence_different:different.map(e=>e.url)}));}
  }
  save(path.join(out,'summary.json'),compare(rows,baseline));save(path.join(out,'completion.json'),{status:'completed',runs:rows.length,elapsed_ms:performance.now()-begin,api_calls:0});
 }catch(e){save(path.join(out,'completion.json'),{status:'failed',runs:rows.length,error:e.message,api_calls:0});throw e;}
 finally{await mixed.close();await behavior.close();if(replica)await replica.close();const after=hashes();save(path.join(out,'source-after.json'),{sources:after,unchanged:JSON.stringify(initial)===JSON.stringify(after)});}
 console.log(JSON.stringify({completed:true,out,runs:rows.length}));
}
module.exports={execute};
if(require.main===module)(process.argv[2]==='child'?child(process.argv[3]):main()).catch(e=>{console.error(e);process.exitCode=1});
