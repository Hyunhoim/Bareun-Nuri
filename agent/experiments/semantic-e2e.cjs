// Real FIFO collection/judgment comparison. No production changes and no automatic resume.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseEnv}=require('node:util'),{setTimeout:delay}=require('node:timers/promises');
const {createCollector}=require('../src/core/collect.cjs');
const {run:scan,combine,atomic,digest}=require('../src/core/scan.cjs');
const {createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs');
const {integrateObservations}=require('../src/core/techniques.cjs');
const {outputResult}=require('../src/core/output.cjs');
const {method,batchSize,estimate}=require('./semantic-search-run.cjs');
const {start}=require('./semantic-eval-site.cjs');
const project=path.resolve(__dirname,'../..');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const limits={condition:{seconds:1500,pages:200,calls:300,nodes:0},global:{seconds:3600,calls:620,reserved_tokens:3000000},grace_seconds:210};
const metric=(tp,fp,fn)=>({tp,fp,fn,precision:tp+fp?tp/(tp+fp):0,recall:tp+fn?tp/(tp+fn):0,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):0});
const needsObservation=contract=>!Object.hasOwn(contract.modelItemSchema().properties,'observed_techniques');

function score(specs,origin,state,merged){
 const by=new Map(merged.decisions.map(d=>[d.node_id,d])),targetIds=new Set();
 const rows=specs.map(s=>{
  const url=origin+'/view/'+s.id,cs=state.candidates.filter(c=>c.url===url&&c.selector===s.selector);assert(cs.length<=1,'Ambiguous target location');
  const c=cs[0],d=c&&by.get(c.node_id);if(c){assert.equal(c.raw_text,s.raw,'Gold raw text does not match collected position');targetIds.add(c.node_id);}
  return {id:s.id,scenario:s.scenario,url,selector:s.selector,is_ad:s.is_ad,observed:s.observed,techniques:s.techniques,
   visited:state.pages.some(p=>p.url===url),collected:!!c,judged:!!d,node_id:c?.node_id,predicted:!!d?.is_violation&&!d.needs_review,decision:d};
 });
 const known=rows.filter(r=>r.is_ad!==null),intentFor=rs=>metric(rs.filter(r=>r.is_ad&&r.predicted).length,rs.filter(r=>!r.is_ad&&r.predicted).length,rs.filter(r=>r.is_ad&&!r.predicted).length);
 let tp=0,fp=0,fn=0;for(const r of known){const expected=new Set(r.techniques),actual=new Set(r.predicted?r.decision.techniques:[]);
  for(const t of actual)expected.has(t)?tp++:fp++;for(const t of expected)if(!actual.has(t))fn++;
 }
 const extras=merged.decisions.filter(d=>!targetIds.has(d.node_id)&&d.is_violation&&!d.needs_review).map(d=>({node_id:d.node_id,reason:d.reason,techniques:d.techniques}));
 return {intent:intentFor(known),final:metric(tp,fp,fn),target_count:rows.length,known_target_count:known.length,
  collected_targets:rows.filter(r=>r.collected).length,judged_targets:rows.filter(r=>r.judged).length,
  advertisement_misses:{unvisited:rows.filter(r=>r.is_ad&&!r.visited).length,visited_not_collected:rows.filter(r=>r.is_ad&&r.visited&&!r.collected).length,collected_not_judged:rows.filter(r=>r.is_ad&&r.collected&&!r.judged).length,judged_not_detected:rows.filter(r=>r.is_ad&&r.judged&&!r.predicted).length},
  observed_techniques:{correct:rows.filter(r=>r.judged&&JSON.stringify([...(r.decision.observed_techniques||[])].sort())===JSON.stringify([...r.observed].sort())).length,total:rows.length,judged:rows.filter(r=>r.judged).length},
  ambiguous:{total:rows.filter(r=>r.is_ad===null).length,explicit_uncertain:rows.filter(r=>r.is_ad===null&&r.decision?.raw_ad_verdict==='uncertain').length,predicted_ad:rows.filter(r=>r.is_ad===null&&r.predicted).length},
  normal_review:rows.filter(r=>r.is_ad===false&&r.decision?.needs_review).length,
  by_scenario:Object.fromEntries([...new Set(rows.map(r=>r.scenario))].map(s=>[s,intentFor(known.filter(r=>r.scenario===s))])),
  non_target_positives_unverified:extras,rows};
}

async function fit(items,config,contract,size){
 const proposed=items.slice(0,size);assert(proposed.length,'Empty batch');
 if((await estimate(proposed,config,contract)).tokens<=config.tokensPerMinute)return proposed;
 let low=1,high=proposed.length-1,best=0;
 while(low<=high){const n=Math.floor((low+high)/2);if((await estimate(proposed.slice(0,n),config,contract)).tokens<=config.tokensPerMinute){best=n;low=n+1;}else high=n-1;}
 assert(best,'One full candidate exceeds token budget; input is not truncated');return proposed.slice(0,best);
}

async function run(mode,{out=path.join(project,'.runtime','semantic-e2e-'+Date.now())}={}){
 assert(typeof mode==='string'&&/^[A-Za-z][A-Za-z0-9-]*$/.test(mode)&&mode!=='O','Select one non-baseline mode');
 assert(!/low/i.test(mode),'This end-to-end plan fixes reasoning none; Low modes require a separately frozen plan and runner');method(mode);
 assert.equal(mode,'act4','This final comparison freezes the selected act4 staging implementation');
 const staged=path.join(project,'.runtime/semantic-worker-stage/agent/src'),stagedScan=require(path.join(staged,'core/scan.cjs')).run;
 const root=path.resolve(out),plan=path.join(project,'docs/semantic-e2e-plan.md');
 assert(fs.existsSync(plan),'Freeze docs/semantic-e2e-plan.md before the paid comparison');assert(!fs.existsSync(root),'Use a new output directory');fs.mkdirSync(root,{recursive:true});
 const files=[__filename,require.resolve('./semantic-eval-site.cjs'),require.resolve('./semantic-search-run.cjs'),require.resolve('./semantic-methods.cjs'),require.resolve('./semantic-passage.cjs'),require.resolve('./semantic-reference.cjs'),require.resolve('./semantic-act.cjs'),require.resolve('./semantic-intent-contract.cjs'),require.resolve('./context-ownership.cjs'),require.resolve('./priority-one.cjs'),plan,
  path.join(project,'docs/semantic-act4-selection.md'),path.join(project,'.runtime/semantic-final-selection.json'),
  ...['extra-labels.json','primary-labels-unchanged.json','manifest.json'].map(f=>path.join(project,'.runtime/semantic-e2e-extra-gold-v1',f)),
  ...fs.readdirSync(path.join(project,'agent/src/core')).filter(f=>/\.(cjs|json)$/.test(f)).map(f=>path.join(project,'agent/src/core',f)),
  path.join(staged,'worker.cjs'),...fs.readdirSync(path.join(staged,'core')).filter(f=>/\.(cjs|json)$/.test(f)).map(f=>path.join(staged,'core',f))];
 const hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),frozen=()=>{for(const[f,h]of Object.entries(hashes))assert.equal(sha(f),h,'Frozen source changed '+f);};
 const archive=path.join(root,'source-archive');fs.mkdirSync(archive);for(const f of files){const name=path.relative(project,f);fs.mkdirSync(path.dirname(path.join(archive,name)),{recursive:true});fs.copyFileSync(f,path.join(archive,name));}
 const save=(n,v)=>atomic(root,n+'.json',v),env={...process.env,...parseEnv(fs.readFileSync(path.join(project,'agent/.env'),'utf8'))};
 const config={...configFromEnv('hcx',env),temperature:0,seed:42,maxTokens:3072,timeoutMs:180000,maxCalls:300,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:false,retryTransientTransport:false};
 const accountFile=path.join(project,'.runtime/semantic-last-request.json');
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('Global experiment deadline')),limits.global.seconds*1000),wallStart=performance.now();
 const budget={attempts:0,reserved_tokens:0,known_tokens:0},results={},runs={};let host,activeCollector;
 try{
  host=await start();save('labels',host.specs.map(({html,...s})=>({...s,url:host.origin+'/view/'+s.id})));
  save('manifest',{created_at:new Date().toISOString(),origin:host.origin,order:['O',mode],limits,hashes,
   settings:{...config,apiKey:undefined},batch:{O:batchSize('O'),[mode]:batchSize(mode)},observe_techniques:{O:needsObservation(method('O')),[mode]:needsObservation(method(mode))},automatic_resume:false,
   shared_account_cooldown_seconds:61,requires_no_concurrent_diagnostic_process:true,
   note:'All collected candidates are judged. Only 80 declared target positions carry gold labels; remaining positives are unverified. Joint contracts keep model techniques. Only semantic-only contracts collect observations and integrate them offline after raw core output.'});
  for(const key of ['O',mode]){
   if(key!=='O')await delay(61000,undefined,{signal:ctl.signal});
   if(fs.existsSync(accountFile)){const previous=JSON.parse(fs.readFileSync(accountFile)),at=Number(previous.at);assert(Number.isFinite(at)&&at>0,'Invalid shared-account request timestamp');await delay(Math.max(0,61000-(Date.now()-at)),undefined,{signal:ctl.signal});}
   frozen();
   const dir=path.join(root,key);fs.mkdirSync(dir);const contract=method(key),observe=needsObservation(contract),observations=new Map(),conditionStart=performance.now();let state,session,closeError;
   activeCollector=await createCollector({channel:env.BROWSER_CHANNEL||'msedge',onTiming:event=>fs.appendFileSync(path.join(dir,'collection-timing.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n')});
   try{
    state=await (key==='O'?scan:stagedScan)({dir,entry:host.origin+'/',scope:'/',mode:'fifo',observeTechniques:observe,limits:{...limits.condition,memoryBytes:768*1024*1024},graceSeconds:limits.grace_seconds,
     identity:{provider:'hcx',model:'HCX-007',contract:key,code:digest(hashes),settings:{...config,apiKey:undefined},batch:batchSize(key),observeTechniques:observe},signal:ctl.signal,
     readPage:async(url,signal)=>{
      const snapshot=await activeCollector.collect(url,{entryUrl:host.origin+'/',scope:'/',followLinks:false,recordNavigation:true,allowLongText:true,allowEmpty:true,maxPages:1,maxNodes:10000,observeTechniques:observe,signal});
      for(const o of snapshot.technique_observations||[]){if(observations.has(o.node_id))assert.deepEqual(observations.get(o.node_id),o,'Observation changed for repeated candidate');observations.set(o.node_id,o);}
      if(observe)atomic(dir,'observations.json',[...observations.values()]);return snapshot;
     },
     createJudge:({signal,maxCalls,deadlineAt,onRequestState})=>{
      session=createSession({...config,maxCalls},{contract,signal,deadlineAt,onRequestState,log:event=>{
       if(event.event==='llm_request'){frozen();const reserve=estimateRequestTokens(event.body);assert(budget.attempts<limits.global.calls&&budget.reserved_tokens+reserve<=limits.global.reserved_tokens,'Global request/token budget');budget.attempts++;budget.reserved_tokens+=reserve;save('budget',budget);atomic(path.dirname(accountFile),path.basename(accountFile),{at:Date.now(),root});}
       if(event.event==='llm_response'){budget.known_tokens+=event.data?.usage?.total_tokens||0;save('budget',budget);}
       fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n');
      }});
      session.fitBatch=items=>fit(items,config,contract,batchSize(key));return session;
     },
     onProgress:s=>{if(s.calls!==runs[key]?.lastCalls||s.pages.length!==runs[key]?.lastPages){console.log(JSON.stringify({root,key,pages:s.pages.length,candidates:s.candidates.length,judged:s.decisions.length,calls:s.calls,status:s.status,reason:s.reason}));runs[key]={lastCalls:s.calls,lastPages:s.pages.length};}}
    });
   }finally{
    let closeTimer;try{await Promise.race([activeCollector.close(),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error('Collector cleanup deadline')),30000);})]);}catch(e){closeError=e.message;}finally{clearTimeout(closeTimer);activeCollector=null;}
   }
   assert(state,'Core scan did not return a state');const wallSec=(performance.now()-conditionStart)/1000,merged=combine(state);
   atomic(dir,'evidence.json',{entry_url:host.origin+'/',pages:state.pages,candidates:state.candidates});atomic(dir,'semantic-decisions.json',merged.decisions);
   const measured=score(host.specs,host.origin,state,merged),calls=state.call_records;
   if(observe){
    const selected=merged.candidates.map(c=>observations.get(c.node_id));assert(selected.every(Boolean),'Missing original-candidate observation');
    const integrated=integrateObservations(merged,merged.decisions,selected);
    integrated.decisions.forEach((d,i)=>{const {techniques,observed_techniques,...after}=d,{techniques:t,observed_techniques:o,...before}=merged.decisions[i];assert.deepEqual(after,before,'Observation integration changed semantic judgment');});
    measured.observer=score(host.specs,host.origin,state,{candidates:merged.candidates,decisions:integrated.decisions});measured.observer.technique_diagnostics=integrated.technique_diagnostics;
    atomic(dir,'integrated-decisions.json',integrated.decisions);atomic(dir,'technique-diagnostics.json',integrated.technique_diagnostics);
    const integratedResult=outputResult({entry_url:host.origin+'/',candidates:merged.candidates},integrated.decisions,state.started_at,wallSec,'hcx').result;
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'result.json'))).findings,integratedResult.findings,'Staged publication differs from independent integration');
    atomic(dir,'integrated-result.json',integratedResult);
   }
   Object.assign(measured,{status:state.status,reason:state.reason,technique_source:observe?'code_observer_offline':'model',wall_sec:wallSec,active_core_sec:state.elapsed_sec,within_30_minutes:wallSec<=1800,cleanup_error:closeError||null,
    pages:state.pages.length,candidates:state.candidates.length,judged_work_items:state.decisions.length,calls:calls.length,
    tokens:calls.every(c=>Number.isFinite(c.usage?.total_tokens))?calls.reduce((n,c)=>n+c.usage.total_tokens,0):null,
    known_tokens:calls.reduce((n,c)=>n+(c.usage?.total_tokens||0),0),service_sec:calls.reduce((n,c)=>n+(c.service_sec||0),0),queue_sec:calls.reduce((n,c)=>n+(c.queue_wait_sec||0),0),
    pending_urls:state.pending.map(p=>p.request_url||p.url),visited_urls:state.pages.map(p=>p.url),attempts:state.attempts,unjudged:state.work.slice(state.decisions.length).map(c=>c.node_id),inflight:state.inflight,
    resume:{checkpoint:path.join(dir,'checkpoint.json'),automatic:false,requires:'Same frozen code, contract, source data and origin; restarting at a new port is not equivalent.'}});
   atomic(dir,'score.json',measured);results[key]=measured;runs[key]={state,merged};save('results',results);
   if(closeError||state.inflight||state.status==='failed'||calls.some(c=>c.status!=='ok'))throw Error('Condition failed or has unconfirmed request; no automatic retry: '+key);
  }
  const a=runs.O.state,b=runs[mode].state,byA=new Map(a.candidates.map(c=>[c.node_id,c])),byB=new Map(b.candidates.map(c=>[c.node_id,c]));
  const common=[...byA.keys()].filter(id=>byB.has(id)),mismatches=common.filter(id=>{const x=byA.get(id),y=byB.get(id);return ['url','selector','location','raw_text','normalized_text'].some(k=>x[k]!==y[k]);});
  const aRows=results.O.rows,bRows=new Map(results[mode].rows.map(r=>[r.id,r]));
  save('comparison',{collection:{common_candidates:common.length,mismatches,only_baseline:[...byA.keys()].filter(id=>!byB.has(id)),only_variant:[...byB.keys()].filter(id=>!byA.has(id)),same_visit_order:JSON.stringify(a.pages.map(p=>p.url))===JSON.stringify(b.pages.map(p=>p.url)),same_pending_urls:JSON.stringify(results.O.pending_urls)===JSON.stringify(results[mode].pending_urls)},
   lost_baseline_ads:aRows.filter(r=>r.is_ad&&r.predicted&&!bRows.get(r.id).predicted).map(r=>r.id),recovered_ads:results[mode].rows.filter(r=>r.is_ad&&r.predicted&&!aRows.find(a=>a.id===r.id).predicted).map(r=>r.id),
   semantic_f1_delta:results[mode].intent.f1-results.O.intent.f1,note:'Baseline uses current core; act4 uses frozen staged core including observation checkpoint and publication. Independent offline integration matches staged findings. No resume was executed in this paid run.'});
  assert.equal(mismatches.length,0,'Common collected text/location changed');frozen();
  save('completion',{status:'completed',budget,wall_sec:(performance.now()-wallStart)/1000,conditions:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,{status:v.status,reason:v.reason,wall_sec:v.wall_sec,f1:v.intent.f1}]))});
  return {root,results};
 }catch(e){save('failure',{error:e.message,budget,wall_sec:(performance.now()-wallStart)/1000,completed_conditions:Object.keys(results)});throw e;
 }finally{clearTimeout(timer);if(activeCollector)await activeCollector.close();if(host)await host.close();}
}

function check(){
 const specs=[{id:'ad',selector:'p#a',raw:'광고',is_ad:true,scenario:'ad',observed:['JAMO'],techniques:['JAMO']},{id:'normal',selector:'p#n',raw:'정상',is_ad:false,scenario:'normal',observed:[],techniques:[]}];
 const state={pages:[{url:'http://local/view/normal'}],candidates:[{node_id:'n',url:'http://local/view/normal',selector:'p#n',raw_text:'정상'}]};
 const got=score(specs,'http://local',state,{candidates:state.candidates,decisions:[{node_id:'n',is_violation:false,needs_review:false,techniques:[],observed_techniques:[],reason:'정상'}]});
 assert.equal(got.intent.fn,1);assert.equal(got.final.fn,1);assert.equal(got.advertisement_misses.unvisited,1);assert.equal(got.observed_techniques.correct,1);assert.equal(got.non_target_positives_unverified.length,0);
 assert.equal(needsObservation(method('O')),false);assert.equal(needsObservation(method('passage')),true);
 assert.equal(batchSize('reference4'),4);assert.equal(batchSize('reference8'),8);assert.equal(batchSize('O'),16);
 console.log('PASS e2e score: unvisited advertisements count as FN; incomplete collection is not complete accuracy');
}
module.exports={run};
if(require.main===module){if(!process.argv.includes('--live'))check();else{const arg=(k,d)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:d;run(arg('--mode'),{out:arg('--out',path.join(project,'.runtime','semantic-e2e-'+Date.now()))}).then(r=>console.log(JSON.stringify({root:r.root,completed:true}))).catch(e=>{console.error(e);process.exitCode=1;});}}
