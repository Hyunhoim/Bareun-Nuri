// Experiment only: source-keyed output repairs P's unbounded output array.
const assert=require('node:assert/strict'),base=require('./digit-position-methods.cjs'),{readings}=require('./digit-generalization-methods.cjs');
const key=p=>'p'+p.index+'_'+p.digit;
function initialEvidence(q){const e=base.initialEvidence(q);return {...e,source_ids:e.positions.map(key)};}
function modelItemSchema(ids=[]){
 assert(Array.isArray(ids)&&new Set(ids).size===ids.length);
 const properties=Object.fromEntries(ids.map(id=>{const m=/^p(0|[1-9]\d*)_([0-9])$/.exec(id);assert(m&&Number.isSafeInteger(Number(m[1])),'Invalid source position key');return [id,{type:'string',enum:['keep','unknown',...readings(m[2]).values]}];}));
 return {type:'object',properties:{marks:{type:'object',properties,required:ids,additionalProperties:false}},required:['marks'],additionalProperties:false};
}
function toArray(value,queries){
 assert(Array.isArray(value)&&value.length===queries.length);const by=new Map(queries.map(q=>[q.node_id,q]));
 return value.map(d=>{assert(d&&by.has(d.node_id));assert.deepEqual(Object.keys(d).sort(),['marks','node_id']);const q=by.get(d.node_id),ids=initialEvidence(q).source_ids;
  assert(d.marks&&typeof d.marks==='object'&&!Array.isArray(d.marks),'Source-keyed marks required');assert.deepEqual(Object.keys(d.marks).sort(),[...ids].sort(),'Wrong source position keys');
  return {node_id:d.node_id,marks:ids.map(id=>d.marks[id])};});
}
function validateModelDecisions(value,queries){base.validateModelDecisions(toArray(value,queries),queries);return value.map(d=>({node_id:d.node_id,marks:{...d.marks}}));}
function postprocess(mode,raw,queries){const checked=validateModelDecisions(raw,queries),by=new Map(checked.map(d=>[d.node_id,d]));return base.postprocess(mode,toArray(checked,queries),queries).map(d=>({...d,raw:by.get(d.node_id)}));}
function contract(){const c=base.contract(),before='같은 순서로 marks에 출력한다.',after='source_ids의 각 키에 해당하는 위치의 선택을 marks 객체에 출력한다. 키는 p인덱스_원숫자 형식이며 모든 키를 정확히 한 번 포함한다.';assert(c.SYSTEM.includes(before));return {...c,SYSTEM:c.SYSTEM.replace(before,after),initialEvidence,modelItemSchema,validateModelDecisions};}
module.exports={...base,initialEvidence,modelItemSchema,validateModelDecisions,postprocess,contract};
if(require.main===module){
 const q=base.prepare({node_id:'x',token:'2A1',target_text:'2A1 안내'}),r={node_id:'x',marks:{p2_1:'i',p0_2:'keep'}};
 assert.deepEqual(modelItemSchema(initialEvidence(q).source_ids).properties.marks.properties.p0_2.enum,['keep','unknown','z']);
 assert.equal(postprocess('P2',[r],[q])[0].restored,'2AI');assert.deepEqual(postprocess('P2',[r],[q])[0].raw,r);
 const u={node_id:'x',marks:{p0_2:'unknown',p2_1:'i'}};assert.equal(postprocess('P2',[u],[q])[0].classification,'substitution');assert.equal(postprocess('P2',[u],[q])[0].restored,null);
 for(const bad of [{node_id:'x',marks:['keep','i']},{node_id:'x',marks:{p0_2:'keep'}},{node_id:'x',marks:{p0_2:'keep',p2_1:'a'}},{node_id:'x',marks:{p0_2:'keep',p2_1:'i',p4_0:'o'}}])assert.throws(()=>validateModelDecisions([bad],[q]));
 assert.throws(()=>validateModelDecisions([r,r],[q,q]));assert.throws(()=>modelItemSchema(['p0_2','p0_2']));assert.deepEqual(modelItemSchema().required,['marks']);
 const unicode=base.prepare({node_id:'u',token:'A😀1',target_text:'A😀1'});assert.equal(postprocess('P2',[{node_id:'u',marks:{p3_1:'i'}}],[unicode])[0].restored,'A😀I');
 console.log('PASS keyed positions: exact keyset, per-digit enums, ordering independence, partial restoration, UTF16, strict IDs');
}
