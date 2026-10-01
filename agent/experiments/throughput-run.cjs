// Experiment only. Stored evidence comparison; this is not a crawl benchmark.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const {createSession,estimateRequestTokens}=require('../src/core/llm.cjs');
const {configuration,verifyEvidence}=require('./replica-intent-run.cjs');
const {contract,wrapSession}=require('./throughput-contract.cjs');
const {measured}=require('./semantic-search-run.cjs');
const {audit}=require('./throughput-audit.cjs');
const project=path.resolve(__dirname,'../..'),read=f=>JSON.parse(fs.readFileSync(f));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function save(root,name,value){const f=path.join(root,name+'.json');fs.writeFileSync(f+'.tmp',JSON.stringify(value,null,2));fs.renameSync(f+'.tmp',f);}
function waves(candidates,distributed){
 if(!distributed)return Array.from({length:Math.ceil(candidates.length/4)},(_,i)=>[candidates.slice(i*4,i*4+4)]);
 const pages=new Map();for(const c of candidates){if(!pages.has(c.url))pages.set(c.url,[]);pages.get(c.url).push(c);}
 const queues=[...pages.values()].map(cs=>Array.from({length:Math.ceil(cs.length/4)},(_,i)=>cs.slice(i*4,i*4+4))),out=[];let cursor=0;
 while(queues.some(q=>q.length)){const chosen=[];for(let n=0;n<queues.length&&chosen.length<2;n++){const p=(cursor+n)%queues.length;if(queues[p].length)chosen.push(p);}assert(chosen.length);out.push(chosen.map(p=>queues[p].shift()));cursor=(chosen.at(-1)+1)%queues.length;}
 return out;
}
async function main(){
 const arg=(k,d)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:d,root=path.resolve(arg('--out','.runtime/throughput-panel-v1')),data=path.join(project,'.runtime/replica-intent-data-v1');
 assert(!fs.existsSync(root),'Use fresh output');fs.mkdirSync(root,{recursive:true});
 const modes=arg('--modes','baseline,tokens,distributed,combined').split(','),groups=['dev','holdout'].map(name=>{verifyEvidence(data,name);return {name,snapshot:read(path.join(data,name+'-evidence.json')),labels:read(path.join(data,name+'-labels.json'))};});
 for(const mode of modes)assert(['baseline','tokens','distributed','combined','distributed1','combined1'].includes(mode));
 const files=[__filename,require.resolve('./throughput-contract.cjs'),require.resolve('./throughput-audit.cjs'),require.resolve('../src/core/judgment.cjs'),require.resolve('../src/core/llm.cjs'),path.join(project,'docs/throughput-plan.md'),...groups.flatMap(g=>['evidence','labels'].map(s=>path.join(data,g.name+'-'+s+'.json')))];
 const hashes=Object.fromEntries(files.map(f=>[f,sha(f)]));fs.mkdirSync(path.join(root,'source-archive'));files.forEach((f,i)=>fs.copyFileSync(f,path.join(root,'source-archive',i+'-'+path.basename(f))));
 save(root,'manifest',{at:new Date().toISOString(),hashes,modes,limits:{calls:160,reserved_tokens:1200000,seconds:3600},scope:'Previously observed 104 selected evidence positions; no browser or new holdout; page-boundary batches differ in distributed conditions.'});
 if(!process.argv.includes('--live')){save(root,'preflight',{modes:Object.fromEntries(modes.map(mode=>[mode,groups.map(g=>({split:g.name,waves:waves(g.snapshot.candidates,/distributed|combined/.test(mode)).length,calls:waves(g.snapshot.candidates,/distributed|combined/.test(mode)).flat().length}))])),api_calls:0});console.log(root);return;}
 const {config:base}=configuration(),ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('experiment_deadline')),3600000),results={};let calls=0,reserved=0,lastDispatch=0;
 try{for(const mode of modes){
  // Each condition gets its own quota window; condition wall excludes this washout.
  if(lastDispatch){console.log(JSON.stringify({phase:'quota_washout',mode}));await delay(Math.max(0,lastDispatch+61000-Date.now()),undefined,{signal:ctl.signal});}
  const compact=/tokens|combined/.test(mode),distributed=/distributed|combined/.test(mode),judgment=contract({compact}),cfg={...base,maxTokens:compact?512:3072,maxCalls:160-calls,timeoutMs:180000,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:false,retryTransientTransport:false};
  const trace=path.join(root,mode+'-trace.jsonl');let peak=0,active=0;const started=performance.now();
  const session=createSession(cfg,{contract:judgment,signal:ctl.signal,log:e=>{if(e.event==='llm_request'){const estimate=estimateRequestTokens(e.body);assert(calls<160&&reserved+estimate<=1200000,'Experiment budget');calls++;reserved+=estimate;lastDispatch=Date.now();save(root,'budget',{calls,reserved});}fs.appendFileSync(trace,JSON.stringify({at:new Date().toISOString(),...e})+'\n');}});
  const wrapped=wrapSession(session,{contract:judgment,config:cfg,enabled:compact,signal:ctl.signal});
  try{for(const g of groups){const ds=[],startCalls=session.calls.length,groupStart=performance.now(),plan=waves(g.snapshot.candidates,distributed);save(root,mode+'-'+g.name+'-batch-plan',plan.map(w=>w.map(b=>b.map(c=>c.node_id))));
   for(const wave of plan){const launch=async candidates=>{const b=await wrapped.fitBatch(candidates);assert.equal(b.length,candidates.length,'Unexpected request shrink; compare explicitly');active++;peak=Math.max(peak,active);try{const d=await wrapped.decide(b);ds.push(...d);save(root,mode+'-'+g.name+'-decisions',ds);}finally{active--;}};
    const completed=[];if(mode.endsWith('1')){for(const batch of wave)completed.push(await Promise.resolve().then(()=>launch(batch)).then(()=>({status:'fulfilled'}),reason=>({status:'rejected',reason})));}else completed.push(...await Promise.allSettled(wave.map(launch)));
    save(root,mode+'-calls',session.calls);const failure=completed.find(r=>r.status==='rejected');if(failure)throw failure.reason;
    console.log(JSON.stringify({mode,split:g.name,processed:ds.length,total:g.labels.length,calls}));
   }
   const baseFile=path.join(root,'baseline-'+g.name+'-decisions.json'),measures=measured(g,ds,session.calls.slice(startCalls)),independent=audit({snapshot:g.snapshot,labels:g.labels,decisions:ds,...(mode!=='baseline'&&fs.existsSync(baseFile)?{baselineDecisions:read(baseFile)}:{})});
   assert.deepEqual([measures.tp,measures.fp,measures.fn],[independent.tp,independent.fp,independent.fn]);results[mode+'-'+g.name]={...measures,wall_sec:(performance.now()-groupStart)/1000,independent};save(root,'results',results);
  }}finally{save(root,mode+'-calls',session.calls);save(root,mode+'-summary',{wall_sec:(performance.now()-started)/1000,peak_concurrency:peak,cache:wrapped.cacheStats,calls:session.calls.length,tokens:session.calls.reduce((n,c)=>n+(c.usage?.total_tokens||0),0)});}
 }
 for(const[f,h]of Object.entries(hashes))assert.equal(sha(f),h,'Source changed during run');save(root,'completion',{status:'completed',calls,reserved,hashes_verified:true});
 console.log(JSON.stringify({root,results:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,{tp:v.tp,fp:v.fp,fn:v.fn,f1:v.f1,wall:v.wall_sec,tokens:v.tokens}]))}));
 }catch(e){save(root,'completion',{status:'partial',error:e.message,calls,reserved});throw e;}finally{clearTimeout(timer);}
}
module.exports={waves};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
