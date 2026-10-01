// Fixed saved work queue: real CPU + recorded API delay, never an HTTP call.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createAntiSpoof}=require('../agent/src/core/antispoof.cjs');
const {createStore}=require('../agent/src/core/bounded-scan-store.cjs');
const src=path.resolve('.runtime/phase1-full-1790774023853/scan'),out=path.resolve('.runtime/phase1-speed-postprocess-overlap-v1');
const read=f=>JSON.parse(fs.readFileSync(f)),clone=x=>JSON.parse(JSON.stringify(x));
const saved=read(path.join(src,'checkpoint.json')).state,store=createStore(src);
const responses=fs.readFileSync(path.join(src,'trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.event==='llm_response');assert.equal(responses.length,516);
const samples=Array.from({length:16},(_,i)=>Math.round(i*515/15)).map(index=>{const h=saved.batch_history[index],p=saved.pages.find(p=>p.id===h.page_id),b=p.batches.map(r=>store.read(r)).find(b=>b.ids.join()===h.ids.join()),items=store.load(p).work.filter(c=>b.ids.includes(c.node_id));assert(!b.quarantine);assert.deepEqual(items.map(x=>x.node_id),b.ids);return {index,items,decisions:b.decisions,response:responses[index],seconds:saved.call_records[index].service_sec};});
function write(file,data){fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file);}
function action(row){if(row.stage==='committed')return 'skip';if(row.stage==='cpu-pending'||row.stage==='saved-response')return 'cpu';assert.equal(row.stage,'prepared');assert(!row.sent,'Unconfirmed simulated send cannot resume');return 'send';}
function selftest(){for(const stage of ['prepared','saved-response','cpu-pending','committed']){const row=clone({stage,sent:stage!=='prepared',response:stage==='prepared'?null:{decisions:1}}),op=action(row);let sends=stage==='prepared'?0:1,commits=stage==='committed'?1:0;if(op==='send'){sends++;row.stage='saved-response';row.response={decisions:1};}if(action(row)==='cpu'){row.stage='committed';commits++;}assert.equal(sends,1);assert.equal(commits,1);assert.equal(action(clone(row)),'skip');}assert.throws(()=>action({stage:'prepared',sent:true}),/Unconfirmed/);}
async function main(){
 selftest();assert(!fs.existsSync(out),'Refusing overwrite');fs.mkdirSync(out,{recursive:true});
 const cpu=createAntiSpoof();const results=[];
 try{
  const warm=samples.find(x=>x.decisions.some(d=>d.is_violation&&!d.needs_review)),warmDecisions=clone(warm.decisions);for(const d of warmDecisions)delete d.antispoof;const wt=performance.now();await cpu.annotate(warm.items,warmDecisions);const warmup_sec=(performance.now()-wt)/1000;
  for(const overlap of [false,true]){
   const name=overlap?'overlap':'serial',dir=path.join(out,name);fs.mkdirSync(dir);const ledger=samples.map(p=>({index:p.index,stage:'prepared',sent:false}));const ledgerFile=path.join(dir,'ledger.json');const persist=()=>write(ledgerFile,ledger);persist();let sends=0,cpuSec=0,saveSec=0;const begin=performance.now(),times=[];
   async function request(i){const row=ledger[i],plan=samples[i];assert.equal(action(row),'send');row.sent=true;persist();sends++;await new Promise(r=>setTimeout(r,plan.seconds*1000));const t=performance.now();write(path.join(dir,`response-${i}.json`),plan.response);row.stage='saved-response';row.response_file=`response-${i}.json`;persist();saveSec+=(performance.now()-t)/1000;return i;}
   let pending=request(0);
   for(let i=0;i<samples.length;i++){
    assert.equal(await pending,i);assert.equal(action(ledger[i]),'cpu');
    if(overlap&&i+1<samples.length)pending=request(i+1);
    ledger[i].stage='cpu-pending';persist();const d=clone(samples[i].decisions);for(const x of d)delete x.antispoof;const ct=performance.now();await cpu.annotate(samples[i].items,d);const elapsed=(performance.now()-ct)/1000;cpuSec+=elapsed;assert.deepEqual(clone(d),clone(samples[i].decisions));
    const st=performance.now();write(path.join(dir,`decision-${i}.json`),d);ledger[i].stage='committed';ledger[i].ids=d.map(x=>x.node_id);persist();saveSec+=(performance.now()-st)/1000;times.push({index:samples[i].index,cpu_sec:elapsed,committed_elapsed_sec:(performance.now()-begin)/1000});
    if(!overlap&&i+1<samples.length)pending=request(i+1);
   }
   assert.equal(sends,16);assert(read(ledgerFile).every(r=>action(r)==='skip'));const r={name,elapsed_sec:(performance.now()-begin)/1000,cpu_sec:cpuSec,save_sec:saveSec,sends,api_calls:0,times};results.push(r);write(path.join(dir,'result.json'),r);console.log(JSON.stringify(r));
  }
  for(let i=0;i<samples.length;i++)assert.deepEqual(read(path.join(out,'serial',`decision-${i}.json`)),read(path.join(out,'overlap',`decision-${i}.json`)));
  const summary={samples:samples.map(x=>x.index),rows:samples.reduce((s,x)=>s+x.decisions.length,0),service_delay_sum_sec:samples.reduce((s,x)=>s+x.seconds,0),warmup_sec,results,saving_sec:results[0].elapsed_sec-results[1].elapsed_sec,saving_pct:(1-results[1].elapsed_sec/results[0].elapsed_sec)*100,checks:'16 equal saved requests, CPU decisions and commit order; four ledger restart states plus unconfirmed-send refusal; no real network or browser',scope:'Recorded-delay experiment only; no throughput/TPM/25-minute claim'};write(path.join(out,'summary.json'),summary);console.log(JSON.stringify(summary));
 }finally{cpu.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
