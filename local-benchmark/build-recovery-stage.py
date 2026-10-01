from pathlib import Path
import shutil

root=Path('.runtime/phase2-recovery-stage/core')
root.mkdir(parents=True,exist_ok=True)
for f in Path('agent/src/core').iterdir():
    if f.is_file(): shutil.copy2(f,root/f.name)
shutil.copy2('local-benchmark/quarantine-recovery-candidate.cjs',root/'quarantine-recovery.cjs')
def edit(name, replacements):
    p=root/name;s=p.read_text(encoding='utf-8')
    for old,new in replacements:
        assert old in s,old[:100]
        s=s.replace(old,new)
    p.write_text(s,encoding='utf-8')
edit('bounded-scan-store.cjs',[
 ('page.batches.flatMap(ref=>read(ref).decisions)', '[...page.batches,...(page.recoveries||[])].flatMap(ref=>read(ref).decisions)'),
 (' function output(page,state,observe)', ''' function recover(page,ref){const b=read(ref),source=read(b.source);assert(source.quarantine);assert.deepEqual(b.ids,b.decisions.map(d=>d.node_id));const done=new Set(decisions(page).map(d=>d.node_id));assert(b.ids.every(id=>source.ids.includes(id)&&!done.has(id)));page.recoveries||=[];page.recoveries.push(ref);if(cache.has(page.id))cache.get(page.id).decisions.push(...b.decisions);page.quarantined_work-=b.ids.length;assert(page.quarantined_work>=0);page.complete=page.offset===page.work&&!page.quarantined_work;}
 function output(page,state,observe)'''),
 ('put,commit,quarantine,decisions','put,commit,quarantine,recover,decisions')])
edit('bounded-scan.cjs',[
 ("const {createStore,materialize}=require('./bounded-scan-store.cjs');", "const {createStore,materialize}=require('./bounded-scan-store.cjs');\nconst recovery=require('./quarantine-recovery.cjs');"),
 ('bounded-evidence-v5-independent-publish5','bounded-evidence-v6-recovery4-once'),
 ("const quarantined=new Set(p.batches.flatMap", "const recovered=new Set((p.recoveries||[]).flatMap(ref=>store.read(ref).ids));const quarantined=new Set(p.batches.flatMap"),
 ("quarantined.has(item.node_id)","quarantined.has(item.node_id)&&!recovered.has(item.node_id)"),
 ("inflight:state.inflight,", "inflight:state.inflight,recovery:state.recovery||null,"),
 ("  // Resume only committed batch refs.", "  assert(recovery.resumable(state),'Unconfirmed recovery request: automatic retry refused');recovery.validate(state,store);\n  // Resume only committed batch refs."),
 ("assert.equal(p.quarantined_work||0,quarantined);", "quarantined-=(p.recoveries||[]).reduce((n,ref)=>n+store.read(ref).ids.length,0);assert.equal(p.quarantined_work||0,quarantined);"),
 ("const request=judgmentConcurrency===3?requestContext.getStore():state.inflight;assert(request&&(judgmentConcurrency===1||state.inflight.requests.includes(request))", "const request=state.recovery?.inflight||(judgmentConcurrency===3?requestContext.getStore():state.inflight);assert(request&&(state.recovery?.inflight===request||judgmentConcurrency===1||state.inflight.requests.includes(request))"),
 ("account();if(!state.active.length&&!state.pending.length){state.status=", "account();if(!state.active.length&&!state.pending.length){const stopped=await recovery.recover({state,store,session,deadlineAt,limits,signal:ctl.signal,persist:()=>{account();persist();},progress,observeTechniques,validateDecisions});if(stopped){state.status='partial';state.reason=stopped;break;}for(const issue of state.issues)if(issue.reason==='incomplete_response_batch_quarantined'&&state.pages.find(p=>p.url===issue.url)?.quarantined_work===0)issue.resolved=true;state.status="),
 ("state.issues.length?", "state.issues.some(i=>!i.resolved)?"),
 ("continue;}state.status=state.issues.some(i=>!i.resolved)?(state.pages.length?'partial':'failed'):'completed';state.reason=state.issues.some(i=>!i.resolved)?(state.pages.some(p=>p.quarantined_work)?'judgment_gaps':'collection_gaps'):null;break;}", "continue;}continue;}"),
 ("if(state.inflight)state.reason+='; unconfirmed_inflight';", "if(state.inflight||state.recovery?.inflight)state.reason+='; unconfirmed_inflight';")])
print(root)
