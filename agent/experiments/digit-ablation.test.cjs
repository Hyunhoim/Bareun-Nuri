const assert=require('node:assert/strict'),{makeContract}=require('./digit-ablation.cjs');
const base=require('./digit-contract.cjs'),{observeTechniques,integrateObservations}=require('../src/core/techniques.cjs');
const {createSession,configFromEnv}=require('../src/core/llm.cjs'),{decideIdentified}=require('./contextualize.cjs');
const c={node_id:'a',url:'http://localhost/test',location:'p#target',raw_text:'🙂 R0AD 안내'};
const snapshot={candidates:[c]},observations=[observeTechniques(c)],queries=base.digitQueries(snapshot,observations);
const control=makeContract('control'),removed=makeContract('no-readings'),single=makeContract('single');
assert.equal(control.SYSTEM,removed.SYSTEM);assert.equal(control.SYSTEM,single.SYSTEM);
assert.deepEqual(control.modelItemSchema(),removed.modelItemSchema());
const {readings,readings_truncated,...without}=control.initialEvidence(queries[0]);
assert.deepEqual(without,removed.initialEvidence(queries[0]));assert.deepEqual(control.initialEvidence(queries[0]),single.initialEvidence(queries[0]));
assert(!JSON.stringify(removed.initialEvidence(queries[0])).includes('ROAD'));
const answer={node_id:'a',classification:'substitution',reading:'road',reason:'도로를 나타내는 표기'};
const q={...queries[0],node_id:'a'};
assert.equal(removed.validateModelDecisions([answer],[q])[0].reading,'r0');
for(const bad of [{...answer,reading:'RIVER'},{...answer,classification:'literal'},{...answer,extra:true}])assert.throws(()=>removed.validateModelDecisions([bad],[q]));
assert.throws(()=>removed.validateModelDecisions([answer,answer],[q,{...q,node_id:'b'}]));
async function main(){
 const original=global.fetch,bodies=[];let repaired=0;
 try{
  for(const mode of ['control','no-readings','single']){
   global.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);bodies.push({mode,body});
    const first=mode==='no-readings'&&repaired++===0;
    return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:'stop',message:{content:JSON.stringify({decisions:{'1':{classification:'substitution',reading:first?'RIVER':'ROAD',reason:'원문 해석'}}})},usage:{promptTokens:1,completionTokens:1,totalTokens:2}}}));
   };
   const config={...configFromEnv('hcx',{CLOVASTUDIO_API_KEY:'test-key'}),maxCalls:2,minIntervalMs:0};
   const session=createSession(config,{contract:makeContract(mode)}),judgments=await decideIdentified(session,queries);
   assert.equal(session.calls.length,mode==='no-readings'?2:1);assert.equal(judgments[0].node_id,queries[0].node_id);
   const before=JSON.stringify(observations),updated=base.applyDigitJudgments(snapshot,observations,queries,judgments);
   assert.equal(JSON.stringify(observations),before);
   for(const is_violation of [true,false]){
    const intent={node_id:'a',is_violation,needs_review:true,reason:'기존 판단',techniques:[]};
    const final=integrateObservations(snapshot,[intent],updated).decisions[0];
    for(const k of ['node_id','is_violation','needs_review','reason'])assert.equal(final[k],intent[k]);
   }
  }
  assert.deepEqual(bodies[0].body.responseFormat,bodies[1].body.responseFormat);
  assert.equal(bodies[0].body.messages[0].content,bodies[1].body.messages[0].content);
 }finally{global.fetch=original;}
 console.log('PASS: paired input ablation, same prompt/schema, reading validation, bounded repair, identity/intent preservation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
