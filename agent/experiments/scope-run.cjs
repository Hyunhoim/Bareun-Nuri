const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{parseEnv}=require('node:util');
const {start}=require('./scope-site.cjs'),{collect,canonical}=require('../src/core/collect.cjs');
const {run,atomic,acquireLock}=require('../src/core/scan.cjs'),{fitBatch}=require('../src/core/request-budget.cjs');
const {createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function prepare(root){
 fs.mkdirSync(root);const host=await start();
 try{for(const s of host.sites){
  const snapshot=await collect(s.entry,{maxPages:60,maxNodes:2000,allowLongText:true,recordNavigation:true,onProgress:p=>{if(p.pages%10===0)console.log(JSON.stringify({site:s.id,phase:'collect',...p}));}});
  assert.equal(snapshot.collection_issues.length,0,JSON.stringify(snapshot.collection_issues));
  for(const l of s.labels){const cs=snapshot.candidates.filter(n=>n.url===l.page&&n.location===l.location);assert.equal(cs.length,1,l.location);assert.equal(cs[0].raw_text,l.text);}
  atomic(root,s.id+'.json',{id:s.id,entry:s.entry,snapshot});atomic(root,s.id+'-gold.json',s.labels);
  console.log(JSON.stringify({site:s.id,pages:snapshot.pages.length,candidates:snapshot.candidates.length,gold:s.labels.length,collection_sec:snapshot.collection_elapsed_sec}));
 }}finally{await host.close();}
}
async function live(root){
 const sources=['docs/crawl-contract.md',__filename,'agent/experiments/scope-site.cjs','agent/experiments/scope-score.cjs',...fs.readdirSync('agent/src/core').map(f=>'agent/src/core/'+f),...['mixed-0','mixed-1'].flatMap(id=>[path.join(root,id+'.json'),path.join(root,id+'-gold.json')])];
 const manifest=Object.fromEntries(sources.map(p=>[p,sha(p)]));fs.writeFileSync(path.join(root,'live-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 const budget={requests:[]},lock=acquireLock(root,'live.lock');
 const config={...configFromEnv('hcx',{...process.env,...parseEnv(fs.readFileSync('agent/.env','utf8'))}),temperature:0,seed:42,maxTokens:3072,timeoutMs:180000,maxCalls:20,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:true,retryTransientTransport:true};
 try{for(const id of ['mixed-0','mixed-1'])for(const mode of id==='mixed-0'?['fifo','bandit','bandit-path']:['bandit-path','bandit','fifo']){
  for(const [f,h]of Object.entries(manifest))assert.equal(sha(f),h,'Frozen source changed '+f);
  const data=read(path.join(root,id+'.json')),dir=path.join(root,id+'-'+mode);assert(!fs.existsSync(dir));const indices=new Map();let session;
  console.log('BEGIN '+id+' '+mode);
  const state=await run({dir,entry:data.entry,scope:'/',mode,limits:{pages:12,nodes:2000,calls:20,seconds:600},identity:{provider:'hcx',manifest},
   readPage:async url=>{const p=data.snapshot.pages.find(p=>canonical(p.url)===url);assert(p);return structuredClone({pages:[p],candidates:data.snapshot.candidates.filter(n=>n.url===p.url),collection_issues:[]});},
   createJudge:({signal,maxCalls})=>{
    session=createSession({...config,maxCalls},{signal,log:e=>{
     if(e.event==='llm_request'){
      const reserved=estimateRequestTokens(e.body);assert(budget.requests.length<120&&budget.requests.reduce((n,r)=>n+(r.tokens??r.reserved),0)+reserved<=800000,'Shared experiment budget');
      indices.set(e.call_number,budget.requests.length);budget.requests.push({site:id,mode,number:e.call_number,reserved,tokens:null});atomic(root,'budget.json',budget);
     }
     if(e.event==='llm_response'){const r=budget.requests[indices.get(e.call_number)];if(Number.isFinite(e.data?.usage?.total_tokens))r.tokens=e.data.usage.total_tokens;atomic(root,'budget.json',budget);}
     fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify(e)+'\n');
    }});session.fitBatch=items=>fitBatch(items,config);return session;
   },onProgress:s=>console.log(JSON.stringify({site:id,mode,pages:s.pages.length,judged:s.decisions.length,calls:s.calls,status:s.status,reason:s.reason}))});
  assert.equal(state.status,'partial');assert.equal(state.reason,'page_budget');assert.equal(state.pages.length,12);assert.equal(state.work.length,state.decisions.length);assert.equal(state.issues.length,0);
  assert(state.call_records.every(c=>c.http_status===200&&c.status==='ok'));console.log('DONE '+id+' '+mode);
 }for(const [f,h]of Object.entries(manifest))assert.equal(sha(f),h);}
 finally{fs.unlinkSync(lock);}
}
if(require.main===module){const [mode,root='.runtime/scope-trial-v1']=process.argv.slice(2);(mode==='prepare'?prepare(root):mode==='live'?live(root):Promise.reject(Error('prepare|live required'))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={prepare,live};
