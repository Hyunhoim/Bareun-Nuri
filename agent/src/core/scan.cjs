// Checkpointed operational Pipeline; historical experiment remains separate.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {canonical,inScope,signalsFor}=require('./collect.cjs');
const {normalizeText}=require('./jamo.cjs');
const {validateDecisions}=require('./llm.cjs'),{outputResult}=require('./output.cjs');
const {choose,feedback}=require('./frontier.cjs');
const {integrateObservations}=require('./techniques.cjs');
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
   ...(ds.some(d=>d.antispoof)?{antispoof:{model:'KcElectra-AntiSpoof',version:'1.0',observations:[],predictions:[],unresolved:[{technique:null,reason:'antispoof_split_input_protected'}]}}:{}),
   techniques:[...new Set(positives.flatMap(d=>d.techniques))],observed_techniques:[...new Set(ds.flatMap(d=>d.observed_techniques||[]))],
   reason:'원문 구간별 판정 통합: '+(positives.length?'광고 근거 있음':review?'미확정 구간 있음':'전체 구간 정상')});
 }
 return {candidates,decisions};
}
async function run({dir,entry,scope,mode='fifo',limits,identity,readPage,createJudge,onProgress=()=>{},signal,scheduler,graceSeconds=0,observeTechniques=false}){
 assert(['fifo','bandit','bandit-path'].includes(mode)||scheduler?.id===mode);
 const policy=scheduler||{choose,feedback};assert(typeof policy.choose==='function'&&typeof policy.feedback==='function');
 const base=new URL(entry);assert(inScope(entry,base,scope));
 for(const k of ['pages','calls','seconds'])assert(Number.isFinite(limits[k])&&limits[k]>0,'Invalid budget '+k);
 assert(Number.isInteger(limits.pages)&&Number.isInteger(limits.calls));assert(identity,'Execution identity required');
 fs.mkdirSync(dir,{recursive:true});const lock=acquireLock(dir,'active.lock');
 let state,session,timer;
 const abort=()=>ctl.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});const begin=performance.now(),ctl=new AbortController();
 if(signal?.aborted)ctl.abort(signal.reason);
 const signature=digest({entry,scope,mode,identity,batch:16,contract:2,...(observeTechniques?{observeTechniques:true}:{})});
 const file=path.join(dir,'checkpoint.json');
 const load=()=>{const data=JSON.parse(fs.readFileSync(file));assert.equal(digest(data.state),data.sha256,'Checkpoint checksum mismatch');return data.state;};
 let baseCalls=0,baseElapsed=0;
 const persist=()=>{atomic(dir,'checkpoint.json',{sha256:digest(state),state});};
 const publish=()=>{
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
  atomic(dir,'coverage.json',{entry_url:entry,scope_origin:base.origin,scope_path:scope,status:state.status,reason:state.reason,visited:state.pages.map(p=>p.url),attempted:state.attempts,pending:state.pending,excluded:state.excluded,issues:state.issues,unjudged:state.work.slice(state.decisions.length).map(n=>({node_id:n.node_id,url:n.url,location:n.location})),undiscovered:'unknown',inflight:state.inflight});
  atomic(dir,'diagnostics.json',out.diagnostics);
  atomic(dir,'run.json',{status:state.status,reason:state.reason,pages:state.pages.length,candidates:state.candidates.length,
   judged:merged.decisions.length,work_items:state.work.length,judged_work_items:state.decisions.length,calls:state.calls,
   elapsed_sec:state.elapsed_sec,pending:state.pending,excluded:state.excluded,inflight:state.inflight,
   visited:state.visited,call_records:state.call_records,...(observeTechniques?{technique_reviews:techniqueDiagnostics.length}:{})});
  onProgress(state);
 };
 try{
  state=fs.existsSync(file)?load():{signature,entry,scope,mode,provider:identity.provider||'test',status:'partial',reason:'new',started_at:new Date().toISOString(),
   pages:[],candidates:[],work:[],decisions:[],...(observeTechniques?{technique_observations:[]}:{}),pending:[{url:canonical(entry),request_url:entry,group:'unknown',content_scope:false}],visited:[],attempts:[],excluded:[],issues:[],calls:0,call_records:[],elapsed_sec:0,inflight:null};
  assert.equal(state.signature,signature,'Cannot resume changed input/code/model/strategy');
  if(state.inflight&&['prepared','rejected'].includes(state.inflight.phase))state.inflight=null;
  if(state.inflight)throw Error('Unconfirmed in-flight judgment: automatic retry refused');
  validateDecisions({decisions:state.decisions},state.work.slice(0,state.decisions.length));
  if(state.status==='completed'){publish();return state;}
  baseCalls=state.calls;baseElapsed=state.elapsed_sec;state.status='running';state.reason=null;persist();
  if(baseElapsed>=limits.seconds){state.status='partial';state.reason='time_budget';return state;}
  const deadlineAt=Date.now()+(limits.seconds-baseElapsed)*1000;
  const expired=()=>Date.now()>=deadlineAt;
  const stopForTime=()=>{state.status='partial';state.reason='time_budget';return false;};
  timer=setTimeout(()=>ctl.abort(Error('time_budget')),(limits.seconds-baseElapsed+graceSeconds)*1000);
  session=createJudge({signal:ctl.signal,maxCalls:Math.max(0,limits.calls-baseCalls),deadlineAt,onRequestState:event=>{
   if(!state.inflight)return;
   Object.assign(state.inflight,event);persist();
  }});
  function account(){state.calls=baseCalls+session.calls.length;state.call_records=state.call_records.slice(0,baseCalls).concat(structuredClone(session.calls));}
  async function drain(final){
   while(state.work.length-state.decisions.length>=16||final&&state.work.length>state.decisions.length){
    if(expired())return stopForTime();
    ctl.signal.throwIfAborted();account();if(state.calls>=limits.calls){state.status='partial';state.reason='call_budget';return false;}
    const proposed=state.work.slice(state.decisions.length,state.decisions.length+16);
    const batch=session.fitBatch?await session.fitBatch(proposed):proposed;
    assert(batch.length>0&&batch.length<=proposed.length&&batch.every((c,i)=>c===proposed[i]),'Batch must preserve the input prefix');
    ctl.signal.throwIfAborted();
    state.inflight={ids:batch.map(c=>c.node_id),phase:session.tracksRequests?'prepared':'sent',request_started_at:new Date().toISOString()};persist();
    const decisions=await session.decide(batch);validateDecisions({decisions},batch);
    const byId=new Map(decisions.map(d=>[d.node_id,d]));state.decisions.push(...batch.map(c=>byId.get(c.node_id)));
    state.inflight=null;account();state.elapsed_sec=baseElapsed+(performance.now()-begin)/1000;persist();publish();
   }return true;
  }
  while(true){
   ctl.signal.throwIfAborted();if(!await drain(!state.pending.length))break;
   if(!state.pending.length){state.status=state.issues.length?(state.pages.length?'partial':'failed'):'completed';state.reason=state.issues.length?'collection_gaps':null;break;}
   if(expired()){stopForTime();break;}
   if(limits.memoryBytes&&process.memoryUsage().rss>=limits.memoryBytes){state.status='partial';state.reason='memory_budget';break;}
   if(state.attempts.length>=limits.pages){if(!await drain(true))break;state.status='partial';state.reason='page_budget';break;}
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
   if(limits.nodes!==0&&state.candidates.length+snapshot.candidates.length>(limits.nodes??10000)){if(!await drain(true))break;state.status='partial';state.reason='candidate_budget';break;}
   if(state.pages.some(p=>canonical(p.url)===canonical(page.url))){state.pending.splice(index,1);state.visited.push(canonical(next.url));state.attempts.push(next.url);policy.feedback(state,next,null,[]);persist();continue;}
   const oldIds=new Set(state.candidates.map(c=>c.node_id));assert(snapshot.candidates.every(c=>!oldIds.has(c.node_id)),'Repeated candidate ID');
   if(observeTechniques){
    assert(Array.isArray(snapshot.technique_observations),'Technique observations required');
    integrateObservations(snapshot,snapshot.candidates.map(c=>({node_id:c.node_id,is_violation:false,needs_review:false,techniques:[],reason:'관찰 근거 검증'})),snapshot.technique_observations);
   }
   state.pending.splice(index,1);state.visited.push(canonical(next.url));state.attempts.push(next.url);
   if(!state.visited.includes(canonical(page.url)))state.visited.push(canonical(page.url));
   state.pages.push(page);state.candidates.push(...snapshot.candidates);state.work.push(...snapshot.candidates.flatMap(splitCandidate));
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
  if(state.inflight&&['prepared','rejected'].includes(state.inflight.phase))state.inflight=null;
  state.status=ctl.signal.aborted||error.message==='time_budget'?'partial':'failed';state.reason=ctl.signal.aborted?(ctl.signal.reason?.message||'time_budget'):error.message;
  if(state.inflight)state.reason+='; unconfirmed_inflight';
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
