const assert=require('node:assert/strict'),{planReuse,expandDecisions}=require('./reuse.cjs'),{outputResult}=require('../src/core/output.cjs');
const c={node_id:'one',url:'http://localhost/a',location:'p#a',selector:'p#a',frame_urls:[],page_title:'게시판',raw_text:'입금하고 참여하세요.',normalized_text:'입금하고 참여하세요.',own_style:{opacity:0},ancestors:[],nearby:{before:'',after:''},context_evidence:{units:[{relation:'target'}]},links:[],signals:['TRANSPARENT']};
const snapshot={entry_url:c.url,candidates:[c,{...structuredClone(c),node_id:'two',url:'http://localhost/b',location:'iframe >>> p#b',selector:'p#b'}]};
const frozen=JSON.stringify(snapshot),plan=planReuse(snapshot);assert.equal(plan.representatives.length,1);
for(const [is_violation,needs_review]of [[true,false],[false,false],[false,true],[true,true]]){
 const d={node_id:'one',is_violation,needs_review,techniques:is_violation?['TRANSPARENT']:[],observed_techniques:['TRANSPARENT'],reason:'원래 판정과 근거'};
 const ds=expandDecisions(snapshot,plan,[d]);assert.equal(ds.length,2);assert.deepEqual(ds[1],{...d,node_id:'two'});
 const output=outputResult(snapshot,ds,'fixed',0,'hcx');
 if(is_violation&&!needs_review)assert.deepEqual(output.result.findings.map(f=>[f.url,f.location,f.evidence_text]),snapshot.candidates.map(c=>[c.url,c.location,c.raw_text]));
 if(needs_review)assert.equal(output.diagnostics.length,2);
 assert.equal(d.node_id,'one');ds[0].techniques.push('JAMO');assert(!ds[1].techniques.includes('JAMO'));
}
assert.equal(JSON.stringify(snapshot),frozen);assert.throws(()=>expandDecisions(snapshot,plan,[]));
assert.throws(()=>expandDecisions(snapshot,{...plan,aliases:[]},[]));
const changed=structuredClone(snapshot);changed.candidates[1].nearby.before='위 문구는 예방 교육용 인용입니다.';assert.equal(planReuse(changed).representatives.length,2);
const {budgetUsage}=require('./reuse-run.cjs');assert.equal(budgetUsage({usage:{total_tokens:10}}),10);assert.equal(budgetUsage({http_status:429,reserved_tokens:100}),100);assert.throws(()=>budgetUsage({http_status:200,reserved_tokens:100}));
console.log('PASS: first-occurrence ordering, one-to-many location/raw evidence, positive/negative/review preservation, no shared mutation, missing decision/source mismatch rejected');
