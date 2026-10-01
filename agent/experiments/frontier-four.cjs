const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
const {run,atomic,acquireLock}=require('../src/core/scan.cjs'),{canonical,inScope}=require('../src/core/collect.cjs');
const baseline=require('../src/core/frontier.cjs'),context=require('./frontier-context.cjs');
const {createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs'),{fitBatch}=require('../src/core/request-budget.cjs');
const {score,metric}=require('./scope-score.cjs');
const modes=['fifo','bandit','context-bandit','best-first'],ids=['mixed-0','mixed-1'];
const read=p=>JSON.parse(fs.readFileSync(p)),hash=x=>crypto.createHash('sha256').update(x).digest('hex'),sha=p=>hash(fs.readFileSync(p));
const oldRoot='.runtime/scope-trial-v2';
async function prepare(root){
 fs.mkdirSync(root);const {start}=require('./scope-site.cjs'),{chromium}=require('playwright');
 const host=await start();let browser;const begin=performance.now();
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
  for(const id of ids){const data=read(path.join(oldRoot,id+'.json'));
   for(const p of data.snapshot.pages){
    await page.goto(p.url,{waitUntil:'load'});
    const observed=await page.evaluate(baseline.inspectPage);assert.deepEqual(observed,p.navigation.profile,'Original source DOM changed '+p.url);
    const links=await page.evaluate(context.inspectContext);assert.equal(links.length,observed.links.length);
    p.navigation.profile.links=p.navigation.profile.links.map((l,i)=>{assert.equal(l.url,links[i].url);assert.equal(l.text,links[i].text);return {...l,context:{...links[i].context,parent_detail:observed.detail}};});
   }
   assert.deepEqual(data.snapshot.candidates,read(path.join(oldRoot,id+'.json')).snapshot.candidates);
   atomic(root,id+'.json',data);fs.copyFileSync(path.join(oldRoot,id+'-gold.json'),path.join(root,id+'-gold.json'));
   console.log(JSON.stringify({prepared:id,pages:data.snapshot.pages.length,candidates:data.snapshot.candidates.length}));
  }
  atomic(root,'preparation.json',{seconds:(performance.now()-begin)/1000,source:oldRoot,only_navigation_context_added:true});
 }finally{await browser?.close();await host.close();}
}
function offline(data,mode,limit=Infinity,serialized=false){
 let state={pending:[{url:canonical(data.entry),group:'unknown',content_scope:false}],visited:[],attempts:[],pages:[]};
 const policy=modes.indexOf(mode)<2?baseline:context.scheduler(mode),base=new URL(data.entry);
 const start=performance.now();
 while(state.pending.length&&state.attempts.length<limit){
  const index=policy.choose(state,mode),next=state.pending.splice(index,1)[0];
  const p=data.snapshot.pages.find(p=>canonical(p.url)===next.url);assert(p,'Unavailable snapshot '+next.url);
  state.attempts.push(next.url);state.visited.push(next.url);state.pages.push(p.url);const added=[];
  for(const l of p.navigation.links){
   if(!inScope(l.url,base,'/'))continue;const key=canonical(l.url);if(state.visited.includes(key)||state.pending.some(p=>p.url===key))continue;
   const pl=p.navigation.profile.links.find(x=>canonical(x.url)===key);state.pending.push({...l,...pl,url:key});added.push(key);
  }
  policy.feedback(state,next,p.navigation.profile,added);
  if(serialized)state=JSON.parse(JSON.stringify(state));
 }
 state.scheduler_seconds=(performance.now()-start)/1000;return state;
}
function preflight(root){
 const rows=[];
 for(const id of ids){const data=read(path.join(root,id+'.json')),gold=read(path.join(root,id+'-gold.json'));
  for(const mode of modes){const all=offline(data,mode),serial=offline(data,mode,Infinity,true);
   assert.deepEqual(all.pages,serial.pages);assert.equal(new Set(all.pages).size,all.pages.length);assert.equal(all.pages.length,data.snapshot.pages.length);
   if(modes.indexOf(mode)<2){const old=read(path.join(oldRoot,id+'-'+mode,'checkpoint.json')).state;assert.deepEqual(all.pages.slice(0,12),old.pages.map(p=>p.url));}
   for(const limit of [6,12,18,24]){const s=offline(data,mode,limit);assert.deepEqual(s.pages,all.pages.slice(0,limit));
    const positive=gold.filter(g=>g.is_ad),reached=positive.filter(g=>s.pages.includes(g.page));
    rows.push({id,mode,limit,reached:reached.length,total:positive.length,recall:reached.length/positive.length,
     deep:reached.filter(g=>g.category==='deep').length,frames:reached.filter(g=>g.category==='frame').length,
     pending_ads:positive.filter(g=>!s.pages.includes(g.page)&&s.pending.some(p=>p.url===g.page)).length,
     undiscovered_ads:positive.filter(g=>!s.pages.includes(g.page)&&!s.pending.some(p=>p.url===g.page)).length,scheduler_seconds:s.scheduler_seconds,visited:s.pages});
   }
  }
 }
 atomic(root,'offline.json',{rows,full_coverage:true,serialization_parity:true,historical_baselines_equal:true});
 console.log(JSON.stringify({preflight:'passed',conditions:rows.length}));
}
function sources(root){return ['docs/frontier-four-plan.md',__filename,'agent/experiments/frontier-context.cjs','agent/experiments/scope-score.cjs','agent/experiments/scope-site.cjs',...fs.readdirSync('agent/src/core').filter(f=>fs.statSync('agent/src/core/'+f).isFile()).map(f=>'agent/src/core/'+f),...ids.flatMap(id=>[path.join(root,id+'.json'),path.join(root,id+'-gold.json')])];}
function unchanged(manifest){for(const [f,h]of Object.entries(manifest))assert.equal(sha(f),h,'Frozen source changed '+f);}
async function live(root){
 assert(read(path.join(root,'offline.json')).historical_baselines_equal);const manifest=Object.fromEntries(sources(root).map(f=>[f,sha(f)]));
 fs.writeFileSync(path.join(root,'live-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 const lock=acquireLock(root,'live.lock'),budget={requests:[]};
 const config={...configFromEnv('hcx',{...process.env,...parseEnv(fs.readFileSync('agent/.env','utf8'))}),temperature:0,seed:42,maxTokens:3072,timeoutMs:180000,maxCalls:20,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:true,retryTransientTransport:false};
 try{for(const id of ids)for(const mode of id==='mixed-0'?modes:[...modes].reverse()){
  unchanged(manifest);const data=read(path.join(root,id+'.json')),dir=path.join(root,id+'-'+mode);assert(!fs.existsSync(dir));const indices=new Map();let last='';
  console.log('BEGIN '+id+' '+mode);
  const state=await run({dir,entry:data.entry,scope:'/',mode,scheduler:modes.indexOf(mode)>1?context.scheduler(mode):undefined,
   limits:{pages:12,nodes:2000,calls:20,seconds:600},identity:{provider:'hcx',manifest},
   readPage:async url=>{const p=data.snapshot.pages.find(p=>canonical(p.url)===canonical(url));assert(p);return structuredClone({pages:[p],candidates:data.snapshot.candidates.filter(c=>c.url===p.url),collection_issues:[]});},
   createJudge:({signal,maxCalls})=>{
    const session=createSession({...config,maxCalls},{signal,log:e=>{
     if(e.event==='llm_request'){
      const reserved=estimateRequestTokens(e.body);assert(budget.requests.length<80&&budget.requests.reduce((n,r)=>n+(r.tokens??r.reserved),0)+reserved<=500000,'Shared budget exhausted');
      indices.set(e.call_number,budget.requests.length);budget.requests.push({id,mode,number:e.call_number,reserved,tokens:null});atomic(root,'budget.json',budget);
     }
     if(e.event==='llm_response'){const r=budget.requests[indices.get(e.call_number)];if(Number.isFinite(e.data?.usage?.total_tokens))r.tokens=e.data.usage.total_tokens;atomic(root,'budget.json',budget);}
     fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify(e)+'\n');
    }});session.fitBatch=items=>fitBatch(items,config);return session;
   },onProgress:s=>{const progress=JSON.stringify({id,mode,pages:s.pages.length,judged:s.decisions.length,calls:s.calls,status:s.status,reason:s.reason});if(progress!==last){console.log(progress);last=progress;}}});
  assert.equal(state.status,'partial',state.reason);assert.equal(state.reason,'page_budget');assert.equal(state.pages.length,12);assert.equal(state.work.length,state.decisions.length);assert.equal(state.issues.length,0);assert(!state.inflight);
  assert.deepEqual(state.pages.map(p=>p.url),offline(data,mode,12).pages);assert(state.call_records.every(c=>c.http_status===200&&c.status==='ok'));
  console.log('DONE '+id+' '+mode);
 }unchanged(manifest);}finally{fs.unlinkSync(lock);}
}
function report(root){
 const manifest=read(path.join(root,'live-manifest.json'));unchanged(manifest);
 const scores=ids.flatMap(id=>modes.map(mode=>score(root,id,mode))),aggregate={},comparisons=[];
 for(const mode of modes){const ss=scores.filter(s=>s.mode===mode);aggregate[mode]={};
  for(const k of ['intent','final','conservative'])aggregate[mode][k]=metric(...['tp','fp','fn'].map(n=>ss.reduce((sum,s)=>sum+s[k][n],0)));
  for(const k of ['calls','tokens','seconds','review','reached','deep','frames'])aggregate[mode][k]=ss.reduce((n,s)=>n+s[k],0);
 }
 for(const [base,variant]of [['fifo','bandit'],['fifo','context-bandit'],['fifo','best-first'],['bandit','context-bandit'],['bandit','best-first']]){
  const pairs=ids.map(id=>({a:scores.find(s=>s.id===id&&s.mode===base),b:scores.find(s=>s.id===id&&s.mode===variant)}));
  const lost=p=>p.a.rows.filter(r=>r.is_ad&&r.pred).filter(r=>{const x=p.b.rows.find(x=>x.page===r.page&&x.location===r.location);return !x.pred||r.tech.some(t=>r.techniques.includes(t)&&!x.tech.includes(t));});
  const a=aggregate[base],b=aggregate[variant];const gates={nondecrease:pairs.every(p=>['intent','final','conservative'].every(k=>p.b[k].f1>=p.a[k].f1)),precision:pairs.every(p=>['intent','final','conservative'].every(k=>p.b[k].precision>=p.a[k].precision-.02)),fp:pairs.every(p=>['intent','final','conservative'].every(k=>p.b[k].fp<=p.a[k].fp+1)),retained:pairs.every(p=>!lost(p).length),gain:b.final.f1-a.final.f1>=.02&&b.conservative.f1-a.conservative.f1>=.02,cost:b.tokens<=a.tokens*1.15&&b.seconds<=a.seconds*1.15};
  comparisons.push({base,variant,gates,pass:Object.values(gates).every(Boolean),lost:pairs.map(p=>({id:p.a.id,rows:lost(p)}))});
 }
 const settings=new Set(),inputs={},shared=[];
 for(const id of ids)for(const mode of modes){const state=read(path.join(root,id+'-'+mode,'checkpoint.json')).state,map=new Map();
  for(const e of fs.readFileSync(path.join(root,id+'-'+mode,'trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.event==='llm_request')){
   const b=e.body;settings.add(hash(JSON.stringify({system:b.messages[0],temperature:b.temperature,seed:b.seed,thinking:b.thinking,max:b.maxCompletionTokens})));
   for(const c of JSON.parse(b.messages.find(m=>m.role==='user').content).candidates){assert(!('is_ad' in c));map.set(c.node_id,hash(JSON.stringify(c)));}
  }
  assert.equal(state.issues.length,0);inputs[id+'-'+mode]=map;
 }
 assert.equal(settings.size,1);
 for(const id of ids)for(const mode of modes.slice(1)){const a=inputs[id+'-fifo'],b=inputs[id+'-'+mode],common=[...a.keys()].filter(k=>b.has(k));for(const k of common)assert.equal(a.get(k),b.get(k));shared.push({id,mode,identical:common.length});}
 const result={scores:scores.map(s=>({...s,rows:undefined})),aggregate,comparisons,shared,settings_equal:true,verified_sources:Object.keys(manifest).length};atomic(root,'comparison.json',result);console.log(JSON.stringify(result,null,2));
}
if(require.main===module){const [action,root='.runtime/frontier-four-v1']=process.argv.slice(2);Promise.resolve().then(()=>({prepare,preflight,live,report}[action]||(()=>{throw Error('prepare|preflight|live|report');}))(root)).catch(e=>{console.error(e.stack);process.exitCode=1;});}
module.exports={offline,preflight,modes,report};
