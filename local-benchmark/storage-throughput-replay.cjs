const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve('.'),core=path.join(root,'agent/src/core'),exp=path.join(root,'agent/experiments/hcx-throughput-storage');
const sourceFile=process.env.STORAGE_SOURCE||path.join(core,'bounded-scan.cjs');const source=fs.readFileSync(sourceFile,'utf8');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const input=path.join(root,'.runtime/phase1-parallel25-1790789676712/scan'),saved=JSON.parse(fs.readFileSync(path.join(input,'checkpoint.json'))).state;
const snapshots=new Map(saved.pages.map(p=>[p.url,JSON.parse(fs.readFileSync(path.join(input,p.evidence.file)))]));
const outcomes=new Map(fs.readdirSync(path.join(input,'requests')).map(f=>{const o=JSON.parse(fs.readFileSync(path.join(input,'requests',f)));return [o.ids.join('|'),o];}));
const out=path.join(root,'.runtime/storage-throughput-'+Date.now());fs.mkdirSync(out,{recursive:true});fs.mkdirSync(exp,{recursive:true});
function prepare(candidate){let s=source.replaceAll('../../src/core/','./').replace(/require\('\.\/(.*?)'\)/g,(_,p)=>'require('+JSON.stringify(path.join(core,p))+')');
 s=s.replace('const {createStore,materialize}=', 'const {createStore:baseStore,materialize}=');
 s='const timing={};function timed(k,fn){const t=performance.now();try{return fn();}finally{timing[k]=(timing[k]||0)+performance.now()-t;}}\n'+s;
 s=s.replace('function executionSignature(',`function createStore(dir){const store=baseStore(dir);for(const key of ['read','write','output','load','commit','quarantine']){const fn=store[key];store[key]=(...args)=>timed(key,()=>fn(...args));}return store;}\nfunction executionSignature(`);
 s=s.replace('const persist=()=>store.write(',"const persist=()=>timed('persist',()=>store.write(").replace("'checkpoint_bytes_written');const account=", "'checkpoint_bytes_written'));const account=");
 s=s.replace('const account=()=>{','const account=()=>timed(\'account\',()=>{').replace('/1000;};', '/1000;});');
 s=s.replace('function publish(dir,state,store,details=false){',"function publish(dir,state,store,details=false){return timed('publish',()=>publishBody(dir,state,store,details));}\nfunction publishBody(dir,state,store,details=false){");
 if(candidate)s=s.replace('persist();publish(dir,state,store);onProgress(state);','persist();if(!state.inflight)publish(dir,state,store);onProgress(state);');
 s+='\nmodule.exports.timing=timing;';const file=path.join(exp,process.env.STORAGE_ONCE?'combined.cjs':candidate?'wave.cjs':'baseline.cjs');fs.writeFileSync(file,s);return file;
}
const files=[prepare(false),prepare(true)];
async function execute(arm,n){delete require.cache[files[arm]];const engine=require(files[arm]),dir=path.join(out,(arm?'wave':'baseline')+'-'+n);let count=0;
 const t=performance.now();const state=await engine.run({dir,entry:saved.entry,scope:'/',mode:'fifo',identity:{provider:'replay',model:'saved',source:hash(source)},limits:{pages:200,calls:375,seconds:600,nodes:0},policy:'srpt',activeWindow:8,quantum:1,aging:8,batchSize:12,collectionConcurrency:5,judgmentConcurrency:3,observeTechniques:true,
 readPage:async url=>{assert(snapshots.has(url),'Unavailable replay page '+url);return structuredClone(snapshots.get(url));},
 createJudge:({onRequestState})=>{const calls=[];return {calls,tracksRequests:true,decide:async items=>{const o=outcomes.get(items.map(c=>c.node_id).join('|'));assert(o,'Unknown replay request');const number=++count;calls.push({...structuredClone(saved.call_records[number-1]),number});onRequestState({phase:'sent',call_number:number});await Promise.resolve();onRequestState({phase:'responded',call_number:number,http_status:200});if(o.quarantine)throw Object.assign(Error('partial'),{code:'confirmed_incomplete_decisions',quarantine:structuredClone(o.quarantine)});return structuredClone(o.values);}};}});
 assert.equal(count,375);assert.equal(state.reason,'call_budget');const elapsed=performance.now()-t;return {arm:arm?'wave':'baseline',dir,elapsed_ms:elapsed,timing:engine.timing,stats:JSON.parse(fs.readFileSync(path.join(dir,'storage-metrics.json'))),state};}
async function main(){if(process.env.STORAGE_PREPARE)return;const runs=[];for(let n=0;n<(process.env.STORAGE_ONCE?1:3);n++)for(const arm of process.env.STORAGE_ONCE?[0]:(n%2?[1,0]:[0,1])){const r=await execute(arm,n);runs.push(r);fs.writeFileSync(path.join(r.dir,'timing.json'),JSON.stringify(r.timing));console.log(JSON.stringify({arm:r.arm,elapsed_ms:r.elapsed_ms,timing:r.timing}));}
 const first=runs[0];for(const r of runs){assert.deepEqual(r.state.batch_history,first.state.batch_history);for(const name of ['result.json','diagnostics.json','technique-diagnostics.json','unjudged.json']){const clean=x=>{if(x&&typeof x==='object'){delete x.elapsed_sec;delete x.started_at;delete x.finished_at;for(const v of Object.values(x))clean(v);}return x;};assert.deepEqual(clean(JSON.parse(fs.readFileSync(path.join(r.dir,name)))),clean(JSON.parse(fs.readFileSync(path.join(first.dir,name)))));}}
 const result={source_sha256:hash(source),production_unchanged:hash(fs.readFileSync(sourceFile))==hash(source),api_calls:0,equal_outputs_and_batches:true,runs:runs.map(({state,...r})=>r)};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(out);
}
main().catch(e=>{console.error(e);process.exitCode=1;});




