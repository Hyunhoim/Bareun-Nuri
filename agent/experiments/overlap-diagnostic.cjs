// Read-only replay of the frozen C run; no browser or API calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {selectPage}=require('../src/core/bounded-scan.cjs');
const project=path.resolve(__dirname,'../..'),root=path.join(project,'.runtime/jamo-context-live-c-v1');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f)));
const state=read('scan/checkpoint.json').state,calls=read('calls.json');
const timing=fs.readFileSync(path.join(root,'scan/collection-timing.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const collection=timing.filter(t=>t.kind==='page_collection');assert.equal(collection.length,state.pages.length);assert.equal(calls.length,state.batch_history.length);
const sim={pages:[],active:[],turn:0},admissions=[];let pageIndex=0,previousActive=0;
for(let turn=0;turn<=state.batch_history.length;turn++){
 if(sim.active.length<8&&pageIndex<state.pages.length){
  const original=state.pages[pageIndex],p={id:original.id,work:original.work,offset:0,last_turn:turn};
  sim.pages.push(p);sim.active.unshift(p.id);
  const duration=collection[pageIndex].total_ms/1000,preceding=turn?calls[turn-1].elapsed_sec:0;
  admissions.push({page_id:p.id,before_call:turn+1,collection_sec:duration,previous_active:previousActive,
   optimistic_hidden_sec:turn?Math.min(duration,preceding):0,
   slot_preserving_hidden_sec:turn&&previousActive<8?Math.min(duration,preceding):0});
  pageIndex++;
 }
 if(turn===state.batch_history.length)break;
 const selected=selectPage(sim,'srpt',8),batch=state.batch_history[turn];assert.equal(selected.id,batch.page_id,'Page choice drift');
 const index=read('scan/'+state.pages.find(p=>p.id===selected.id).index.file);
 assert.deepEqual(index.work_ids.slice(selected.offset,selected.offset+batch.ids.length),batch.ids,'Batch member/order drift');
 assert(batch.ids.length>0&&batch.ids.length<=4);previousActive=sim.active.length;
 selected.offset+=batch.ids.length;sim.turn++;selected.last_turn=sim.turn;
 sim.active=sim.active.filter(id=>id!==selected.id);if(selected.offset<selected.work)sim.active.push(selected.id);
}
assert.equal(pageIndex,state.pages.length);assert.deepEqual(sim.pages.map(p=>p.offset),state.pages.map(p=>p.offset));assert.deepEqual(sim.active,state.active);
const total=collection.reduce((n,t)=>n+t.total_ms/1000,0),upper=total-collection[0].total_ms/1000;
const result={source:root,calls:calls.length,pages:state.pages.length,collection_sec:total,
 non_initial_collection_upper_sec:upper,upper_percent_of_1500:upper/15,
 prior_call_overlap_upper_sec:admissions.reduce((n,p)=>n+p.optimistic_hidden_sec,0),
 active_slot_preserving_upper_sec:admissions.reduce((n,p)=>n+p.slot_preserving_hidden_sec,0),
 service_sec:calls.reduce((n,c)=>n+c.service_sec,0),queue_sec:calls.reduce((n,c)=>n+c.queue_wait_sec,0),
 replay:{selected_pages:calls.length,all_offsets_equal:true,active_equal:true,admission_order_equal:true,batch_members_and_order_equal:true},
 decision:'diagnostic_only_no_async_implementation',admissions,
 limitations:['Upper bounds assume known next URL and unchanged collection duration; not measured parallel execution.',
 'Does not include added visits or rate-limit effects; no F1 or unseen model predictions.',
 'Existing observed local replica only; no inference about slow remote websites.']};
const out=path.join(project,'.runtime/overlap-diagnostic-v1');fs.mkdirSync(out,{recursive:true});
const sources=[__filename,path.join(project,'docs/overlap-diagnostic-plan.md'),path.join(project,'agent/src/core/bounded-scan.cjs')];
result.source_hashes={};for(const file of sources){const rel=path.relative(project,file),dest=path.join(out,'source-archive',rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);result.source_hashes[rel]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
result.input_hashes={};for(const file of ['scan/checkpoint.json','calls.json','scan/collection-timing.jsonl'])result.input_hashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,admissions:undefined},null,2));
