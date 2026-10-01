const assert=require('node:assert/strict'),contract=require('./direct-contract.cjs');
const {applyRescueContext,decideIdentified}=require('./contextualize.cjs');
const c={node_id:'a',raw_text:'접수 안내',normalized_text:'접수 안내',frame_urls:[],links:[],context_evidence:{target_tag:'h3',scope:{tag:'article'},units:[{relation:'before',text:'구립 체육관 등록'},{relation:'target'}]}};
const raw={node_id:'a',verdict:'근거부족',context_source:'target',reason:'이용 대상 미확정'};
const judge=x=>contract.validateModelDecisions([{...raw,...x}],[c])[0];
assert(judge({}).needs_review);assert(!judge({}).is_violation);assert(judge({verdict:'광고'}).is_violation);
assert.equal(judge({context_source:'context_0'}).evidence_quote,c.context_evidence.units[0].text);
assert.throws(()=>judge({context_source:'context_9'}),/candidate-local/);
assert.throws(()=>judge({verdict:'추측'}),/Invalid/);assert.throws(()=>judge({reason:''}),/Invalid/);
assert.throws(()=>judge({service_kind:'lawful'}),/Invalid/);
assert.throws(()=>contract.validateModelDecisions([raw,raw],[c,c]),/duplicate/);
const evidence=contract.initialEvidence({...c,is_ad:true,case_id:'gold',own_style:{color:'red'}});
for(const key of ['is_ad','case_id','own_style','signals','context_scope','target_tag'])assert(!(key in evidence));
assert(evidence.reading_context.includes('[판정 대상 source=target]'));
const nodes=[c,{...c,node_id:'b'},{...c,node_id:'q'}],base=[{node_id:'a',is_violation:false,author_purpose:'ordinary'},
 {node_id:'b',is_violation:true,author_purpose:'solicitation'},{node_id:'q',is_violation:false,author_purpose:'quotation'}];
const out=applyRescueContext(nodes,base,base,[judge({})]);assert.equal(out[1],base[1]);assert.equal(out[2],base[2]);
async function main(){
 const out=await decideIdentified({decide:async input=>{assert.equal(input.length,1);assert.equal(input[0].node_id,'1');return contract.validateModelDecisions([{...raw,node_id:'1'}],input);}},[c]);
 assert.equal(out[0].node_id,'a');assert(out[0].needs_review);
 const {createSession,configFromEnv}=require('../src/core/llm.cjs'),original=global.fetch;
 try{
  const config={...configFromEnv('hcx',{CLOVASTUDIO_API_KEY:'test-key'}),reasoningEffort:'none',maxCalls:2,minIntervalMs:0,seed:42};
  let attempts=0;
  global.fetch=async(url,options)=>{
   const body=JSON.parse(options.body);assert.equal(body.thinking.effort,'none');assert(body.responseFormat);
   const inputs=JSON.parse(body.messages[1].content).candidates;assert.equal(inputs.length,1);assert.equal(inputs[0].node_id,'1');
   assert.deepEqual(body.responseFormat.schema.properties.decisions.properties['1'].properties.context_source.enum,['target','context_0']);
   const content=++attempts===1?'invalid JSON':JSON.stringify({decisions:{'1':{verdict:'근거부족',context_source:'target',reason:'근거 미확정'}}});
   return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:'stop',message:{content},usage:{promptTokens:1,completionTokens:1,totalTokens:2}}}),{status:200});
  };
  const session=createSession(config,{contract}),result=await decideIdentified(session,[c]);
  assert(result[0].needs_review);assert.equal(session.calls.length,2);assert.equal(result[0].node_id,'a');
 }finally{global.fetch=original;}
 console.log('PASS: direct verdict schema, local evidence, label isolation, uncertainty and baseline preservation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
