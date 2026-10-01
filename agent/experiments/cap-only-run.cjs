// Output-cap-only diagnostic. No prompt, input, batch, order, cache or production changes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const {createSession,estimateRequestTokens}=require('../src/core/llm.cjs');
const {contract}=require('../src/core/judgment.cjs');
const {configuration,verifyEvidence}=require('./replica-intent-run.cjs');
const {estimate,measured}=require('./semantic-search-run.cjs');
const project=path.resolve(__dirname,'../..'),read=f=>JSON.parse(fs.readFileSync(f));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const save=(root,name,value)=>fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(value,null,2));
const SEQUENCE=Object.freeze([{name:'A1',maxTokens:3072},{name:'B1',maxTokens:512},{name:'B2',maxTokens:512},{name:'A2',maxTokens:3072}]);
function withoutCap(body){const copy=structuredClone(body);delete copy.maxCompletionTokens;return copy;}
function compareBody(actual,expected){assert.equal(actual.maxCompletionTokens,expected.maxCompletionTokens,'Output cap drift');assert.deepEqual(actual,expected,'Actual request differs from frozen expected body');}
function definitions(argv){
 const arg=(k,d)=>argv.includes(k)?argv[argv.indexOf(k)+1]:d;
 if(argv.includes('--groups')){
  const file=path.resolve(arg('--groups')),parsed=read(file);assert(Array.isArray(parsed.groups)&&parsed.groups.length,'groups JSON requires groups array');
  return {files:[file],groups:parsed.groups.map(g=>({name:g.name,evidence:path.resolve(project,g.evidence),labels:path.resolve(project,g.labels)}))};
 }
 const data=path.resolve(arg('--data','.runtime/replica-intent-data-v1'));
 for(const split of ['dev','holdout'])verifyEvidence(data,split);
 return {files:[path.join(data,'manifest.json'),...['dev','holdout'].map(s=>path.join(data,s+'-collection-checks.json'))],
  groups:['dev','holdout'].map(name=>({name,evidence:path.join(data,name+'-evidence.json'),labels:path.join(data,name+'-labels.json')}))};
}
async function run(argv=process.argv.slice(2)){
 const arg=(k,d)=>argv.includes(k)?argv[argv.indexOf(k)+1]:d,live=argv.includes('--live');
 const sequenceName=arg('--sequence','ABBA');assert(['AB','ABBA','ABBABAAB'].includes(sequenceName),'Fixed balanced sequence required');
 const counts={A:0,B:0};
 const sequence=Array.from(sequenceName,c=>({name:c+(++counts[c]),maxTokens:c==='A'?3072:512}));
 const root=path.resolve(arg('--out','.runtime/cap-only-'+Date.now()));assert(!fs.existsSync(root),'Fresh output directory required');
 const limits={calls:Number(arg('--calls','104')),tokens:Number(arg('--tokens','1200000')),seconds:Number(arg('--seconds','3600'))};
 assert(Number.isInteger(limits.calls)&&limits.calls>0&&limits.calls<=1000,'Invalid fixed call budget');
 assert(Number.isInteger(limits.tokens)&&limits.tokens>0&&limits.tokens<=6000000,'Invalid fixed reservation budget');
 assert(Number.isFinite(limits.seconds)&&limits.seconds>0&&limits.seconds<=3600,'At most one-hour diagnostic');
 const definition=definitions(argv),names=new Set();
 const groups=definition.groups.map(g=>{
  assert(/^[A-Za-z0-9_-]+$/.test(g.name)&&!names.has(g.name),'Unique safe group name required');names.add(g.name);
  const snapshot=read(g.evidence),labels=read(g.labels),ids=new Set(snapshot.candidates.map(c=>c.node_id));
  assert.equal(ids.size,snapshot.candidates.length,'Duplicate input IDs');assert.equal(labels.length,ids.size,'One label per candidate');
  assert.equal(new Set(labels.map(l=>l.node_id)).size,ids.size);assert(labels.every(l=>ids.has(l.node_id)),'Label/input mismatch');
  return {...g,labelFile:g.labels,snapshot,labels,batches:Array.from({length:Math.ceil(snapshot.candidates.length/4)},(_,i)=>snapshot.candidates.slice(i*4,i*4+4))};
 });
 const callsPerCondition=groups.reduce((n,g)=>n+g.batches.length,0);
 assert(callsPerCondition*sequence.length<=limits.calls,'Full sequence exceeds call budget; no partial-budget trial');
 const judgment=contract(),publicConfig={provider:'hcx',model:'HCX-007',temperature:0,seed:42,reasoningEffort:'none',
  timeoutMs:180000,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:false,retryTransientTransport:false};
 const files=[...new Set([__filename,require.resolve('../src/core/judgment.cjs'),require.resolve('../src/core/llm.cjs'),
  require.resolve('../src/core/techniques.cjs'),require.resolve('./semantic-search-run.cjs'),require.resolve('./context-ownership.cjs'),
  require.resolve('./priority-one.cjs'),require.resolve('./replica-intent-run.cjs'),...definition.files,
  ...groups.flatMap(g=>[g.evidence,g.labelFile]),path.resolve(arg('--plan','docs/goal-throughput-plan.md'))])];
 const hashes=Object.fromEntries(files.map(f=>[f,sha(f)]));fs.mkdirSync(root,{recursive:true});fs.mkdirSync(path.join(root,'source-archive'));
 const archive={};files.forEach((f,i)=>{const relative=i+'-'+path.basename(f);fs.copyFileSync(f,path.join(root,'source-archive',relative));archive[f]=relative;});
 const expected=new Map();let fullReservation=0;
 for(const g of groups)for(let i=0;i<g.batches.length;i++){
  const a=await estimate(g.batches[i],{...publicConfig,maxTokens:3072},judgment),b=await estimate(g.batches[i],{...publicConfig,maxTokens:512},judgment);
  assert.deepEqual(withoutCap(a.body),withoutCap(b.body),'More than maxCompletionTokens changed');
  assert(a.tokens<=52000&&b.tokens<=52000,'Fixed batch exceeds TPM; do not silently shrink or truncate');
  expected.set(g.name+'-'+i,{3072:a,512:b});fullReservation+=(sequence.length/2)*(a.tokens+b.tokens);
 }
 assert(fullReservation<=limits.tokens,'Full sequence exceeds reservation budget');
 save(root,'manifest',{at:new Date().toISOString(),live,sequence,config:publicConfig,batch:4,limits,
  groups:groups.map(g=>({name:g.name,evidence:g.evidence,labels:g.labelFile,candidates:g.snapshot.candidates.length,calls:g.batches.length})),
  expected_calls:callsPerCondition*sequence.length,expected_reservation:fullReservation,hashes,archive,
  contract:'Unmodified current operating act4; only maxCompletionTokens differs; no cap escalation on truncation; fixed '+sequenceName+' once',
  latency:'Conditions sequential with a 61-second quota washout; no crawler or concurrent condition. Stored evidence diagnostic, not end-to-end performance.'});
 save(root,'body-parity',{verified:true,batches:expected.size,only_changed_field:'maxCompletionTokens',caps:[3072,512],api_calls:0});
 if(!live){console.log(JSON.stringify({root,api_calls:0,expected_calls:callsPerCondition*sequence.length,expected_reservation:fullReservation,body_parity:true}));return;}
 const {config:secretConfig}=configuration(),ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('experiment_deadline')),limits.seconds*1000);
 const account=path.join(project,'.runtime/semantic-last-request.json');let lastDispatch=fs.existsSync(account)?read(account).at:Date.now();
 let attempts=0,reserved=0,error=null,currentSession=null,currentName=null;const results={};
 try{
  for(const condition of sequence){
   const wait=Math.max(0,lastDispatch+61000-Date.now());console.log(JSON.stringify({phase:'quota_washout',condition:condition.name,seconds:wait/1000}));
   await delay(wait,undefined,{signal:ctl.signal});
   for(const[f,h]of Object.entries(hashes))assert.equal(sha(f),h,'Frozen source/data changed');
   const cfg={...secretConfig,...publicConfig,maxTokens:condition.maxTokens,maxCalls:callsPerCondition};
   let activeExpected=null,bodyChecks=0;
   currentName=condition.name;currentSession=createSession(cfg,{contract:judgment,signal:ctl.signal,log:e=>{
    if(e.event==='llm_request'){
     assert(activeExpected,'No active batch');compareBody(e.body,activeExpected.body);bodyChecks++;
     const n=estimateRequestTokens(e.body);assert(attempts<limits.calls&&reserved+n<=limits.tokens,'Fixed experiment budget');
     attempts++;reserved+=n;lastDispatch=Date.now();fs.writeFileSync(account,JSON.stringify({at:lastDispatch,root}));save(root,'budget',{attempts,reserved});
    }
    fs.appendFileSync(path.join(root,condition.name+'-trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n');
   }});
   const conditionStart=performance.now();
   try{for(const group of groups){
    const decisions=[],startCalls=currentSession.calls.length,started=performance.now();
    save(root,condition.name+'-'+group.name+'-batch-plan',group.batches.map(b=>b.map(c=>c.node_id)));
    for(let i=0;i<group.batches.length;i++){
     activeExpected=expected.get(group.name+'-'+i)[condition.maxTokens];
     const ds=await currentSession.decide(group.batches[i]);decisions.push(...ds);
     save(root,condition.name+'-'+group.name+'-decisions',decisions);save(root,condition.name+'-calls',currentSession.calls);
     console.log(JSON.stringify({condition:condition.name,group:group.name,processed:decisions.length,total:group.labels.length,attempts}));
    }
    results[condition.name+'-'+group.name]={...measured(group,decisions,currentSession.calls.slice(startCalls)),wall_sec:(performance.now()-started)/1000};save(root,'results',results);
   }}finally{
    save(root,condition.name+'-calls',currentSession.calls);
    save(root,condition.name+'-summary',{wall_sec:(performance.now()-conditionStart)/1000,body_checks:bodyChecks,
     calls:currentSession.calls.length,service_sec:currentSession.calls.reduce((n,c)=>n+(c.service_sec||0),0),
     queue_sec:currentSession.calls.reduce((n,c)=>n+(c.queue_wait_sec||0),0),tokens:currentSession.calls.reduce((n,c)=>n+(c.usage?.total_tokens||0),0)});
   }
  }
 }catch(e){error=String(e.message).replaceAll(secretConfig.apiKey,'[REDACTED]');}
 finally{
  clearTimeout(timer);
  const changed=Object.entries(hashes).filter(([f,h])=>!fs.existsSync(f)||sha(f)!==h).map(([f])=>f);
  save(root,'source-after',{verified:!changed.length,changed,at:new Date().toISOString()});
  if(changed.length)error ||= 'Frozen source/data changed';
  if(currentSession)save(root,currentName+'-calls',currentSession.calls);
  save(root,'completion',{status:error?'partial':'completed',error,attempts,reserved,completed_groups:Object.keys(results).length,
   expected_groups:groups.length*sequence.length,source_verified:!changed.length,no_automatic_retry:true});
  console.log(JSON.stringify({root,status:error?'partial':'completed',error,attempts,reserved}));
 }
 if(error)throw Error(error);
 return {root,results};
}
async function selfCheck(){
 const c={node_id:'n',raw_text:'문맥을 보존하는 일반 안내',normalized_text:'문맥을 보존하는 일반 안내',page_title:'자료',links:[],nearby:'주변 설명'};
 const config={provider:'hcx',model:'HCX-007',temperature:0,seed:42,reasoningEffort:'none'};
 const a=await estimate([c],{...config,maxTokens:3072},contract()),b=await estimate([c],{...config,maxTokens:512},contract());
 assert.deepEqual(withoutCap(a.body),withoutCap(b.body));assert(a.tokens-b.tokens>=2560&&a.tokens-b.tokens<=2562);compareBody(a.body,a.body);
 assert.throws(()=>compareBody({...a.body,temperature:1},a.body));assert.throws(()=>compareBody({...a.body,maxCompletionTokens:512},a.body));
 return {ok:true,api_calls:0,sequence:SEQUENCE.map(s=>s.name),only_changed_field:'maxCompletionTokens'};
}
module.exports={run,selfCheck,SEQUENCE,compareBody};
if(require.main===module)(process.argv.includes('--self-check')?selfCheck().then(x=>console.log(JSON.stringify(x))):run()).catch(e=>{console.error(e.message);process.exitCode=1;});
