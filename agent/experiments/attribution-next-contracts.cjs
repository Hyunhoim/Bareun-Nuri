// Experiment only. Inherit the current operational reading; no labels or text filters.
const assert=require('node:assert/strict');
const {contract:operatingContract}=require('../src/core/judgment.cjs');
const FUNCTIONS=['direct_offer','action_link','quoted_example','neutral','unclear'];

function structure(candidate){
 const evidence=candidate.context_evidence;let index=0,target=false;
 const units=(evidence?.units||[]).flatMap(unit=>{
  if(unit.relation==='target'){
   if(target)return [];target=true;
   return [{source_id:'t',relation:'target',tag:unit.tag??evidence.target_tag??null,role:unit.role??null,quoted:unit.quoted??evidence.target_quoted??null}];
  }
  if(typeof unit.text!=='string')return [];
  return [{source_id:'c'+index++,relation:unit.relation,tag:unit.tag??null,role:unit.role??null,quoted:unit.quoted??null}];
 });
 if(!target)units.push({source_id:'t',relation:'target',tag:evidence?.target_tag??null,role:null,quoted:evidence?.target_quoted??null});
 return {target_tag:evidence?.target_tag??null,ordered_units:units};
}

function contracts(){
 const A=operatingContract();
 const E={...A,initialEvidence:c=>({...A.initialEvidence(c),observed_structure:structure(c)})};
 const F={...A,
  SYSTEM:A.SYSTEM+'\n각 대상의 target_function을 먼저 선택하고 publication_act를 기록한다. direct_offer=대상 자체가 상품·서비스 제공 또는 거래를 제안함, action_link=대상이 직접 연결된 서비스 이용을 실행·문의하는 연결이나 행동 안내임, quoted_example=대상이 설명·비판을 위해 제시된 사례임, neutral=그 밖의 정보·표시임, unclear=제공된 근거로 대상 기능을 구분하기 어려움. 이 기능은 대상 자신에 관한 분류이며 주변의 기능을 대신 출력하지 않는다. 기능과 불법성은 별개다. 정상 서비스의 제안도 direct_offer일 수 있으므로 publication_act는 기존 기준으로 별도 판정한다. 두 분류값만 출력하고 사고 과정이나 설명을 추가하지 않는다.',
  modelItemSchema(){const schema=A.modelItemSchema();return {...schema,properties:{target_function:{type:'string',enum:FUNCTIONS},...schema.properties},required:['target_function',...schema.required]};},
  validateModelDecisions(value,candidates){
   assert(Array.isArray(value),'Decision array required');
   for(const item of value){assert.deepEqual(Object.keys(item).sort(),['node_id','publication_act','target_function']);assert(FUNCTIONS.includes(item.target_function),'Unknown target function');}
   const functions=new Map(value.map(d=>[d.node_id,d.target_function]));
   return A.validateModelDecisions(value.map(({target_function,...decision})=>decision),candidates).map(d=>({...d,model_target_function:functions.get(d.node_id)}));
  }
 };
 return {A,E,F};
}

module.exports={contracts,structure};
if(require.main===module){
 const {A,E,F}=contracts(),candidate={node_id:'sample',raw_text:'참여 안내',normalized_text:'참여 안내',page_title:'시민 참여',links:[],nearby:{},context_evidence:{scope:{tag:'section',role:'article'},target_tag:'a',target_quoted:false,truncated:false,units:[{relation:'before',text:'같은 글의 내용',tag:'p',quoted:false},{relation:'target',tag:'a',quoted:false},{relation:'after',text:'다음 설명',tag:'span',quoted:true}]}};
 const before=structuredClone(candidate),base=A.initialEvidence(candidate),extra=E.initialEvidence(candidate);
 assert.deepEqual(extra.observed_structure,{target_tag:'a',ordered_units:[{source_id:'c0',relation:'before',tag:'p',role:null,quoted:false},{source_id:'t',relation:'target',tag:'a',role:null,quoted:false},{source_id:'c1',relation:'after',tag:'span',role:null,quoted:true}]});
 delete extra.observed_structure;assert.deepEqual(extra,base);assert.deepEqual(F.initialEvidence(candidate),base);assert.deepEqual(candidate,before);
 assert.equal(E.SYSTEM,A.SYSTEM);assert.deepEqual(E.modelItemSchema(),A.modelItemSchema());
 const plain={node_id:'sample',publication_act:'일반정보'},actual=F.validateModelDecisions([{...plain,target_function:'direct_offer'}],[candidate]);
 assert.equal(actual[0].model_target_function,'direct_offer');assert.equal(actual[0].is_violation,false);
 delete actual[0].model_target_function;assert.deepEqual(actual,A.validateModelDecisions([plain],[candidate]));
 assert.throws(()=>F.validateModelDecisions([plain],[candidate]));assert.throws(()=>F.validateModelDecisions([{...plain,target_function:'unknown'}],[candidate]));
 assert.deepEqual(structure({}).ordered_units,[{source_id:'t',relation:'target',tag:null,role:null,quoted:null}]);
 console.log('PASS E metadata-only, F output-only, raw preservation, missing metadata and role validation; API0');
}
