// Experiment only: mutually exclusive numeric-position quantifiers; all other S behavior unchanged.
const assert=require('node:assert/strict'),base=require('./digit-request-methods.cjs');
const OLD='substitution: 문맥에서 숫자가 일반 영문 글자를 대신한 표현이다. literal: 숫자가 원래 수량, 규격, 제품/관리 식별자, 고유 이름의 구성 부분이다. uncertain: 두 해석을 가를 근거가 없다.';
const NEW='substitution: 소속 문맥에서 대상의 숫자 중 하나 이상이 영문 글자를 대신한다는 근거가 있다. 나머지 숫자가 실제 수량·규격·식별자의 일부여도 이 분류에 해당한다. literal: 대상의 숫자가 모두 원래 수량·규격·제품/관리 식별자·고유 이름의 일부이고 어느 숫자도 영문 글자를 대신하지 않는다는 근거가 소속 문맥에 있다. uncertain: 소속 문맥으로 하나 이상의 문자 치환 또는 모든 숫자의 원래 쓰임을 구분할 수 없다.';
function contract(mode){assert(['S','M'].includes(mode));const c=base.contract();assert.equal(c.SYSTEM.split(OLD).length,2,'Frozen S definitions changed');return mode==='S'?c:{...c,SYSTEM:c.SYSTEM.replace(OLD,NEW)};}
function jobs(inputs,reverse,mode){assert(['S','M'].includes(mode));return base.jobs(inputs,reverse,'S');}
module.exports={contract,jobs,postprocess:base.postprocess};
if(require.main===module){
 const a=contract('S'),b=contract('M'),{SYSTEM:sa,...restA}=a,{SYSTEM:sb,...restB}=b;assert.deepEqual(restA,restB);assert.equal(sa.replace(OLD,NEW),sb);
 const rows=[{node_id:'x',token:'B0nus7',target_text:'B0nus7 안내',gold:'DO_NOT_LEAK'}];assert.deepEqual(jobs(rows,false,'S'),jobs(rows,false,'M'));const q=jobs(rows,false,'M')[0][0];assert(!JSON.stringify(a.initialEvidence(q)).includes('DO_NOT_LEAK'));assert(q.readings.includes('Bonus7'));assert(q.readings.includes('B0nust'));assert.deepEqual(b.modelItemSchema().required,['classification']);assert.equal(b.formatRepair,false);
 console.log('PASS definition-only change: complete S contract/input preservation except three definitions, partial numeric alternatives, no gold');
}
