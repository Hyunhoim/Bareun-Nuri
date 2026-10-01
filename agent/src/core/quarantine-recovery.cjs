// Candidate only. One tail pass over confirmed incomplete responses; no ordinary retries.
const assert=require('node:assert/strict');
function resumable(state){const r=state.recovery?.inflight;return !r||['prepared','rejected','durable'].includes(r.phase);}
function validate(state,store){
 if(!state.recovery)return;
 const used=new Set();
 for(const p of state.pages)for(const ref of p.recoveries||[]){const b=store.read(ref),source=store.read(b.source);assert(source.quarantine);assert.equal(b.ids.length,b.decisions.length);assert.deepEqual(b.ids,b.decisions.map(d=>d.node_id));for(const id of b.ids){assert(source.ids.includes(id));assert(!used.has(id));used.add(id);}}
 const q=state.recovery.queue;assert(state.recovery.cursor>=0&&state.recovery.cursor<=q.length);
 assert.equal(new Set(q.flatMap(r=>r.ids)).size,q.reduce((n,r)=>n+r.ids.length,0));
 for(const r of q){const p=state.pages.find(p=>p.id===r.page_id);assert(p?.batches.some(b=>b.file===r.source.file&&b.sha256===r.source.sha256));const b=store.read(r.source);assert(b.quarantine);assert(r.ids.length>0&&r.ids.length<=4&&r.ids.every(id=>b.ids.includes(id)));}
 if(state.recovery.inflight)assert.deepEqual(state.recovery.inflight.ids,q[state.recovery.cursor].ids);
}
async function recover({state,store,session,deadlineAt,limits,signal,persist,progress,observeTechniques,validateDecisions}){
 assert(!state.inflight,'Ordinary request still in flight');assert.equal(state.pending.length,0);assert(state.pages.every(p=>p.offset===p.work));
 assert(resumable(state),'Unconfirmed recovery request: automatic retry refused');
 if(!state.recovery){const queue=[];for(const p of state.pages)for(const ref of p.batches){const b=store.read(ref);if(!b.quarantine)continue;assert.equal(b.decisions.length,0);assert.deepEqual(b.ids,b.quarantine.requested_ids);assert(b.quarantine.returned_decisions.length>0&&b.quarantine.returned_decisions.length<b.ids.length);for(let i=0;i<b.ids.length;i+=4)queue.push({page_id:p.id,source:ref,ids:b.ids.slice(i,i+4)});}state.recovery={queue,cursor:0,inflight:null,recovered:0,commits:[]};persist();}
 const tail=state.recovery;
 while(tail.cursor<tail.queue.length){
  if(tail.cursor>=60)return 'recovery_call_budget';
  const pending=tail.inflight;
  if(pending?.phase!=='durable'){signal.throwIfAborted();if(Date.now()>=deadlineAt)return 'time_budget';if(state.calls>=limits.calls)return 'call_budget';}
  const item=tail.queue[tail.cursor],p=state.pages.find(p=>p.id===item.page_id),by=new Map(store.load(p).work.map(c=>[c.node_id,c])),batch=item.ids.map(id=>by.get(id));assert(batch.every(Boolean));
  const r=tail.inflight||{...item,phase:'prepared'};tail.inflight=r;persist();
  if(r.phase!=='durable'){
   let outcome;
   try{const values=await session.decide(batch);validateDecisions({decisions:values},batch);outcome={decisions:values};}
   catch(e){if(e.code!=='confirmed_incomplete_decisions'||r.phase!=='responded'||r.http_status!==200)throw e;outcome={decisions:[],quarantine:e.quarantine};}
   r.outcome=store.write('recovery/outcome-'+tail.cursor+'.json',{...outcome,source:item.source,ids:item.ids},'decision_bytes_written',true);r.phase='durable';persist();
  }
  const result=store.read(r.outcome);assert.deepEqual(result.ids,item.ids);
  if(!result.quarantine){validateDecisions({decisions:result.decisions},batch);store.recover(p,r.outcome);tail.recovered+=result.ids.length;tail.commits.push({page_id:p.id,ref:r.outcome,count:result.ids.length});}
  else state.issues.push({url:p.url,reason:'recovery_incomplete_no_retry',evidence:r.outcome,missing_ids:result.quarantine.missing_ids});
  tail.cursor++;tail.inflight=null;store.output(p,state,observeTechniques);store.evict(p.id);progress();
 }
 return null;
}
module.exports={recover,resumable,validate};
