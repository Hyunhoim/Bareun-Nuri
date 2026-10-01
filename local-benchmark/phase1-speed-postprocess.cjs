// Offline replay: production CPU annotation/store, saved HCX decisions, no network.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createAntiSpoof}=require('../agent/src/core/antispoof.cjs');
const storeModule=require('../agent/src/core/bounded-scan-store.cjs');
const source=path.resolve('.runtime/phase1-full-1790774023853/scan');
const out=path.resolve('.runtime/phase1-speed-postprocess-v3');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=['agent/src/worker.cjs',...fs.readdirSync('agent/src/core').filter(f=>f.endsWith('.cjs')).map(f=>'agent/src/core/'+f),'agent/antispoof/infer.py'];
const before=Object.fromEntries(files.map(f=>[f,sha(f)]));
const saved=read(path.join(source,'checkpoint.json')).state;
const byUrl=new Map(saved.pages.map(p=>[p.url,p]));
const batches=new Map(saved.pages.flatMap(p=>p.batches.map(ref=>{const b=read(path.join(source,ref.file));return [b.ids.join('|'),b];})));
const timing={store:{},batches:[],progress:[],source_failures:[]};
const originalCreate=storeModule.createStore;
storeModule.createStore=dir=>{const store=originalCreate(dir);for(const k of ['load','put','commit','quarantine','output','write','read']){const fn=store[k];store[k]=(...args)=>{const t=performance.now();try{return fn(...args);}finally{const x=timing.store[k]||={ms:0,count:0};x.ms+=performance.now()-t;x.count++;}};}return store;};
const {run}=require('../agent/src/core/bounded-scan.cjs');
function stableDecisions(ds){return JSON.parse(JSON.stringify(ds.map(d=>({...d,antispoof:d.antispoof?{...d.antispoof,predictions:d.antispoof.predictions.map(p=>({...p,probabilities:undefined}))}:undefined}))));}
async function main(){
 assert(!fs.existsSync(out),'Refusing overwrite');fs.mkdirSync(out,{recursive:true});
 const api=createAntiSpoof(),calls=[],t0=performance.now();let index=0,matching=0,probabilityMaxError=0;
 try{
 const state=await run({dir:path.join(out,'replay'),entry:saved.entry,scope:'/',mode:'fifo',identity:{provider:'hcx',model:'saved-response-cpu-replay'},observeTechniques:true,
  policy:'srpt',activeWindow:8,quantum:1,aging:8,batchSize:12,collectionConcurrency:5,
  limits:{pages:200,nodes:0,calls:600,seconds:3600},
  readPage:async url=>{assert(byUrl.has(url),'Unsaved URL');return read(path.join(source,byUrl.get(url).evidence.file));},
  createJudge:({onRequestState})=>({calls,tracksRequests:true,
   fitBatch(items){const expected=saved.batch_history[index];assert(expected);assert.deepEqual(items.slice(0,expected.ids.length).map(x=>x.node_id),expected.ids);return items.slice(0,expected.ids.length);},
   async decide(items){const current=index++,key=items.map(x=>x.node_id).join('|'),b=batches.get(key);assert(b);const t=performance.now();onRequestState({phase:'responded',http_status:200});calls.push({...saved.call_records[current]});
    if(b.quarantine){timing.batches.push({index:current,quarantined:true,annotation_ms:0});const e=Error('saved incomplete response');e.code='confirmed_incomplete_decisions';e.quarantine=b.quarantine;throw e;}
    const decisions=structuredClone(b.decisions);for(const d of decisions)delete d.antispoof;
    const at=performance.now();await api.annotate(items,decisions);const annotation_ms=performance.now()-at;
    for(let j=0;j<decisions.length;j++)if(b.decisions[j].antispoof?.unresolved.some(x=>/^antispoof_(timeout|unavailable|cancelled)/.test(x.reason))){timing.source_failures.push({index:current,node_id:decisions[j].node_id,source:b.decisions[j].antispoof,replayed:structuredClone(decisions[j].antispoof)});decisions[j].antispoof=structuredClone(b.decisions[j].antispoof);} assert.deepEqual(stableDecisions(decisions),stableDecisions(b.decisions),'CPU label/evidence regression');
    for(let j=0;j<decisions.length;j++)for(let k=0;k<(decisions[j].antispoof?.predictions.length||0);k++){const a=decisions[j].antispoof.predictions[k].probabilities,z=b.decisions[j].antispoof.predictions[k].probabilities;if(a&&z)for(let h=0;h<2;h++)for(let q=0;q<3;q++)probabilityMaxError=Math.max(probabilityMaxError,Math.abs(a[h][q]-z[h][q]));}
    matching+=decisions.length;timing.batches.push({index:current,candidates:items.length,positive:decisions.filter(x=>x.is_violation&&!x.needs_review).length,annotation_ms,total_decide_ms:performance.now()-t});
    if(index%50===0)console.log(JSON.stringify({index,elapsed_sec:(performance.now()-t0)/1000,annotation_sec:timing.batches.reduce((s,b)=>s+b.annotation_ms,0)/1000}));return decisions;
   }}),onProgress:s=>timing.progress.push({calls:s.calls,elapsed_sec:s.elapsed_sec})});
 assert.equal(state.reason,'judgment_gaps');assert.equal(index,516);assert.equal(matching,4998);assert.deepEqual(state.batch_history,saved.batch_history);
 let outputMatches=0;for(const p of state.pages){const old=saved.pages.find(x=>x.id===p.id);assert.deepEqual(read(path.join(out,'replay',p.output.file)),read(path.join(source,old.output.file)));outputMatches++;}
 for(const [f,h] of Object.entries(before))assert.equal(sha(f),h,'Production changed: '+f);
 const annotationSec=timing.batches.reduce((s,b)=>s+b.annotation_ms,0)/1000;
 // Ideal two-stage queue upper bound: all requests already available, unchanged service times, no quota or collection waits.
 let apiClock=0,cpuClock=0;for(let i=0;i<timing.batches.length;i++){apiClock+=saved.call_records[i].service_sec;cpuClock=Math.max(apiClock,cpuClock)+timing.batches[i].annotation_ms/1000;}
 const summary={api_calls:0,source,matching_nonfailed_cpu_decisions:matching-timing.source_failures.length,matching_committed_decisions_with_original_error_evidence_preserved:matching,matching_page_outputs:outputMatches,matching_page_outputs_scope:"Original CPU failures retained in commits; not equality of all fresh CPU outputs",probability_max_error:probabilityMaxError,source_antispoof_failures:timing.source_failures.length,elapsed_sec:(performance.now()-t0)/1000,annotation_sec:annotationSec,first_annotation_sec:timing.batches.find(b=>b.positive)?.annotation_ms/1000,api_service_sec:apiClock,ideal_serial_api_annotation_sec:apiClock+annotationSec,ideal_overlapped_api_annotation_sec:cpuClock,ideal_annotation_overlap_saving_sec:apiClock+annotationSec-cpuClock,store:timing.store,source_hashes:before,caveat:'Offline saved collection and responses; no API latency, browser, quota, lifecycle persistence or CPU contention measured. One model start, original run had two segments.'};
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(out,'timing.json'),JSON.stringify(timing));console.log(JSON.stringify(summary,null,2));
 }finally{api.close();}
}
main().catch(e=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:e.message,stack:e.stack,timing},null,2));console.error(e);process.exitCode=1;});



