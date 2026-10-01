// Isolated contracts: joint judgment vs source-bound reasons vs intent-only judgment.
const assert=require('node:assert/strict');
const {baselineContract:base}=require('../src/core/llm.cjs');
const meanings={invitation:'불법 서비스 이용 권유',citation:'인용·경고 문맥',information:'일반 정보',insufficient:'판정 문맥 부족'};
const verdictFor={invitation:'violation',citation:'benign',information:'benign',insufficient:'uncertain'};
function sources(c){return [{id:'t',position:'target',text:c.raw_text},...(c.context_evidence?.units||[]).filter(u=>u.relation!=='target'&&typeof u.text==='string').map((u,i)=>({id:'c'+i,position:u.relation,in_quote:u.quoted,text:u.text}))];}
function evidence(c){const list=sources(c);return {...base.initialEvidence(c),source_ids:list.map(s=>s.id),
 context_scope:c.context_evidence?{boundary:c.context_evidence.scope,target_in_quote:c.context_evidence.target_quoted,truncated:c.context_evidence.truncated}:null,
 sources:list.map(s=>s.id==='t'?{id:'t',field:'raw_text'}:s)};}
function contract(mode){const structured=mode==='E'||mode==='S',semantic=mode==='S';
 let SYSTEM=base.SYSTEM,JUDGE=base.JUDGE;
 if(structured)SYSTEM=SYSTEM.replace('reason은 정상 판정도 포함하여 40자 내외로 간단히 작성한다.','근거는 reason_code와 evidence_ids로 표시한다.');
 if(semantic){SYSTEM=SYSTEM.split('\n').filter(l=>!l.startsWith('HOMOGLYPH(')&&!l.startsWith('배경만 transparent')).map(l=>l.startsWith('광고 여부(ad_verdict)')?'광고 여부만 판정한다. 관찰 기법은 별도 코드가 검사한다.':l.startsWith('각 candidate')?'각 candidate를 정확히 한 번 판정한다.':l).join('\n');JUDGE='광고 여부만 판정한다. 기법은 생성하지 않는다.';}
 if(structured)SYSTEM+='\nreason_code: invitation=불법 서비스 이용 권유, citation=인용·경고 문맥, information=일반 정보, insufficient=판정 문맥 부족. ad_verdict와 모순되면 안 된다. evidence_ids는 해당 대상의 source_ids에서 판정에 실제 사용한 위치를 선택한다. DOM 경계는 작성자·의도가 같다는 증명이 아니다. 위치가 유효해도 그 원문이 판정을 뒷받침하는지 확인한다.';
 return {SYSTEM,JUDGE,formatRepair:false,initialEvidence:mode.startsWith('O')?base.initialEvidence:evidence,
  modelItemSchema:(ids=['t'])=>{if(!structured)return base.modelItemSchema();const old=base.modelItemSchema().properties;
   const properties={reason_code:{type:'string',enum:Object.keys(meanings)},evidence_ids:{type:'array',items:{type:'string',enum:ids},minItems:1,maxItems:Math.min(ids.length,4)},ad_verdict:old.ad_verdict,
    ...(!semantic?{observed_techniques:old.observed_techniques}:{}),needs_review:old.needs_review};
   return {type:'object',properties,required:Object.keys(properties),additionalProperties:false};},
  validateModelDecisions:(value,candidates)=>{
   if(!structured)return base.validateModelDecisions(value,candidates).map((d,i)=>({...d,raw_ad_verdict:value[i].ad_verdict}));
   assert(Array.isArray(value)&&value.length===candidates.length,'One judgment per target required');const by=new Map(candidates.map(c=>[c.node_id,c]));
   const converted=value.map(d=>{assert(by.has(d.node_id),'Unknown target');assert(Object.hasOwn(meanings,d.reason_code),'Unknown reason code');
    const allowed=['node_id','reason_code','evidence_ids','ad_verdict','needs_review',...(!semantic?['observed_techniques']:[])];assert(Object.keys(d).every(k=>allowed.includes(k)),'Unexpected output field');
    assert.equal(d.ad_verdict,verdictFor[d.reason_code],'Reason code contradicts verdict');
    const list=sources(by.get(d.node_id)),refs=new Map(list.map(s=>[s.id,s]));assert(Array.isArray(d.evidence_ids)&&d.evidence_ids.length>0&&d.evidence_ids.length<=4&&new Set(d.evidence_ids).size===d.evidence_ids.length&&d.evidence_ids.every(id=>refs.has(id)),'Invalid source citation');
    const reason=meanings[d.reason_code]+' · '+d.evidence_ids.map(id=>id+': '+refs.get(id).text.slice(0,180)).join(' / ');
    return {node_id:d.node_id,ad_verdict:d.ad_verdict,needs_review:d.needs_review,reason,observed_techniques:semantic?[]:d.observed_techniques};});
   return base.validateModelDecisions(converted,candidates).map((d,i)=>({...d,raw_ad_verdict:value[i].ad_verdict,reason_code:value[i].reason_code,evidence_ids:value[i].evidence_ids}));
  }};
}
function check(){const c={node_id:'n',raw_text:'대상 문구',normalized_text:'대상 문구',frame_urls:[],context_evidence:{scope:{tag:'article'},units:[{relation:'before',text:'설명 문구',quoted:false},{relation:'target'}],target_quoted:true,truncated:false}};
 const p=evidence(c);for(const[k,v]of Object.entries(base.initialEvidence(c)))assert.deepEqual(p[k],v);assert.deepEqual(p.source_ids,['t','c0']);
 for(const mode of ['E','S']){const x={node_id:'n',ad_verdict:'benign',reason_code:'citation',evidence_ids:['c0'],needs_review:false,...(mode==='E'?{observed_techniques:['JAMO']}: {})};
  const v=contract(mode).validateModelDecisions([x],[c])[0];assert.equal(v.is_violation,false);assert(v.reason.includes('설명 문구'));assert.throws(()=>contract(mode).validateModelDecisions([{...x,evidence_ids:['other']}],[c]));assert.throws(()=>contract(mode).validateModelDecisions([{...x,ad_verdict:'violation'}],[c]));assert.throws(()=>contract(mode).validateModelDecisions([{...x,evidence_ids:[]}],[c]));}
 assert.deepEqual(contract('J').modelItemSchema(),base.modelItemSchema());assert(!('observed_techniques'in contract('S').modelItemSchema().properties));
 assert.deepEqual(contract('E').initialEvidence(c),contract('S').initialEvidence(c));
 console.log('PASS: shared evidence, valid source ownership, enum contract, contradiction rejection, isolated semantic role');}
module.exports={contract,sources,check};if(require.main===module)check();
