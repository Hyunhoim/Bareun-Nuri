// Experimental bounded page-fair scheduler; production remains unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {canonical,inScope,signalsFor}=require('../src/core/collect.cjs');
const {normalizeText}=require('../src/core/jamo.cjs');
const {validateDecisions}=require('../src/core/llm.cjs'),{outputResult}=require('../src/core/output.cjs');
const {choose,feedback}=require('../src/core/frontier.cjs');
const {integrateObservations}=require('../src/core/techniques.cjs');
const {AsyncLocalStorage}=require('node:async_hooks');
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function atomic(dir,name,value){const p=path.join(dir,name),tmp=p+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,p);}
function acquireLock(dir,name){
 const file=path.join(dir,name),gate=file+'.gate';
 // ponytail: local-process lock; a crash inside this short gate requires manual inspection/removal.
 try{fs.mkdirSync(gate);}catch(e){if(e.code==='EEXIST')throw Error('Lock recovery already active; inspect stale gate before retry');throw e;}
 try{
 if(fs.existsSync(file)){
  const owner=JSON.parse(fs.readFileSync(file));assert(Number.isInteger(owner.pid)&&owner.pid>0,'Invalid lock owner');
  let dead=false;try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')dead=true;else throw e;}
  if(!dead)throw Error('Execution already active');fs.unlinkSync(file);
 }
 fs.writeFileSync(file,JSON.stringify({pid:process.pid,at:new Date().toISOString()}),{flag:'wx'});return file;
 }finally{fs.rmdirSync(gate);}
}
function splitCandidate(node){
 if(node.raw_text.length<=12000)return [node];
 const text=node.raw_text,parts=[];
 const boundary=n=>n>0&&/[\uD800-\uDBFF]/.test(text[n-1])&&/[\uDC00-\uDFFF]/.test(text[n])?n-1:n;
 for(let start=0;start<text.length;){
  const end=boundary(Math.min(start+6000,text.length)),raw_text=text.slice(start,end);
  const part={...node,node_id:node.node_id+'_'+start,raw_text,normalized_text:normalizeText(raw_text),
   source_node_id:node.node_id,source_start:start,source_end:end,
   nearby:{...node.nearby,chunk_before:text.slice(Math.max(0,start-400),start),chunk_after:text.slice(end,end+400),
    document_start:text.slice(0,600),document_end:text.slice(-600)}};
  part.signals=signalsFor(part);parts.push(part);if(end===text.length)break;start=boundary(end-400);
 }
 return parts;
}
function combine(state){
 const byId=new Map(state.decisions.map(d=>[d.node_id,d])),group=new Map();
 for(const item of state.work){const id=item.source_node_id||item.node_id;if(!group.has(id))group.set(id,[]);group.get(id).push(item);}
 const candidates=[],decisions=[];
 for(const node of state.candidates){
  const parts=group.get(node.node_id);if(!parts?.every(p=>byId.has(p.node_id)))continue;
  const ds=parts.map(p=>byId.get(p.node_id));candidates.push(node);
  if(parts.length===1){decisions.push({...ds[0],node_id:node.node_id});continue;}
  const positives=ds.filter(d=>d.is_violation&&!d.needs_review),review=!positives.length&&ds.some(d=>d.needs_review);
  decisions.push({node_id:node.node_id,is_violation:positives.length>0,needs_review:review,
   techniques:[...new Set(positives.flatMap(d=>d.techniques))],observed_techniques:[...new Set(ds.flatMap(d=>d.observed_techniques||[]))],
   reason:'원문 구간별 판정 통합: '+(positives.length?'광고 근거 있음':review?'미확정 구간 있음':'전체 구간 정상')});
 }
 return {candidates,decisions};
}
async function run({dir,entry,scope,mode='fifo',limits,identity,readPage,createJudge,onProgress=()=>{},signal,scheduler,graceSeconds=0,observeTechniques=false,concurrency=1}){
 assert.equal(mode,'fifo');assert(!scheduler,'Experimental throughput policy fixes FIFO');assert([1,2].includes(concurrency));
 const policy=scheduler||{choose,feedback};assert(typeof policy.choose==='function'&&typeof policy.feedback==='function');
 const base=new URL(entry);assert(inScope(entry,base,scope));
 for(const k of ['pages','calls','seconds'])assert(Number.isFinite(limits[k])&&limits[k]>0,'Invalid budget '+k);
 assert(Number.isInteger(limits.pages)&&Number.isInteger(limits.calls));assert(identity,'Execution identity required');
 fs.mkdirSync(dir,{recursive:true});const lock=acquireLock(dir,'active.lock');
 let state,session,timer;const requestContext=new AsyncLocalStorage();
 const abort=()=>ctl.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});const begin=performance.now(),ctl=new AbortController();
 if(signal?.aborted)ctl.abort(signal.reason);
 const signature=digest({entry,scope,mode,identity,batch:4,contract:3,concurrency,throughput:true,...(observeTechniques?{observeTechniques:true}:{})});
 const file=path.join(dir,'checkpoint.json');
 const load=()=>{const data=JSON.parse(fs.readFileSync(file));assert.equal(digest(data.state),data.sha256,'Checkpoint checksum mismatch');return data.state;};
 let baseCalls=0,baseElapsed=0;
 const persist=()=>{atomic(dir,'checkpoint.json',{sha256:digest(state),state});};
 const publish=()=>{
  const completedIds=new Set(state.decisions.map(d=>d.node_id));
  const merged=combine(state);let published=merged.decisions,techniqueDiagnostics=[];
  if(observeTechniques){
   const ids=new Set(merged.candidates.map(c=>c.node_id));
   const integrated=integrateObservations(merged,merged.decisions,state.technique_observations.filter(o=>ids.has(o.node_id)));
   published=integrated.decisions;techniqueDiagnostics=integrated.technique_diagnostics;
   atomic(dir,'technique-diagnostics.json',techniqueDiagnostics);
  }
  const out=outputResult({entry_url:entry,candidates:merged.candidates},published,state.started_at,state.elapsed_sec,state.provider);
  for(const diagnostic of techniqueDiagnostics){
   const old=out.diagnostics.find(d=>d.node_id===diagnostic.node_id),note='기법 확인 필요: '+[...new Set(diagnostic.reasons.map(r=>r.reason))].join(', ');
   if(old){Object.assign(old,diagnostic);old.reason+=' · '+note;}
   else out.diagnostics.push({...diagnostic,reason:note});
  }
  atomic(dir,'result.json',out.result);
  atomic(dir,'coverage.json',{entry_url:entry,scope_origin:base.origin,scope_path:scope,status:state.status,reason:state.reason,visited:state.pages.map(p=>p.url),attempted:state.attempts,pending:state.pending,excluded:state.excluded,issues:state.issues,unjudged:state.work.filter(n=>!completedIds.has(n.node_id)).map(n=>({node_id:n.node_id,url:n.url,location:n.location})),undiscovered:'unknown',inflight:state.inflight});
  atomic(dir,'diagnostics.json',out.diagnostics);
  atomic(dir,'run.json',{status:state.status,reason:state.reason,pages:state.pages.length,candidates:state.candidates.length,
   judged:merged.decisions.length,work_items:state.work.length,judged_work_items:state.decisions.length,calls:state.calls,
   elapsed_sec:state.elapsed_sec,pending:state.pending,excluded:state.excluded,inflight:state.inflight,
   visited:state.visited,call_records:state.call_records,...(observeTechniques?{technique_reviews:techniqueDiagnostics.length}:{})});
  onProgress(state);
 };
 try{
  state=fs.existsSync(file)?load():{signature,entry,scope,mode,provider:identity.provider||'test',status:'partial',reason:'new',started_at:new Date().toISOString(),
   pages:[],candidates:[],work:[],decisions:[],...(observeTechniques?{technique_observations:[]}:{}),pending:[{url:canonical(entry),request_url:entry,group:'unknown',content_scope:false}],visited:[],attempts:[],excluded:[],issues:[],calls:0,call_records:[],elapsed_sec:0,inflight:{},page_queue:[],fresh_page:null,wave_plan:[],batch_history:[],next_request:1};
  assert.equal(state.signature,signature,'Cannot resume changed input/code/model/strategy');
  for(const [id,r]of Object.entries(state.inflight))if(['prepared','rejected'].includes(r.phase))delete state.inflight[id];
  if(Object.keys(state.inflight).length)throw Error('Unconfirmed in-flight judgment: automatic retry refused');
  assert.equal(new Set(state.decisions.map(d=>d.node_id)).size,state.decisions.length);
  validateDecisions({decisions:state.decisions},state.decisions.map(d=>{const c=state.work.find(c=>c.node_id===d.node_id);assert(c,'Unknown saved decision ID');return c;}));
  if(state.status==='completed'){publish();return state;}
  baseCalls=state.calls;baseElapsed=state.elapsed_sec;state.status='running';state.reason=null;persist();
  if(baseElapsed>=limits.seconds){state.status='partial';state.reason='time_budget';return state;}
  const deadlineAt=Date.now()+(limits.seconds-baseElapsed)*1000;
  const expired=()=>Date.now()>=deadlineAt;
  const stopForTime=()=>{state.status='partial';state.reason='time_budget';return false;};
  timer=setTimeout(()=>ctl.abort(Error('time_budget')),(limits.seconds-baseElapsed+graceSeconds)*1000);
  session=createJudge({signal:ctl.signal,maxCalls:Math.max(0,limits.calls-baseCalls),deadlineAt,onRequestState:event=>{
   const id=requestContext.getStore();assert(id&&state.inflight[id],'Request lifecycle missing request_id');Object.assign(state.inflight[id],event);persist();
  }});
  function account(){state.calls=baseCalls+session.calls.length;state.call_records=state.call_records.slice(0,baseCalls).concat(structuredClone(session.calls));}
  const outstanding=url=>{const done=new Set(state.decisions.map(d=>d.node_id));return state.work.filter(c=>c.url===url&&!done.has(c.node_id));};
  function hasWork(){return state.decisions.length<state.work.length;}
  async function wave(){
   if(expired())return stopForTime();ctl.signal.throwIfAborted();account();
   if(!state.wave_plan.length){
    const available=limits.calls-state.calls;if(available<=0){state.status='partial';state.reason='call_budget';return false;}
    state.page_queue=state.page_queue.filter(url=>outstanding(url).length);
    const selected=[];if(state.fresh_page&&outstanding(state.fresh_page).length)selected.push(state.fresh_page);
    for(const url of state.page_queue)if(!selected.includes(url)&&selected.length<2)selected.push(url);
    for(const url of selected){
     const proposed=outstanding(url).slice(0,4),batch=session.fitBatch?await session.fitBatch(proposed):proposed;
     assert(batch.length&&batch.length<=4&&batch.every((c,i)=>c===proposed[i]),'Batch must preserve page prefix');
     state.wave_plan.push({request_id:'w'+state.next_request++,url,ids:batch.map(c=>c.node_id)});
    }
    persist();
   }
   const execute=async job=>{
    if(expired())throw Error('time_budget');ctl.signal.throwIfAborted();
    const batch=job.ids.map(id=>state.work.find(c=>c.node_id===id));assert(batch.every(Boolean));
    assert(batch.every(c=>!state.decisions.some(d=>d.node_id===c.node_id)),'Duplicate judgment');
    state.inflight[job.request_id]={ids:job.ids,phase:session.tracksRequests?'prepared':'sent',request_started_at:new Date().toISOString()};if(!state.batch_history.some(b=>b.request_id===job.request_id))state.batch_history.push({...job,completed:false});persist();
    const decisions=await requestContext.run(job.request_id,()=>session.decide(batch,job.request_id));validateDecisions({decisions},batch);
    const byId=new Map(decisions.map(d=>[d.node_id,d]));state.decisions.push(...batch.map(c=>byId.get(c.node_id)));delete state.inflight[job.request_id];
    state.batch_history.find(b=>b.request_id===job.request_id).completed=true;state.wave_plan=state.wave_plan.filter(p=>p.request_id!==job.request_id);
    // Queue rotation follows dispatch order below, never response completion order.
    account();state.elapsed_sec=baseElapsed+(performance.now()-begin)/1000;persist();publish();
   };
   const slots=limits.calls-state.calls;if(slots<=0){state.status='partial';state.reason='call_budget';return false;}const jobs=state.wave_plan.slice(0,slots);
   for(const job of jobs){state.page_queue=state.page_queue.filter(url=>url!==job.url);state.page_queue.push(job.url);}persist();
   if(concurrency===1){for(const job of jobs)await execute(job);}else{const outcomes=await Promise.allSettled(jobs.map(execute));const failed=outcomes.find(o=>o.status==='rejected');if(failed)throw failed.reason;}
   if(state.wave_plan.length){state.status='partial';state.reason='call_budget';persist();return false;}state.fresh_page=null;state.page_queue=state.page_queue.filter(url=>outstanding(url).length);persist();return true;
  }
  while(true){
   ctl.signal.throwIfAborted();
   if(state.wave_plan.length||state.fresh_page||(!state.pending.length||state.attempts.length>=limits.pages)&&hasWork()){
    if(!await wave())break;if(hasWork()&&(!state.pending.length||state.attempts.length>=limits.pages))continue;
   }
   if(!state.pending.length){state.status=state.issues.length?(state.pages.length?'partial':'failed'):'completed';state.reason=state.issues.length?'collection_gaps':null;break;}
   if(expired()){stopForTime();break;}
   if(limits.memoryBytes&&process.memoryUsage().rss>=limits.memoryBytes){state.status='partial';state.reason='memory_budget';break;}
   if(state.attempts.length>=limits.pages){state.status='partial';state.reason='page_budget';break;}
   if(state.calls>=limits.calls){state.status='partial';state.reason='call_budget';break;}
   const index=policy.choose(state,mode);assert(Number.isInteger(index)&&index>=0&&index<state.pending.length,'Invalid scheduler index');const next=state.pending[index];let snapshot;
   try{snapshot=await readPage(next.request_url||next.url,ctl.signal);}catch(e){
    if(ctl.signal.aborted)throw e;
    state.pending.splice(index,1);state.visited.push(canonical(next.url));state.attempts.push(next.url);
    state.issues.push({url:next.url,reason:String(e.message)});policy.feedback(state,next,null,[]);persist();publish();continue;
   }
   ctl.signal.throwIfAborted();assert.equal(snapshot.pages.length,1,'Reader must return exactly one page');
   const page=snapshot.pages[0];assert(inScope(page.url,base,scope),'Redirect outside scope');
   assert(snapshot.candidates.every(c=>c.url===page.url),'Candidate URL mismatch');
   if(limits.nodes!==0&&state.candidates.length+snapshot.candidates.length>(limits.nodes??10000)){state.status='partial';state.reason='candidate_budget';break;}
   if(state.pages.some(p=>canonical(p.url)===canonical(page.url))){state.pending.splice(index,1);state.visited.push(canonical(next.url));state.attempts.push(next.url);policy.feedback(state,next,null,[]);persist();continue;}
   const oldIds=new Set(state.candidates.map(c=>c.node_id));assert.equal(new Set(snapshot.candidates.map(c=>c.node_id)).size,snapshot.candidates.length,'Duplicate snapshot candidate ID');assert(snapshot.candidates.every(c=>!oldIds.has(c.node_id)),'Repeated candidate ID');
   if(observeTechniques){
    assert(Array.isArray(snapshot.technique_observations),'Technique observations required');
    integrateObservations(snapshot,snapshot.candidates.map(c=>({node_id:c.node_id,is_violation:false,needs_review:false,techniques:[],reason:'관찰 근거 검증'})),snapshot.technique_observations);
   }
   const newWork=snapshot.candidates.flatMap(splitCandidate);
   state.pending.splice(index,1);state.visited.push(canonical(next.url));state.attempts.push(next.url);
   if(!state.visited.includes(canonical(page.url)))state.visited.push(canonical(page.url));
   state.pages.push(page);state.candidates.push(...snapshot.candidates);state.work.push(...newWork);state.fresh_page=page.url;if(snapshot.candidates.length)state.page_queue.push(page.url);
   if(observeTechniques)state.technique_observations.push(...snapshot.technique_observations);
   const navigation=page.navigation;assert(navigation&&Array.isArray(navigation.links),'Navigation evidence required');
   state.issues.push(...(snapshot.collection_issues||[]).map(x=>({...x,source:page.url})));
   if(!page.readiness?.settled)state.issues.push({url:page.url,reason:'readiness_unconfirmed'});
   const newLinks=[];
   for(const link of navigation.links){
    if(!inScope(link.url,base,scope)){if(!state.excluded.some(x=>x.url===link.url))state.excluded.push({url:link.url,source:page.url,reason:'external_navigation'});continue;}
    const key=canonical(link.url);if(state.visited.includes(key)||state.pending.some(p=>p.url===key))continue;
    const profileLink=navigation.profile?.links.find(l=>canonical(l.url)===key);
    state.pending.push({...link,...profileLink,url:key,request_url:link.url});newLinks.push(key);
   }
   policy.feedback(state,next,navigation.profile,newLinks);
   state.pending=state.pending.filter(p=>!state.visited.includes(canonical(p.url)));
   state.elapsed_sec=baseElapsed+(performance.now()-begin)/1000;persist();publish();
  }
 }catch(error){
  if(!state||state.signature!==signature)throw error;
  for(const [id,r]of Object.entries(state.inflight))if(['prepared','rejected'].includes(r.phase))delete state.inflight[id];
  state.status=ctl.signal.aborted||error.message==='time_budget'?'partial':'failed';state.reason=ctl.signal.aborted?(ctl.signal.reason?.message||'time_budget'):error.message;
  if(Object.keys(state.inflight).length)state.reason+='; unconfirmed_inflight';
 }finally{
  clearTimeout(timer);signal?.removeEventListener('abort',abort);
  try{if(state&&state.signature===signature){
    if(session){state.calls=baseCalls+session.calls.length;state.call_records=state.call_records.slice(0,baseCalls).concat(structuredClone(session.calls));}
    state.elapsed_sec=Math.max(state.elapsed_sec,baseElapsed+(performance.now()-begin)/1000);persist();publish();
  }}finally{fs.unlinkSync(lock);}
 }
 return state;
}
module.exports={run,splitCandidate,combine,atomic,digest,acquireLock};
