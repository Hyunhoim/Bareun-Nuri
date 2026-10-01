const assert=require('node:assert/strict'),contract=require('./digit-contract.cjs');
const {observeTechniques,integrateObservations}=require('../src/core/techniques.cjs');
const {decideIdentified}=require('./contextualize.cjs');
const candidate={node_id:'a',url:'http://localhost/check',location:'p#x',raw_text:'🙂 R0AD와 7EST 안내',normalized_text:'unused'};
const snapshot={candidates:[candidate]},observations=[observeTechniques(candidate)],queries=contract.digitQueries(snapshot,observations);
assert.equal(queries.length,2);assert.equal(queries[0].token,'R0AD');assert.equal(queries[1].token,'7EST');
assert(contract.readings('B00K5').values.includes('BOOKS'));assert(contract.readings('11111111').truncated);
assert.deepEqual(contract.digitQueries({candidates:[{...candidate,raw_text:'한국어 2026 안내'}]},[observeTechniques({...candidate,raw_text:'한국어 2026 안내'})]),[]);
const evidence=contract.initialEvidence({...queries[0],is_ad:true,classification:'substitution',family:'secret',case_id:'gold'});
for(const k of ['is_ad','classification','family','case_id','owner_node_id'])assert(!(k in evidence));
assert(evidence.target_text.includes('[표기 대상]R0AD[/표기 대상]'));
const answer=(q,classification)=>({node_id:q.node_id,classification,reading:classification==='substitution'?'r0':'none',reason:'문맥에 근거한 표기 판단'});
assert.throws(()=>contract.validateModelDecisions([{...answer(queries[0],'literal'),is_violation:true}],queries.slice(0,1)),/Invalid/);
assert.throws(()=>contract.validateModelDecisions([{...answer(queries[0],'substitution'),reading:'r999'}],queries.slice(0,1)),/reading/);
assert.throws(()=>contract.validateModelDecisions([answer(queries[0],'literal'),answer(queries[0],'literal')],queries),/duplicate/);
const old=JSON.stringify(observations),updated=contract.applyDigitJudgments(snapshot,observations,queries,queries.map(q=>answer(q,'substitution')));
assert.equal(JSON.stringify(observations),old);assert.equal(updated[0].observations.filter(o=>o.technique==='HOMOGLYPH').length,1);
const literal=contract.applyDigitJudgments(snapshot,observations,queries,queries.map(q=>answer(q,'literal')));
assert.equal(literal[0].unresolved.filter(x=>x.technique==='HOMOGLYPH').length,0,'Resolve hint containing a Korean particle');
for(const e of updated[0].observations[0].evidence)assert.equal(e.text,candidate.raw_text.slice(e.start,e.end));
assert.throws(()=>contract.applyDigitJudgments(snapshot,observations,queries.map(q=>({...q,start:0})),queries.map(q=>answer(q,'literal'))),/source mismatch/);
const uncertain=contract.applyDigitJudgments(snapshot,observations,queries,queries.map(q=>answer(q,'uncertain')));
assert.equal(uncertain[0].unresolved.filter(x=>x.reason==='digit-substitution-unresolved').length,2);
for(const ad of [true,false])for(const review of [true,false]){
 const baseline=[{node_id:'a',is_violation:ad,needs_review:review,reason:'원래 의미 판정',techniques:[]}];
 const combined=integrateObservations(snapshot,baseline,updated).decisions[0];assert.equal(combined.is_violation,ad);assert.equal(combined.needs_review,review);assert.equal(combined.reason,baseline[0].reason);
 assert.deepEqual(combined.techniques,ad?['HOMOGLYPH']:[]);
}
async function main(){
 const {createSession,configFromEnv}=require('../src/core/llm.cjs'),original=global.fetch;let attempts=0;
 try{
  global.fetch=async(url,options)=>{const body=JSON.parse(options.body),q=JSON.parse(body.messages[1].content).candidates[0];
   assert.equal(body.thinking.effort,'none');assert.deepEqual(body.responseFormat.schema.properties.decisions.properties['1'].properties.reading.enum,q.source_ids);
   const content=++attempts===1?'bad JSON':JSON.stringify({decisions:{'1':{classification:'literal',reading:'none',reason:'고유 번호'}}});
   return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:'stop',message:{content},usage:{promptTokens:1,completionTokens:1,totalTokens:2}}}));
  };
  const config={...configFromEnv('hcx',{CLOVASTUDIO_API_KEY:'test-key'}),reasoningEffort:'none',maxCalls:2,minIntervalMs:0};
  const session=createSession(config,{contract}),result=await decideIdentified(session,queries.slice(0,1));
  assert.equal(result[0].node_id,queries[0].node_id);assert.equal(result[0].classification,'literal');assert.equal(session.calls.length,2);
 }finally{global.fetch=original;}
 console.log('PASS: digit spans/readings, ownership, label isolation, intent preservation, HCX schema and bounded repair');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
