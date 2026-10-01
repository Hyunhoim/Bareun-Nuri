// Opt-in checkpointed Pipeline. The web worker does not import this experiment.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {canonical,inScope,signalsFor}=require('../src/core/collect.cjs');
const {normalizeText}=require('../src/core/jamo.cjs');
const {validateDecisions}=require('../src/core/llm.cjs'),{outputResult}=require('../src/core/output.cjs');
const {priority}=require('./priority.cjs');
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
function pageRole(text){
 if(/누구나.{0,20}(작성|참여)|시민.{0,20}(작성|등록)|글쓰기|제안하기|댓글 작성|의견 남기기/s.test(text))return 'user';
 if(/관리자만|담당 부서만|기관 담당자만/.test(text))return 'admin';
 return 'unknown';
}
async function run({dir,entry,scope,mode='fifo',limits,identity,readPage,createJudge}){
 assert(['fifo','priority','filter'].includes(mode));const base=new URL(entry);assert(inScope(entry,base,scope));
 for(const k of ['pages','calls','seconds'])assert(Number.isFinite(limits[k])&&limits[k]>0,'Invalid budget '+k);
 assert(Number.isInteger(limits.pages)&&Number.isInteger(limits.calls));assert(identity,'Execution identity required');
 fs.mkdirSync(dir,{recursive:true});const lock=acquireLock(dir,'active.lock');
 let state,session,timer;const begin=performance.now(),ctl=new AbortController();
 const signature=digest({entry,scope,mode,identity,batch:16});
 const file=path.join(dir,'checkpoint.json');
 const load=()=>{const data=JSON.parse(fs.readFileSync(file));assert.equal(digest(data.state),data.sha256,'Checkpoint checksum mismatch');return data.state;};
 let baseCalls=0,baseElapsed=0;
 const persist=()=>{atomic(dir,'checkpoint.json',{sha256:digest(state),state});};
 const publish=()=>{
  const merged=combine(state),out=outputResult({entry_url:entry,candidates:merged.candidates},merged.decisions,state.started_at,state.elapsed_sec,state.provider);
  atomic(dir,state.status==='completed'?'result.json':'result.partial.json',out.result);
  atomic(dir,'diagnostics.json',out.diagnostics);
  atomic(dir,'run.json',{status:state.status,reason:state.reason,pages:state.pages.length,candidates:state.candidates.length,
   judged:merged.decisions.length,work_items:state.work.length,judged_work_items:state.decisions.length,calls:state.calls,
   elapsed_sec:state.elapsed_sec,pending:state.pending,excluded:state.excluded,inflight:state.inflight,
   visited:state.visited,call_records:state.call_records});
 };
 try{
  state=fs.existsSync(file)?load():{signature,entry,scope,mode,provider:identity.provider||'test',status:'partial',reason:'new',started_at:new Date().toISOString(),
   pages:[],candidates:[],work:[],decisions:[],pending:[{url:entry,score:0}],visited:[],excluded:[],calls:0,call_records:[],elapsed_sec:0,inflight:null};
  assert.equal(state.signature,signature,'Cannot resume changed input/code/model/strategy');
  if(state.inflight)throw Error('Unconfirmed in-flight judgment: automatic retry refused');
  validateDecisions({decisions:state.decisions},state.work.slice(0,state.decisions.length));
  if(state.status==='completed'){publish();return state;}
  baseCalls=state.calls;baseElapsed=state.elapsed_sec;state.status='running';state.reason=null;persist();
  if(baseElapsed>=limits.seconds){state.status='partial';state.reason='time_budget';return state;}
  timer=setTimeout(()=>ctl.abort(Error('time_budget')),(limits.seconds-baseElapsed)*1000);
  session=createJudge({signal:ctl.signal,maxCalls:Math.max(0,limits.calls-baseCalls)});
  function account(){state.calls=baseCalls+session.calls.length;state.call_records=state.call_records.slice(0,baseCalls).concat(structuredClone(session.calls));}
  async function drain(final){
   while(state.work.length-state.decisions.length>=16||final&&state.work.length>state.decisions.length){
    ctl.signal.throwIfAborted();account();if(state.calls>=limits.calls){state.status='partial';state.reason='call_budget';return false;}
    const proposed=state.work.slice(state.decisions.length,state.decisions.length+16);
    const batch=session.fitBatch?await session.fitBatch(proposed):proposed;
    assert(batch.length>0&&batch.length<=proposed.length&&batch.every((c,i)=>c===proposed[i]),'Batch must preserve the input prefix');
    ctl.signal.throwIfAborted();
    state.inflight={ids:batch.map(c=>c.node_id),request_started_at:new Date().toISOString()};persist();
    const decisions=await session.decide(batch);validateDecisions({decisions},batch);
    const byId=new Map(decisions.map(d=>[d.node_id,d]));state.decisions.push(...batch.map(c=>byId.get(c.node_id)));
    state.inflight=null;account();state.elapsed_sec=baseElapsed+(performance.now()-begin)/1000;persist();publish();
   }return true;
  }
  while(true){
   ctl.signal.throwIfAborted();if(!await drain(!state.pending.length))break;
   if(!state.pending.length){state.status=state.excluded.length?'partial':'completed';state.reason=state.excluded.length?'filtered_scope':null;break;}
   if(state.pages.length>=limits.pages){state.status='partial';state.reason='page_budget';break;}
   if(state.calls>=limits.calls){state.status='partial';state.reason='call_budget';break;}
   // Stable array order preserves first discovery; every fourth selection prevents permanent starvation.
   let index=0;if(mode!=='fifo'&&(state.pages.length+1)%4!==0)for(let i=1;i<state.pending.length;i++)if(state.pending[i].score>state.pending[index].score)index=i;
   const next=state.pending[index],snapshot=await readPage(next.url,ctl.signal);
   ctl.signal.throwIfAborted();assert.equal(snapshot.pages.length,1,'Reader must return exactly one page');
   const page=snapshot.pages[0];assert(inScope(page.url,base,scope),'Redirect outside scope');
   assert(snapshot.candidates.every(c=>c.url===page.url),'Candidate URL mismatch');
   const oldIds=new Set(state.candidates.map(c=>c.node_id));assert(snapshot.candidates.every(c=>!oldIds.has(c.node_id)),'Repeated candidate ID');
   state.pending.splice(index,1);state.visited.push(canonical(next.url));
   if(!state.visited.includes(canonical(page.url)))state.visited.push(canonical(page.url));
   state.pages.push(page);state.candidates.push(...snapshot.candidates);state.work.push(...snapshot.candidates.flatMap(splitCandidate));
   const navigation=page.navigation;assert(navigation&&Array.isArray(navigation.links),'Navigation evidence required');
   const role=pageRole(navigation.role_text||'');page.classification=role;
   for(const link of navigation.links){
    if(!inScope(link.url,base,scope))continue;const key=canonical(link.url);
    if(state.visited.includes(key))continue;
    if(mode==='filter'&&role==='admin'&&link.content_scope){
     if(!state.pending.some(p=>canonical(p.url)===key)&&!state.excluded.some(p=>canonical(p.url)===key))state.excluded.push({url:link.url,source:page.url,reason:'admin_content_link'});
     continue;
    }
    state.excluded=state.excluded.filter(p=>canonical(p.url)!==key);
    const queued=state.pending.find(p=>canonical(p.url)===key),score=mode==='fifo'?0:priority(link);
    if(queued)queued.score=Math.max(queued.score,score);else state.pending.push({url:link.url,score});
   }
   state.pending=state.pending.filter(p=>!state.visited.includes(canonical(p.url)));
   state.elapsed_sec=baseElapsed+(performance.now()-begin)/1000;persist();publish();
  }
 }catch(error){
  if(!state||state.signature!==signature)throw error;
  state.status=ctl.signal.aborted?'partial':'failed';state.reason=ctl.signal.aborted?'time_budget':error.message;
  if(state.inflight)state.reason+='; unconfirmed_inflight';
 }finally{
  clearTimeout(timer);
  try{if(state&&state.signature===signature){
    if(session){state.calls=baseCalls+session.calls.length;state.call_records=state.call_records.slice(0,baseCalls).concat(structuredClone(session.calls));}
    state.elapsed_sec=Math.max(state.elapsed_sec,baseElapsed+(performance.now()-begin)/1000);persist();publish();
  }}finally{fs.unlinkSync(lock);}
 }
 return state;
}
module.exports={run,splitCandidate,combine,pageRole,atomic,digest,acquireLock};
