// Experiment only: shorten request-local IDs, preserve every semantic field.
const assert=require('node:assert/strict');
const {createSession:baseSession}=require('../src/core/llm.cjs');
const {contract}=require('../src/core/judgment.cjs');
function encode(candidates){
 assert(candidates.length>0&&candidates.every(c=>typeof c.node_id==='string'&&c.node_id.length),'Missing candidate ID');
 assert.equal(new Set(candidates.map(c=>c.node_id)).size,candidates.length,'Duplicate input candidate ID');
 const ids=candidates.map(c=>c.node_id);
 return {ids,candidates:candidates.map((c,i)=>({...c,node_id:'a'+i}))};
}
function restore(decisions,ids){
 assert(Array.isArray(decisions)&&decisions.length===ids.length,'Missing decision');
 const seen=new Set();return decisions.map(d=>{
  const i=ids.findIndex((_,i)=>d.node_id==='a'+i);
  assert(i>=0&&!seen.has(i),'Unknown or duplicate output ID');seen.add(i);
  return {...d,node_id:ids[i]};
 });
}
function createSession(config,options={}){
 const session=baseSession(config,{...options,contract:options.contract||contract()});
 return {...session,async decide(candidates){
  const local=encode(candidates);
  options.log?.({event:'wire_id_mapping',mapping:local.ids.map((node_id,i)=>({wire_id:'a'+i,node_id}))});
  return restore(await session.decide(local.candidates),local.ids);
 }};
}
module.exports={createSession,createWireSession:createSession,encode,restore};
