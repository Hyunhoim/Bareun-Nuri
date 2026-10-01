// Experimental bounded three-request waves. Production sources are unchanged.
const {AsyncLocalStorage}=require('node:async_hooks');
const requestContext=new AsyncLocalStorage();
// Disk-backed FIFO collection with bounded pending-page judgment scheduling.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {digest,acquireLock}=require('../../src/core/scan.cjs');
const {canonical,inScope}=require('../../src/core/collect.cjs');
const {validateDecisions}=require('../../src/core/llm.cjs');
const {outputResult}=require('../../src/core/output.cjs');
const {integrateObservations}=require('../../src/core/techniques.cjs');
const {createStore,materialize}=require('../../src/core/bounded-scan-store.cjs');
function executionSignature({entry,scope='/',identity,policy='rr',activeWindow=2,quantum=1,aging=8,observeTechniques=false,batchSize=4,collectionConcurrency=1}){return digest({entry,scope,identity,policy,activeWindow,quantum:String(quantum),aging,observeTechniques,format:'experimental-three-wave-v1',batch:batchSize,collectionConcurrency});}
function selectPage(state,policy,aging,batchSize=4){const pages=state.active.map(id=>state.pages.find(p=>p.id===id));if(policy==='rr'||policy==='drain')return pages[0];const aged=pages.filter(p=>state.turn-p.last_turn>=aging);return (aged.length?aged.sort((a,b)=>a.last_turn-b.last_turn||a.id.localeCompare(b.id)):pages.sort((a,b)=>Math.ceil((a.work-a.offset)/batchSize)-Math.ceil((b.work-b.offset)/batchSize)||a.id.localeCompare(b.id)))[0];}
function publish(dir,state,store,details=false){
 const meta={entry_url:state.entry,status:state.status,reason:state.reason,started_at:state.started_at,elapsed_sec:state.elapsed_sec,collection_concurrency:state.collection_concurrency};
 function stream(name,field,extra){const file=path.join(dir,name),temp=file+'.tmp',fd=fs.openSync(temp,'w');let count=0;try{fs.writeSync(fd,field==='findings'?JSON.stringify(extra).slice(0,-1)+',"'+field+'":[':'[');for(const semantic of field==='diagnostics'?[true,false]:[null])for(const p of state.pages){if(!p.output)continue;const rows=store.read(p.output)[field]||[];for(const row of rows){if(semantic!==null&&Object.hasOwn(row,'needs_review')!==semantic)continue;const value=field==='findings'?{...row,id:'f_'+String(count+1).padStart(4,'0')}:row;fs.writeSync(fd,(count?',':'')+JSON.stringify(value));count++;}}fs.writeSync(fd,field==='findings'?']}':']');}finally{fs.closeSync(fd);}fs.renameSync(temp,file);store.stats.output_bytes_written+=fs.statSync(file).size;return count;}
 const resultMeta=outputResult({entry_url:state.entry,candidates:[]},[],state.started_at,state.elapsed_sec,state.provider).result.meta;stream('result.json','findings',{meta:resultMeta});stream('diagnostics.json','diagnostics',{meta});const techniqueReviews=stream('technique-diagnostics.json','technique_diagnostics',{meta});
 const coverage={...meta,scope_origin:new URL(state.entry).origin,scope_path:state.scope,pending:state.pending,visited:state.pages.map(p=>p.url),attempted:state.attempts,excluded:state.excluded,issues:state.issues,undiscovered:'unknown',inflight:state.inflight,
 unjudged_pages:state.pages.filter(p=>!p.complete).map(p=>({url:p.url,work_offset:p.offset,work_total:p.work,quarantined_work:p.quarantined_work||0,evidence:p.evidence})),unjudged_locations_file:details?'unjudged.json':null};
 function unjudged(name,metadata){const file=path.join(dir,name),temp=file+'.tmp',fd=fs.openSync(temp,'w');let count=0;try{fs.writeSync(fd,metadata?JSON.stringify(metadata).slice(0,-1)+',"unjudged":[':'[');for(const p of state.pages.filter(p=>!p.complete)){const locations=store.read(p.index).work_locations;assert.equal(locations.length,p.work);const quarantined=new Set(p.batches.flatMap(ref=>{const b=store.read(ref);return b.quarantine?b.ids:[];}));for(const item of locations.filter((item,i)=>i>=p.offset||quarantined.has(item.node_id)))fs.writeSync(fd,(count++?',':'')+JSON.stringify(item));}fs.writeSync(fd,metadata?']}':']');}finally{fs.closeSync(fd);}fs.renameSync(temp,file);store.stats.output_bytes_written+=fs.statSync(file).size;}
 unjudged('coverage.json',coverage);if(details)unjudged('unjudged.json');store.write('run.json',{...meta,pages:state.pages.length,candidates:state.pages.reduce((n,p)=>n+p.candidates,0),judged:state.pages.reduce((n,p)=>n+(p.judged_candidates||0),0),work_items:state.pages.reduce((n,p)=>n+p.work,0),judged_work_items:state.pages.reduce((n,p)=>n+p.offset-(p.quarantined_work||0),0),quarantined_work_items:state.pages.reduce((n,p)=>n+(p.quarantined_work||0),0),calls:state.calls,pending:state.pending,excluded:state.excluded,inflight:state.inflight,visited:state.visited,call_records:state.call_records,...(state.observe_techniques?{technique_reviews:techniqueReviews}:{}),active_pages:state.active.length},'output_bytes_written');
}
async function run({dir,entry,scope='/',mode='fifo',limits,identity,readPage,createJudge,onProgress=()=>{},signal,graceSeconds=0,observeTechniques=false,policy='rr',activeWindow=2,quantum=1,aging=8,batchSize=4,collectionConcurrency=1}){
 assert(Number.isInteger(collectionConcurrency)&&collectionConcurrency>=1&&collectionConcurrency<=5);
 assert(Number.isInteger(batchSize)&&batchSize>=1&&batchSize<=16);assert.equal(mode,'fifo');assert(['rr','drain','srpt'].includes(policy));assert([1,2,8].includes(activeWindow));assert(policy!=='drain'||activeWindow===1);assert([1,4].includes(quantum)||policy==='drain'&&quantum===Infinity);assert.equal(aging,8);assert(identity);for(const k of ['pages','calls','seconds'])assert(Number.isFinite(limits[k])&&limits[k]>0);assert(Number.isInteger(limits.pages)&&Number.isInteger(limits.calls));const base=new URL(entry);assert(inScope(entry,base,scope));fs.mkdirSync(dir,{recursive:true});const lock=acquireLock(dir,'active.lock'),store=createStore(dir),ctl=new AbortController(),abort=()=>ctl.abort(signal.reason),begin=performance.now();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();let timer,state,session,baseCalls=0,baseElapsed=0;
 const signature=executionSignature({entry,scope,identity,policy,activeWindow,quantum,aging,observeTechniques,batchSize,collectionConcurrency});
 const persist=()=>store.write('checkpoint.json',{sha256:digest(state),state},'checkpoint_bytes_written');const account=()=>{if(session){state.calls=baseCalls+session.calls.length;state.call_records=state.call_records.slice(0,baseCalls).concat(structuredClone(session.calls));}state.elapsed_sec=baseElapsed+(performance.now()-begin)/1000;};const progress=()=>{account();persist();publish(dir,state,store);onProgress(state);};
 try{
  const cp=path.join(dir,'checkpoint.json');if(fs.existsSync(cp)){const old=JSON.parse(fs.readFileSync(cp));assert.equal(digest(old.state),old.sha256);state=old.state;assert.equal(state.signature,signature,'Cannot resume changed input/code/model/strategy');}else state={signature,entry,scope,provider:identity.provider||'test',status:'partial',reason:'new',started_at:new Date().toISOString(),elapsed_sec:0,pages:[],active:[],turn:0,pending:[{url:canonical(entry),request_url:entry}],visited:[],attempts:[],excluded:[],issues:[],calls:0,call_records:[],inflight:null,batch_history:[],service_page:null,remaining_quantum:0};
  state.observe_techniques=observeTechniques;state.collection_concurrency=collectionConcurrency;baseCalls=state.calls;baseElapsed=state.elapsed_sec;
  if(state.inflight){assert.equal(state.inflight.phase,'wave');if(state.inflight.requests.some(r=>!['prepared','rejected','durable'].includes(r.phase)))throw Error('Unconfirmed in-flight judgment: automatic retry refused');}
  // Resume only committed batch refs. No all-site evidence materialization.
  for(const p of state.pages){let count=0,quarantined=0;const ids=store.read(p.index).work_ids;for(const ref of p.batches){const b=store.read(ref);assert(b.ids.length>0);assert.deepEqual(b.ids,ids.slice(count,count+b.ids.length));if(b.quarantine){assert.equal(b.offset,count);assert.deepEqual(b.decisions,[]);assert.deepEqual(b.quarantine.requested_ids,b.ids);const returned=b.quarantine.returned_decisions.map(d=>d.node_id);assert.equal(new Set(returned).size,returned.length);assert(returned.length>0&&returned.length<b.ids.length&&returned.every(id=>b.ids.includes(id)));assert.deepEqual(b.quarantine.missing_ids,b.ids.filter(id=>!returned.includes(id)));assert.equal(typeof b.quarantine.raw_content,'string');quarantined+=b.ids.length;}else assert.deepEqual(b.ids,b.decisions.map(d=>d.node_id));count+=b.ids.length;}assert.equal(p.offset,count);assert.equal(p.quarantined_work||0,quarantined);assert.equal(p.complete,p.offset===p.work&&!quarantined);assert(p.offset<=p.work);assert.equal(state.active.includes(p.id),p.offset<p.work);} 
  if(state.status==='completed'){publish(dir,state,store,true);return state;}
  state.status='running';state.reason=null;const deadlineAt=Date.now()+Math.max(0,limits.seconds-baseElapsed)*1000;timer=setTimeout(()=>ctl.abort(Error('time_budget')),Math.max(0,limits.seconds-baseElapsed+graceSeconds)*1000);
  session=createJudge({signal:ctl.signal,maxCalls:Math.max(0,limits.calls-baseCalls),deadlineAt,onRequestState:event=>{const request=requestContext.getStore();assert(request&&state.inflight.requests.includes(request),'Unowned lifecycle event');Object.assign(request,event);account();persist();}});
  while(true){
   account();if(!state.active.length&&!state.pending.length){state.status=state.issues.length?(state.pages.length?'partial':'failed'):'completed';state.reason=state.issues.length?(state.pages.some(p=>p.quarantined_work)?'judgment_gaps':'collection_gaps'):null;break;}ctl.signal.throwIfAborted();if(Date.now()>=deadlineAt){state.status='partial';state.reason='time_budget';break;}if(state.calls>=limits.calls){state.status='partial';state.reason='call_budget';break;}
   // FIFO waves use only vacant judgment slots; commit in dispatch order.
   if(!state.inflight&&!state.service_page&&state.active.length<activeWindow&&state.pending.length&&state.attempts.length<limits.pages){
    if(limits.memoryBytes&&process.memoryUsage().rss>=limits.memoryBytes){state.status='partial';state.reason='memory_budget';break;}
    store.trim(0);
    const wave=state.pending.slice(0,Math.min(collectionConcurrency,activeWindow-state.active.length,limits.pages-state.attempts.length));
    const collected=await Promise.all(wave.map(async next=>{try{const snapshot=await readPage(next.request_url||next.url,ctl.signal);return {next,snapshot,accepted:!ctl.signal.aborted&&Date.now()<deadlineAt};}catch(error){return {next,error};}}));
    for(const item of collected){const {next,error}=item;let snapshot=item.snapshot;item.snapshot=null;
    if(error){if(ctl.signal.aborted||Date.now()>=deadlineAt)continue;state.pending=state.pending.filter(p=>p.url!==next.url);state.attempts.push(next.url);state.visited.push(next.url);state.issues.push({url:next.url,reason:error.message});progress();continue;}
    // Completed evidence survives cancellation of another page in this wave.
    if(!item.accepted)continue;
    assert.equal(snapshot.pages.length,1);const page=snapshot.pages[0];assert(inScope(page.url,base,scope),'Redirect outside scope');assert(snapshot.candidates.every(c=>c.url===page.url));assert.equal(new Set(snapshot.candidates.map(c=>c.node_id)).size,snapshot.candidates.length);assert(Array.isArray(page.navigation?.links),'Navigation evidence required');
    if(state.pages.some(p=>canonical(p.url)===canonical(page.url))){state.pending=state.pending.filter(p=>p.url!==next.url);state.attempts.push(next.url);state.visited.push(next.url);progress();continue;}
    if(limits.nodes!==0&&state.pages.reduce((n,p)=>n+p.candidates,0)+snapshot.candidates.length>(limits.nodes??10000)){state.status='partial';state.reason='candidate_budget';break;}
    if(observeTechniques)integrateObservations(snapshot,snapshot.candidates.map(c=>({node_id:c.node_id,is_violation:false,needs_review:false,techniques:[],reason:'관찰 검증'})),snapshot.technique_observations);
    const nextIds=new Set(snapshot.candidates.map(c=>c.node_id));for(const previous of state.pages)assert(store.read(previous.index).candidate_ids.every(id=>!nextIds.has(id)),'Repeated candidate ID');const saved=store.put(snapshot,state.pages.length);saved.last_turn=state.turn;saved.complete=saved.work===0;
    state.pending=state.pending.filter(p=>p.url!==next.url);state.attempts.push(next.url);state.visited.push(canonical(next.url));if(!state.visited.includes(canonical(page.url)))state.visited.push(canonical(page.url));state.pages.push(saved);if(!saved.complete)state.active.unshift(saved.id);
    for(const link of page.navigation.links){if(!inScope(link.url,base,scope)){if(!state.excluded.some(x=>x.url===link.url))state.excluded.push({url:link.url,source:page.url,reason:'external_navigation'});continue;}const url=canonical(link.url);if(!state.visited.includes(url)&&!state.pending.some(x=>x.url===url))state.pending.push({...link,url,request_url:link.url});}
    state.pending=state.pending.filter(p=>!state.visited.includes(p.url));state.issues.push(...(snapshot.collection_issues||[]).map(x=>({...x,source:page.url})));if(!page.readiness?.settled)state.issues.push({url:page.url,reason:'readiness_unconfirmed'});snapshot=null;progress();
    }
    if(state.reason==='candidate_budget')break;
    ctl.signal.throwIfAborted();
   }
   if(!state.active.length){if(state.pending.length){if(state.attempts.length>=limits.pages){state.status='partial';state.reason='page_budget';break;}continue;}state.status=state.issues.length?(state.pages.length?'partial':'failed'):'completed';state.reason=state.issues.length?(state.pages.some(p=>p.quarantined_work)?'judgment_gaps':'collection_gaps'):null;break;}

   if(!state.inflight){
    const shadow=structuredClone(state),requests=[];
    for(let n=0;n<3&&shadow.active.length&&state.calls+requests.length<limits.calls;n++){
     const p=selectPage(shadow,policy,aging,batchSize),actual=state.pages.find(x=>x.id===p.id),work=store.load(actual).work;
     const proposed=work.slice(p.offset,p.offset+batchSize),batch=session.fitBatch?await session.fitBatch(proposed):proposed;
     assert(batch.length&&batch.length<=batchSize&&batch.every((c,i)=>c===proposed[i]));
     requests.push({request_id:'q'+state.turn+'-'+n,page_id:p.id,offset:p.offset,ids:batch.map(c=>c.node_id),phase:'prepared'});
     p.offset+=batch.length;shadow.turn++;p.last_turn=shadow.turn;shadow.active=shadow.active.filter(id=>id!==p.id);if(p.offset<p.work)shadow.active.push(p.id);
    }
    assert(requests.length);state.inflight={phase:'wave',requests};account();persist();
   }
   const wave=state.inflight.requests;
   const outcomes=await Promise.all(wave.map(r=>requestContext.run(r,async()=>{
    if(r.phase==='durable')return store.read(r.outcome);
    const p=state.pages.find(x=>x.id===r.page_id),batch=store.load(p).work.slice(r.offset,r.offset+r.ids.length);assert.deepEqual(batch.map(c=>c.node_id),r.ids);
    try{
     let outcome;
     try{const values=await session.decide(batch);validateDecisions({decisions:values},batch);outcome={values};}
     catch(error){if(error.code!=='confirmed_incomplete_decisions'||r.phase!=='responded'||r.http_status!==200)throw error;outcome={quarantine:{...error.quarantine,call_number:r.call_number}};}
     r.outcome=store.write('requests/'+r.request_id+'.json',{...outcome,ids:r.ids},'decision_bytes_written',true);r.phase='durable';account();persist();return store.read(r.outcome);
    }catch(error){return {error:error.message};}
   })));
   for(let i=0;i<wave.length;i++){
    const r=wave[i],result=outcomes[i];if(result.error)throw Error(result.error);
    const selected=state.pages.find(p=>p.id===r.page_id);assert.equal(selected.offset,r.offset);assert.equal(selectPage(state,policy,aging,batchSize).id,selected.id);
    const batch=store.load(selected).work.slice(r.offset,r.offset+r.ids.length);assert.deepEqual(result.ids,r.ids);
    const quarantined=!!result.quarantine;
    if(quarantined){const ref=store.quarantine(selected,batch,result.quarantine);state.issues.push({url:selected.url,reason:'incomplete_response_batch_quarantined',quarantined_ids:r.ids,missing_ids:result.quarantine.missing_ids,evidence:ref});}
    else{validateDecisions({decisions:result.values},batch);const by=new Map(result.values.map(d=>[d.node_id,d]));store.commit(selected,batch,batch.map(c=>by.get(c.node_id)));}
    state.batch_history.push({page_id:selected.id,ids:r.ids,...(quarantined?{quarantined:true}:{})});state.turn++;selected.last_turn=state.turn;account();store.output(selected,state,observeTechniques);
    state.service_page=null;state.remaining_quantum=0;state.active=state.active.filter(id=>id!==selected.id);if(selected.offset<selected.work)state.active.push(selected.id);else store.evict(selected.id);
    state.inflight=i+1<wave.length?{phase:'wave',requests:wave.slice(i+1)}:null;progress();
   }

  }
 }catch(e){if(!state||state.signature!==signature)throw e;if(state.inflight&&['prepared','rejected'].includes(state.inflight.phase))state.inflight=null;state.status=ctl.signal.aborted||e.message==='time_budget'?'partial':'failed';state.reason=ctl.signal.aborted?ctl.signal.reason?.message:e.message;if(state.inflight)state.reason+='; unconfirmed_inflight';
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);try{if(state&&state.signature===signature){account();persist();publish(dir,state,store,true);store.write('storage-metrics.json',{...store.stats,active_window:activeWindow,loaded_pages_limit:2},'output_bytes_written');}}finally{fs.unlinkSync(lock);}}
 return state;
}
module.exports={run,selectPage,materialize,executionSignature};
