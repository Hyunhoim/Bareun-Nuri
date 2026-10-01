// Experiment only: same D semantics and complete-reading input, classification-only output.
const assert=require('node:assert/strict'),complete=require('./digit-complete-method.cjs');
const original=complete.contract().SYSTEM;
const readingInstruction='substitution이면 reading에 해당 r키를, literal/uncertain이면 none을 출력한다. readings_truncated가 true이거나 후보 중 근거 있는 읽기가 없으면 substitution으로 확정하지 않는다.';
const evidenceInstruction='evidence에는 판정 근거가 된 target_text 또는 context의 연속 부분을 정확히 복사한다. 설명을 생성하지 않는다. 근거가 없으면 빈 문자열이다. 후보마다 classification, reading, evidence만 출력한다.';
assert(original.includes(readingInstruction)&&original.includes(evidenceInstruction),'D contract changed; review compact comparison');
const SYSTEM=original.replace(readingInstruction,'readings_truncated가 true이거나 후보 중 근거 있는 읽기가 없으면 substitution으로 확정하지 않는다.')
 .replace(evidenceInstruction,'후보마다 classification만 출력한다. 읽기 선택, 인용, 설명은 출력하지 않는다.');
function prepare(row){return complete.prepare(row,'F');}
function modelItemSchema(){return {type:'object',properties:{classification:{type:'string',enum:['substitution','literal','uncertain']}},required:['classification'],additionalProperties:false};}
function validateModelDecisions(value,queries){
 if(!Array.isArray(value)||value.length!==queries.length)throw Error('One decision per candidate required');
 const ids=new Set(queries.map(q=>q.node_id)),seen=new Set();if(ids.size!==queries.length)throw Error('Duplicate input ID');
 return value.map(d=>{
  if(!d||!ids.has(d.node_id)||seen.has(d.node_id))throw Error('Unknown or duplicate output ID');seen.add(d.node_id);
  if(Object.keys(d).length!==2||Object.keys(d).some(k=>!['node_id','classification'].includes(k))||!['substitution','literal','uncertain'].includes(d.classification))throw Error('Invalid compact digit decision');
  return {...d};
 });
}
function contract(){return {SYSTEM,JUDGE:complete.contract().JUDGE,initialEvidence:complete.initialEvidence,modelItemSchema,validateModelDecisions,formatRepair:false};}
function postprocess(_mode,raw,queries){return validateModelDecisions(raw,queries).map(d=>({...d,restored:null,restoration_unresolved:d.classification==='substitution',raw:{...d}}));}
module.exports={prepare,initialEvidence:complete.initialEvidence,modelItemSchema,validateModelDecisions,contract,postprocess};
if(require.main===module){
 const row={node_id:'x',token:'t1cket',target_text:'t1cket 표기 안내',gold:'DO_NOT_LEAK',classification:'literal'},q=prepare(row);
 assert.deepEqual(q.readings,['ticket','tlcket']);assert.deepEqual(q,complete.prepare(row,'F'));assert(!JSON.stringify(complete.initialEvidence(q)).includes('DO_NOT_LEAK'));
 const raw=[{node_id:'x',classification:'substitution'}],result=postprocess('compact',raw,[q]);assert.equal(result[0].restored,null);assert.equal(result[0].restoration_unresolved,true);
 assert.throws(()=>validateModelDecisions([{...raw[0],reading:'r0'}],[q]));assert.throws(()=>validateModelDecisions([{...raw[0],node_id:'y'}],[q]));assert.throws(()=>validateModelDecisions([raw[0],raw[0]],[q]));
 assert.equal(contract().formatRepair,false);assert.equal(contract().JUDGE,complete.contract().JUDGE);assert(SYSTEM.includes('다른 candidate의 자료를 가져오지 않는다.'));
 console.log('PASS compact classification: identical complete-reading evidence, no gold leakage, strict IDs/schema, restoration unclaimed, no auto repair');
}
