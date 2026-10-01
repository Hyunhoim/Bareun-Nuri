// Post-diagnostic arithmetic, not future API or F1 prediction.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {selectPage}=require('../src/core/bounded-scan.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const source='.runtime/jamo-context-live-c-v1',s=read(source+'/scan/checkpoint.json').state,calls=read(source+'/calls.json');
const missing=read('.runtime/batch-order-v1/result.json').missing,overlap=read('.runtime/overlap-diagnostic-v1/result.json');
assert.equal(missing.length,7);
const apiAverage=calls.reduce((n,c)=>n+c.elapsed_sec,0)/calls.length,wallAverage=s.elapsed_sec/calls.length;
const estimates=[['active8_preserving',overlap.active_slot_preserving_upper_sec],['absolute_collection',overlap.non_initial_collection_upper_sec]].map(([name,sec])=>({name,seconds:sec,slots_at_mean_api:sec/apiAverage,whole_slots_at_mean_api:Math.floor(sec/apiAverage),slots_at_mean_wall:sec/wallAverage,whole_slots_at_mean_wall:Math.floor(sec/wallAverage)}));
const a=structuredClone(s),reach=[];
for(let turn=1;turn<=120&&a.active.length;turn++){
 const p=selectPage(a,'srpt',8);p.offset=Math.min(p.work,p.offset+4);a.turn++;p.last_turn=a.turn;
 a.active=a.active.filter(id=>id!==p.id);if(p.offset<p.work)a.active.push(p.id);
 for(const m of missing)if(m.page===p.id&&m.work_offset<p.offset&&!reach.some(r=>r.node_id===m.node_id))reach.push({node_id:m.node_id,first_slot_in_fixed20_scenario:turn});
}
const result={api_calls:0,average_api_elapsed_sec:apiAverage,average_wall_per_call_sec:wallAverage,estimates,
 missing:missing.map(m=>({node_id:m.node_id,page:m.page,minimum_additional_original_page_slots:m.original_batch_rank-m.page_service_slots})),
 fixed20_no_new_admission_scenario:reach,
 caveats:['Historical mean throughput is illustrative; it is not a future slot guarantee or bound.',
 'Fixed20 scenario excludes all new admissions and new snapshots, so its future order is not operational prediction.',
 'No semantic TP/F1 prediction; API quota can consume savings without additional calls.']};
const dest=path.join(root,'.runtime/overlap-diagnostic-v1/slots.json');fs.writeFileSync(dest,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
