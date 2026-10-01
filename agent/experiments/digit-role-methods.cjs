// Experiment only: single-candidate compact S; replace its final framing instruction only.
const assert=require('node:assert/strict'),base=require('./digit-request-methods.cjs');
const OLD='대상 표기와 소속 문맥을 읽고 세 분류 중 하나를 직접 판정한다. 복원 가능하다는 사실만으로 치환이라 단정하지 않는다.';
const ROLE='판정 질문은 어떤 단어로 복원할 수 있는가가 아니라, 이 표기가 현재 문장에서 어떤 역할로 사용되는가이다. 소속 문맥에서 일반 단어의 뜻을 전달하는 변형 사용이면 substitution, 원형 보존이 필요한 이름·규격·식별표기이면 literal, 현재 쓰임을 알 수 없으면 uncertain이다. 읽을 수 있는 복원 후보가 있다는 사실만으로 현재 쓰임을 확정하지 않는다.';
function contract(mode){assert(['S','R'].includes(mode));const c=base.contract();assert(c.SYSTEM.endsWith(OLD),'Frozen S final instruction changed');return mode==='S'?c:{...c,SYSTEM:c.SYSTEM.slice(0,-OLD.length)+ROLE};}
function jobs(inputs,reverse,mode){assert(['S','R'].includes(mode));return base.jobs(inputs,reverse,'S');}
module.exports={contract,jobs,postprocess:base.postprocess};
if(require.main===module){
 const a=contract('S'),b=contract('R'),{SYSTEM:sa,...restA}=a,{SYSTEM:sb,...restB}=b;assert.deepEqual(restA,restB);assert.equal(sa.slice(0,-OLD.length),sb.slice(0,-ROLE.length));
 const rows=[{node_id:'x',token:'B0nus7',target_text:'B0nus7 안내',gold:'DO_NOT_LEAK'}];assert.deepEqual(jobs(rows,false,'S'),jobs(rows,false,'R'));const q=jobs(rows,false,'R')[0][0];assert(!JSON.stringify(a.initialEvidence(q)).includes('DO_NOT_LEAK'));assert(q.readings.includes('Bonus7'));assert(q.readings.includes('B0nust'));
 assert.deepEqual(b.modelItemSchema().required,['classification']);assert.equal(b.formatRepair,false);console.log('PASS role framing: final instruction only; same single queries, partial readings, schema, validators, no gold');
}
