// Experiment only: append digit observations to the existing publication-act request.
const assert=require('node:assert/strict'),judgment=require('../src/core/judgment.cjs'),{readings}=require('./digit-generalization-methods.cjs');
const base=judgment.contract(),classes={S:'substitution',L:'literal',U:'uncertain'};
function digitQueries(c){
 assert.equal(typeof c.raw_text,'string','Target raw text required');
 return [...c.raw_text.matchAll(/[A-Za-z0-9]+/g)].filter(m=>/[A-Za-z]/.test(m[0])&&/[0-9]/.test(m[0])).map(m=>{
  const alternatives=readings(m[0]);
  return {start:m.index,end:m.index+m[0].length,token:m[0],unchanged:m[0],readings:alternatives.values,readings_truncated:alternatives.truncated};
 });
}
function initialEvidence(c){return {...base.initialEvidence(c),digit_queries:digitQueries(c)};}
function modelItemSchema(sourceIds){const schema=base.modelItemSchema(sourceIds);return {...schema,properties:{...schema.properties,digits:{type:'array',items:{type:'string',enum:Object.keys(classes)}}},required:[...schema.required,'digits']};}
function validateModelDecisions(value,candidates){
 assert(Array.isArray(value)&&value.length===candidates.length,'One judgment per candidate required');
 const by=new Map(candidates.map(c=>[c.node_id,c])),rawActs=[];
 for(const d of value){
  assert(d&&typeof d==='object'&&!Array.isArray(d)&&by.has(d.node_id),'Unknown candidate ID');
  assert.deepEqual(Object.keys(d).sort(),['digits','node_id','publication_act'],'Missing or unexpected joint field');
  const qs=digitQueries(by.get(d.node_id));
  assert(Array.isArray(d.digits)&&d.digits.length===qs.length&&d.digits.every(x=>Object.hasOwn(classes,x)),'Invalid digit count or classification');
  rawActs.push({node_id:d.node_id,publication_act:d.publication_act});
 }
 const digitsById=new Map(value.map(d=>[d.node_id,d.digits]));
 return base.validateModelDecisions(rawActs,candidates).map(d=>({...d,numeric_resolutions:Object.freeze(digitQueries(by.get(d.node_id)).map((q,i)=>{
  const raw_classification=classes[digitsById.get(d.node_id)[i]],guard_reason=raw_classification==='substitution'?(q.readings_truncated?'numeric-reading-overflow':!q.readings.length?'numeric-reading-unavailable':null):null;
  return Object.freeze({start:q.start,end:q.end,token:q.token,classification:guard_reason?'uncertain':raw_classification,raw_classification,guard_reason});
 }))}));
}
const DIGIT_SYSTEM=`추가로 각 후보의 digit_queries에 표시된 판정대상 내부 표기만 같은 순서의 digits 배열로 판정한다. 대상 밖 주변 문구의 표기는 포함하지 않는다. queries가 없으면 []다.
S는 소속 문맥에서 숫자가 일반 영문 글자를 대신한 표기, L은 숫자가 원래 수량·규격·제품/관리 식별자·이름의 구성 부분인 표기, U는 두 해석을 가를 근거가 부족한 표기다. unchanged 원문 유지와 readings 복원 가설을 구분한다. readings는 가능한 문자 대응이지 검증된 단어가 아니다. 익숙한 단어로 바뀐다는 이유만으로 S를 확정하지 않는다. readings_truncated가 참이면 일부 가설을 누락했으므로 U다.
digits는 publication_act와 독립이다. 실제 이용권유에도 정상 식별자가 있고, 예방 인용에도 문자 치환이 있다. 다른 후보의 문맥이나 판정을 가져오지 않는다. 읽기 선택·추론·설명은 추가 출력하지 않는다.`;
function contract(){return {...base,SYSTEM:base.SYSTEM+'\n'+DIGIT_SYSTEM,initialEvidence,modelItemSchema,validateModelDecisions,promptJson:true,formatRepair:false};}
module.exports={contract,digitQueries,initialEvidence,modelItemSchema,validateModelDecisions};
if(require.main===module){
 const candidates=Array.from({length:12},(_,i)=>({node_id:'n'+i,raw_text:i%3===0?'정상 민원 안내':i%3===1?'B0nus 및 USB3 안내':'t1cket 표기',page_title:'민원실',links:[],nearby:'정상 주변 정보',gold:'DO_NOT_LEAK'}));
 for(const c of candidates){const {digit_queries,...e}=initialEvidence(c);assert.deepEqual(e,base.initialEvidence(c));assert(!JSON.stringify(initialEvidence(c)).includes('DO_NOT_LEAK'));for(const q of digit_queries)assert.equal(c.raw_text.slice(q.start,q.end),q.token);}
 const raw=candidates.map(c=>({node_id:c.node_id,publication_act:'일반정보',digits:digitQueries(c).map(()=> 'U')}));
 const out=validateModelDecisions(raw,candidates),semantic=base.validateModelDecisions(raw.map(({digits,...r})=>r),candidates);
 out.forEach((d,i)=>{const {numeric_resolutions,...s}=d;assert.deepEqual(s,semantic[i]);assert(Object.isFrozen(numeric_resolutions));for(const q of numeric_resolutions)assert(Object.isFrozen(q));});
 assert.deepEqual(out[0].numeric_resolutions,[]);assert.equal(out[1].numeric_resolutions.length,2);
 const bad=structuredClone(raw);bad[1].digits.pop();assert.throws(()=>validateModelDecisions(bad,candidates));
 assert.throws(()=>validateModelDecisions([{...raw[0],node_id:'unknown'},...raw.slice(1)],candidates));
 assert.throws(()=>validateModelDecisions([raw[1],...raw.slice(1)],candidates));
 assert.throws(()=>validateModelDecisions([{...raw[0],unexpected:true},...raw.slice(1)],candidates));
 const overflow={...candidates[0],raw_text:'안내 A11111111'},overflowRaw={node_id:overflow.node_id,publication_act:'이용권유',digits:['S']};
 const guarded=validateModelDecisions([overflowRaw],[overflow])[0],{numeric_resolutions,...guardedSemantic}=guarded;
 assert.deepEqual(guardedSemantic,base.validateModelDecisions([{node_id:overflow.node_id,publication_act:'이용권유'}],[overflow])[0]);
 assert.equal(numeric_resolutions[0].classification,'uncertain');assert.equal(numeric_resolutions[0].raw_classification,'substitution');assert.equal(numeric_resolutions[0].guard_reason,'numeric-reading-overflow');
 const valid=validateModelDecisions([{node_id:candidates[2].node_id,publication_act:'일반정보',digits:['S']}],[candidates[2]])[0].numeric_resolutions[0];
 assert.equal(valid.classification,'substitution');assert.equal(valid.raw_classification,'substitution');assert.equal(valid.guard_reason,null);
 assert(contract().SYSTEM.startsWith(base.SYSTEM));assert.equal(contract().formatRepair,false);assert.equal(contract().promptJson,true);
 console.log('PASS joint digit contract: operating semantic/input preservation, 12 candidates, spans, empty/multiple digits, immutable resolutions, strict IDs/counts, no gold leakage');
}
