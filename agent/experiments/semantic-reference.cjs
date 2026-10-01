// Development ablation: an absent source selection is explicit, never an invented citation.
const assert=require('node:assert/strict');
const {contract:passageContract}=require('./semantic-passage.cjs');
const {sources}=require('./semantic-intent-contract.cjs');
const {baselineContract}=require('../src/core/llm.cjs');
const verdictFor={'이용권유':'violation','인용보도':'benign','일반정보':'benign','판단불가':'uncertain'};

function contract(){
 const base=passageContract(),sentence='선택한 게시 행위를 뒷받침하는 실제 출처만 evidence_ids에 적는다.';
 assert(base.SYSTEM.includes(sentence),'Passage source-reference instruction changed');
 return {...base,promptJson:true,SYSTEM:base.SYSTEM.replace(sentence,sentence+' 출처를 특정하지 못하면 evidence_ids를 빈 배열로 두고, 존재하지 않는 출처를 만들어내지 않는다.'),
  modelItemSchema:(ids=['t'])=>{const schema=base.modelItemSchema(ids);return {...schema,properties:{...schema.properties,evidence_ids:{...schema.properties.evidence_ids,minItems:0}}};},
  validateModelDecisions:(value,candidates)=>{
   assert(Array.isArray(value)&&value.length===candidates.length,'One judgment per candidate required');
   const by=new Map(candidates.map(c=>[c.node_id,c])),seen=new Set();assert.equal(by.size,candidates.length,'Duplicate input candidate ID');
   const normalized=value.map(d=>{
    assert(d&&typeof d==='object'&&!Array.isArray(d)&&by.has(d.node_id)&&!seen.has(d.node_id),'Unknown or duplicate candidate ID');seen.add(d.node_id);
    assert.deepEqual(Object.keys(d).sort(),['evidence_ids','node_id','publication_act'],'Missing or unexpected decision field');
    assert(Object.hasOwn(verdictFor,d.publication_act),'Unknown publication act');
    const candidate=by.get(d.node_id),refs=new Map(sources(candidate).map(s=>[s.id,s.text]));assert.equal(typeof candidate.raw_text,'string','Target raw text required');
    assert(Array.isArray(d.evidence_ids)&&d.evidence_ids.length<=4&&new Set(d.evidence_ids).size===d.evidence_ids.length&&d.evidence_ids.every(id=>refs.has(id)),'Invalid evidence reference');
    const reference=d.evidence_ids.length?'선택한 참조: '+d.evidence_ids.map(id=>id+': '+refs.get(id).slice(0,180)).join(' / '):'참조 선택 없음';
    return {node_id:d.node_id,ad_verdict:verdictFor[d.publication_act],needs_review:d.publication_act==='판단불가',observed_techniques:[],
     reason:'모델이 선택한 게시행위: '+d.publication_act+' · 대상 원문: '+candidate.raw_text.slice(0,240)+' · '+reference};
   });
   return baselineContract.validateModelDecisions(normalized,candidates).map((d,i)=>({...d,publication_act:value[i].publication_act,
    raw_ad_verdict:normalized[i].ad_verdict,evidence_ids:value[i].evidence_ids,
    reason_source:'code_generated_category_target_and_selected_references_not_model_explanation'}));
  }};
}

function check(){
 const x=contract(),c={node_id:'n',raw_text:'판정 대상 원문',normalized_text:'판정 대상 원문',links:[]};
 assert.deepEqual(x.initialEvidence(c),passageContract().initialEvidence(c));assert.equal(x.modelItemSchema(['t']).properties.evidence_ids.minItems,0);
 assert.deepEqual(x.modelItemSchema(['t']).properties.evidence_ids.items.enum,['t']);
 for(const publication_act of Object.keys(verdictFor)){
  for(const evidence_ids of [[],['t']]){
   const d=x.validateModelDecisions([{node_id:'n',publication_act,evidence_ids}],[c])[0];
   assert.equal(d.is_violation,publication_act==='이용권유');assert.equal(d.needs_review,publication_act==='판단불가');
   assert.deepEqual(d.evidence_ids,evidence_ids);assert.equal(d.raw_ad_verdict,verdictFor[publication_act]);
   if(!evidence_ids.length)assert(d.reason.endsWith('참조 선택 없음'));else assert(d.reason.includes('t: '+c.raw_text));
  }
 }
 const valid={node_id:'n',publication_act:'일반정보',evidence_ids:[]};
 for(const invalid of [{...valid,evidence_ids:['c0']},{...valid,evidence_ids:['invented']},{...valid,evidence_ids:['t','t']},{...valid,evidence_ids:null},{...valid,node_id:'other'},{...valid,publication_act:'other'},{...valid,reason:'임의 설명'}])assert.throws(()=>x.validateModelDecisions([invalid],[c]));
 assert.throws(()=>x.validateModelDecisions([], [c]));
 assert.throws(()=>x.validateModelDecisions([valid,valid],[c,{...c,node_id:'m'}]));
 console.log('PASS semantic reference: empty reference preserved, valid target accepted, invented/cross-candidate/duplicate references rejected');
}
module.exports={contract};
if(require.main===module)check();
