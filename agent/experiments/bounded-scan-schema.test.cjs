// Tiny API/browser-free caller contract comparison; safe during paid timing runs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const core=require('../src/core/scan.cjs'),bounded=require('./bounded-scan.cjs');
const root=path.resolve('.runtime/bounded-schema-'+Date.now()),entry='http://schema.local/';
const snapshot={pages:[{url:entry,readiness:{settled:true},navigation:{links:[]}}],collection_issues:[],candidates:Array.from({length:21},(_,i)=>({node_id:'n'+i,url:entry,selector:'#n'+i,location:'#n'+i,raw_text:'일반 안내 '+i,normalized_text:'일반 안내 '+i,signals:[],links:[],frame_urls:[],ancestors:[],own_style:{}}))};
snapshot.technique_observations=snapshot.candidates.map(c=>({node_id:c.node_id,url:c.url,location:c.location,raw_text:c.raw_text,version:1,unresolved:[],observations:[]}));
global.fetch=()=>{throw Error('Network forbidden');};
const read=(dir,file)=>JSON.parse(fs.readFileSync(path.join(dir,file)));
async function main(){
 const common={entry,scope:'/',mode:'fifo',identity:{provider:'mock',code:'schema-check'},limits:{pages:10,calls:1,seconds:60,nodes:0},observeTechniques:true,readPage:async()=>structuredClone(snapshot),createJudge:()=>{const calls=[];return{calls,fitBatch:async xs=>xs.slice(0,4),decide:async xs=>{calls.push({number:1,status:'ok',usage:{total_tokens:0}});return xs.map(c=>({node_id:c.node_id,is_violation:false,needs_review:false,techniques:[],observed_techniques:[],reason:'offline'}));}};}};
 const a=path.join(root,'core'),b=path.join(root,'bounded'),old=await core.run({...common,dir:a}),fresh=await bounded.run({...common,dir:b});
 assert.equal(old.reason,'call_budget');assert.equal(fresh.reason,'call_budget');
 assert.deepEqual(fresh.batch_history.flatMap(x=>x.ids),old.decisions.map(x=>x.node_id));
 for(const name of ['diagnostics.json','technique-diagnostics.json']){assert(Array.isArray(read(b,name)));assert.deepEqual(read(a,name),read(b,name));}
 const left=read(a,'result.json'),right=read(b,'result.json');assert.deepEqual(Object.keys(right.meta).sort(),Object.keys(left.meta).sort());
 for(const key of Object.keys(left.meta).filter(k=>!['started_at','finished_at','elapsed_sec'].includes(k)))assert.deepEqual(right.meta[key],left.meta[key],key);
 assert.deepEqual(right.findings,left.findings);assert(Number.isFinite(Date.parse(right.meta.finished_at)));
 const ca=read(a,'coverage.json'),cb=read(b,'coverage.json');for(const k of Object.keys(ca))assert.deepEqual(cb[k],ca[k],'coverage.'+k);assert.equal(cb.unjudged.length,17);
 const ra=read(a,'run.json'),rb=read(b,'run.json');for(const k of Object.keys(ra).filter(k=>k!=='elapsed_sec'))assert.deepEqual(rb[k],ra[k],'run.'+k);
 assert.deepEqual(read(b,'unjudged.json'),cb.unjudged);
 const index=read(b,fresh.pages[0].index.file);assert.equal(index.work_locations.length,21);assert(!JSON.stringify(index).includes('일반 안내'));
 assert.deepEqual(bounded.materialize(b,fresh).candidates,snapshot.candidates);
 const result={status:'passed',root,api_calls:0,browser_launches:0,checks:['same 4-candidate request','result meta keys/provider tool version','diagnostic arrays','all production coverage fields including unjudged','all production run fields and types','lightweight location index without raw text','raw candidate parity']};
 fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}main().catch(e=>{console.error(e);process.exitCode=1;});
