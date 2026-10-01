from pathlib import Path
root=Path(__file__).resolve().parent.parent
dst=root/'agent/experiments/phase1-parallel'
dst.mkdir(exist_ok=True)
def replace(s,a,b):
    assert s.count(a)==1,a[:100]
    return s.replace(a,b)
s=(root/'agent/src/core/bounded-scan.cjs').read_text(encoding='utf-8')
s=s.replace("require('./", "require('../../src/core/")
s="// Experimental bounded three-request waves. Production sources are unchanged.\nconst {AsyncLocalStorage}=require('node:async_hooks');\nconst requestContext=new AsyncLocalStorage();\n"+s
s=s.replace("format:'bounded-evidence-v3-quarantine'", "format:'experimental-three-wave-v1'")
s=replace(s,"if(state.inflight&&['prepared','rejected'].includes(state.inflight.phase))state.inflight=null;if(state.inflight)throw Error('Unconfirmed in-flight judgment: automatic retry refused');", "if(state.inflight){assert.equal(state.inflight.phase,'wave');if(state.inflight.requests.some(r=>!['prepared','rejected','durable'].includes(r.phase)))throw Error('Unconfirmed in-flight judgment: automatic retry refused');}")
s=replace(s,"onRequestState:event=>{assert(state.inflight,'Unexpected lifecycle event');Object.assign(state.inflight,event);account();persist();}","onRequestState:event=>{const request=requestContext.getStore();assert(request&&state.inflight.requests.includes(request),'Unowned lifecycle event');Object.assign(request,event);account();persist();}")
s=replace(s,"if(!state.service_page&&state.active.length<activeWindow", "if(!state.inflight&&!state.service_page&&state.active.length<activeWindow")
start=s.index('   const selected=state.service_page?')
end=s.index('\n  }\n }catch(e)',start)
s=s[:start]+r'''
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
''' +s[end:]
(dst/'bounded-scan.cjs').write_text(s,encoding='utf-8')
w=(root/'agent/src/worker.cjs').read_text(encoding='utf-8')
w=replace(w,"require('./core/bounded-scan.cjs')","require('./bounded-scan.cjs')")
w=w.replace("require('./core/", "require('../../src/core/")
w=replace(w,"fs.readFileSync(__filename,'utf8'),...", "fs.readFileSync(__filename,'utf8'),fs.readFileSync(path.join(__dirname,'bounded-scan.cjs'),'utf8'),...")
w=replace(w,"path.join(__dirname,'core',f)", "path.resolve(__dirname,'../../src/core',f)")
w=replace(w,"path.join(__dirname,'core/antispoof.cjs')", "path.resolve(__dirname,'../../src/core/antispoof.cjs')")
w=replace(w,"if(previous?.state.inflight&&!['prepared','rejected'].includes(previous.state.inflight.phase))", "if(previous?.state.inflight&&(previous.state.inflight.phase!=='wave'||previous.state.inflight.requests.some(r=>!['prepared','rejected','durable'].includes(r.phase))))")
w=replace(w,"tracked.decide=async items=>antiSpoof.annotate(items,await decide(items));", "let cpu=Promise.resolve();tracked.decide=async items=>{const values=await decide(items);const result=cpu.then(()=>antiSpoof.annotate(items,values));cpu=result.catch(()=>{});return result;};")
(dst/'worker.cjs').write_text(w,encoding='utf-8')
print(dst)
