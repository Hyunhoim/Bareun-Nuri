// Development experiment: classify the publication act without generating source references.
const assert=require('node:assert/strict');
const {contract:passageContract}=require('./semantic-passage.cjs');
const {baselineContract}=require('../src/core/llm.cjs');
const verdictFor={'이용권유':'violation','인용보도':'benign','일반정보':'benign','판단불가':'uncertain'};

function contract(){
 const base=passageContract(),referenceInstruction='선택한 게시 행위를 뒷받침하는 실제 출처만 evidence_ids에 적는다.';
 assert(base.SYSTEM.includes(referenceInstruction),'Passage source-reference instruction changed; review this ablation');
 return {...base,promptJson:true,SYSTEM:base.SYSTEM.replace(referenceInstruction,''),
  modelItemSchema:()=>({type:'object',properties:{publication_act:base.modelItemSchema().properties.publication_act},required:['publication_act'],additionalProperties:false}),
  validateModelDecisions:(value,candidates)=>{
   assert(Array.isArray(value)&&value.length===candidates.length,'One judgment per candidate required');
   const by=new Map(candidates.map(c=>[c.node_id,c])),seen=new Set();
   assert.equal(by.size,candidates.length,'Duplicate input candidate ID');
   const normalized=value.map(d=>{
    assert(d&&typeof d==='object'&&!Array.isArray(d)&&by.has(d.node_id)&&!seen.has(d.node_id),'Unknown or duplicate candidate ID');
    seen.add(d.node_id);
    assert.deepEqual(Object.keys(d).sort(),['node_id','publication_act'],'Missing or unexpected decision field');
    assert(Object.hasOwn(verdictFor,d.publication_act),'Unknown publication act');
    const candidate=by.get(d.node_id);assert.equal(typeof candidate.raw_text,'string','Target raw text required');
    return {node_id:d.node_id,ad_verdict:verdictFor[d.publication_act],needs_review:d.publication_act==='판단불가',observed_techniques:[],
     reason:'모델이 선택한 게시행위: '+d.publication_act+' · 대상 원문: '+candidate.raw_text.slice(0,240)};
   });
   return baselineContract.validateModelDecisions(normalized,candidates).map((d,i)=>({...d,publication_act:value[i].publication_act,
    raw_ad_verdict:normalized[i].ad_verdict,reason_source:'code_generated_category_and_target_not_model_explanation'}));
  }};
}

function check(){
 const candidates=[{node_id:'a',raw_text:'대상 원문',normalized_text:'대상 원문',links:[],context_evidence:{units:[{relation:'before',text:'앞 문맥'},{relation:'target'}]}},{node_id:'b',raw_text:'다른 원문',normalized_text:'다른 원문',links:[]}];
 const x=contract();assert.equal(x.promptJson,true);assert.deepEqual(x.initialEvidence(candidates[0]),passageContract().initialEvidence(candidates[0]));
 assert(!x.SYSTEM.includes('evidence_ids'));assert.deepEqual(x.modelItemSchema().required,['publication_act']);
 for(const publication_act of Object.keys(verdictFor)){
  const d=x.validateModelDecisions([{node_id:'a',publication_act}],[candidates[0]])[0];
  assert.equal(d.is_violation,publication_act==='이용권유');assert.equal(d.needs_review,publication_act==='판단불가');
  assert.equal(d.raw_ad_verdict,verdictFor[publication_act]);assert.equal(d.publication_act,publication_act);assert(d.reason.includes(candidates[0].raw_text));
 }
 for(const invalid of [{node_id:'other',publication_act:'일반정보'},{node_id:'a',publication_act:'미등록 분류'},{node_id:'a',publication_act:'일반정보',evidence_ids:['t']},{node_id:'a'}])
  assert.throws(()=>x.validateModelDecisions([invalid],[candidates[0]]));
 assert.throws(()=>x.validateModelDecisions([{node_id:'a',publication_act:'일반정보'},{node_id:'a',publication_act:'일반정보'}],candidates));
 assert.throws(()=>x.validateModelDecisions([],candidates));
 console.log('PASS semantic act: unchanged input/classification instructions, strict class/ID/cardinality, explicit uncertainty, source-task removal');
}
module.exports={contract};
if(require.main===module)check();
