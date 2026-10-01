const assert=require('node:assert/strict'),contract=require('./attribution-contract.cjs');
const {applyRescueContext}=require('./contextualize.cjs');
const c={node_id:'a',raw_text:'입장 신청',normalized_text:'입장 신청',links:[],context_evidence:{units:[{relation:'before',text:'구립 과학관 관람 예약'},{relation:'target'}]}};
const d={node_id:'a',target_role:'offer',service_kind:'lawful',service_source:'context_0',service_link:'connected',relation_reason:'해당 관람 예약의 신청',presentation:'live',quotation_source:'none',reason:'관람 예약 안내'};
const judge=x=>contract.validateModelDecisions([{...d,...x}],[c])[0];
assert(!judge({}).needs_review);assert.equal(judge({}).service_evidence.text,c.context_evidence.units[0].text);
assert(judge({service_kind:'unknown',service_source:'none',service_link:'unresolved'}).needs_review);
assert(judge({service_kind:'lawful',service_source:'none'}).needs_review);
assert(judge({service_kind:'unknown',service_source:'target'}).needs_review);
assert(!judge({service_source:'target',service_link:'none'}).needs_review,'Self evidence does not need an external relation');
assert(judge({service_link:'unrelated',service_kind:'illegal'}).needs_review);
assert(judge({service_link:'unresolved'}).needs_review);
assert(judge({presentation:'quotation'}).needs_review);
assert(!judge({target_role:'information'}).needs_review,'Known lawful service does not require an offer/information distinction');
assert(!judge({target_role:'information',service_kind:'illegal'}).is_violation,'Illegal neighboring service cannot override an independent role');
assert(!judge({target_role:'information',service_kind:'not_applicable',service_source:'none',service_link:'none'}).needs_review);
assert(!judge({target_role:'information',service_kind:'not_applicable',service_source:'none',service_link:'unrelated'}).needs_review);
assert.throws(()=>judge({service_quote:'다른 후보의 과학관'}),/Unexpected/);
assert.throws(()=>judge({relation_reason:''}),/explanation/);
assert.throws(()=>judge({service_source:'context_9'}),/field/);
assert.throws(()=>judge({extra:true}),/Unexpected/);
assert.throws(()=>contract.validateModelDecisions([d,d],[c,c]),/duplicate/);
// The new phase cannot overwrite accepted baseline ads or verified quotations.
const nodes=[c,{...c,node_id:'b'},{...c,node_id:'c'}],base=[
 {node_id:'a',is_violation:false,author_purpose:'ordinary'},
 {node_id:'b',is_violation:true,author_purpose:'solicitation'},
 {node_id:'c',is_violation:false,author_purpose:'quotation'}];
const out=applyRescueContext(nodes,base,base,[judge({})]);assert.equal(out[1],base[1]);assert.equal(out[2],base[2]);
console.log('PASS: source-owned evidence, missing-service review, no neighbor promotion, baseline preservation');
