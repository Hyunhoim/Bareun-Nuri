// Pipeline contract checks; all HTTP responses are stubbed, with no paid API calls.
const assert=require('node:assert/strict');
const {configFromEnv,createSession,validateModelDecisions}=require('./src/core/llm.cjs');
const {outputResult}=require('./src/core/output.cjs');
const candidates=[['ad','가입 권유'],['normal','자모 교육'],['unknown','문맥 없음']].map(([node_id,raw_text])=>({
  node_id,raw_text,normalized_text:raw_text,page_title:'검사',own_style:{},signals:['JAMO'],nearby:'',links:[],frame_urls:[],url:'http://localhost/check',location:'#'+node_id
}));
const keyed={ad:{ad_verdict:'violation',observed_techniques:['JAMO'],needs_review:false,reason:'이용 권유'},
  normal:{ad_verdict:'benign',observed_techniques:['JAMO'],needs_review:false,reason:'교육 문맥'},
  unknown:{ad_verdict:'uncertain',observed_techniques:[],needs_review:false,reason:''}};
const entries=()=>Object.entries(keyed).map(([node_id,d])=>({node_id,...d}));
const config={...configFromEnv('hcx',{CLOVASTUDIO_API_KEY:'unit-test-key'}),maxCalls:3,minIntervalMs:0,seed:42,maxTokens:3072};
const response=(content,finishReason='stop')=>new Response(JSON.stringify({status:{code:'20000'},result:{finishReason,message:{content},usage:{promptTokens:10,completionTokens:5,totalTokens:15}}}),{status:200});
async function main(){
  assert.throws(()=>configFromEnv('qwen',{}),/provider/);
  assert.throws(()=>configFromEnv('hcx',{}),/agent\/\.env/);
  const parsed=validateModelDecisions(entries(),candidates);
  assert.deepEqual(parsed[1].techniques,[]);assert.deepEqual(parsed[1].observed_techniques,['JAMO']);assert.equal(parsed[2].needs_review,true);
  assert.throws(()=>validateModelDecisions([entries()[0],entries()[0],entries()[2]],candidates),/duplicate/);
  const out=outputResult({entry_url:'http://localhost/check',candidates},parsed,new Date().toISOString(),1,'hcx');
  assert.equal(out.result.findings.length,1);assert.equal(out.result.findings[0].evidence_text,candidates[0].raw_text);assert.equal(out.diagnostics.length,1);
  const originalFetch=global.fetch,requests=[];
  try {
    global.fetch=async(url,options)=>{requests.push(JSON.parse(options.body));return response(JSON.stringify({decisions:keyed}));};
    const session=createSession(config);assert.deepEqual(await session.decide(candidates),parsed);assert.equal(session.calls.length,1);
    assert(!('tools' in requests[0]));assert.deepEqual(requests[0].responseFormat.schema.properties.decisions.required,candidates.map(c=>c.node_id));
    assert.equal(JSON.parse(requests[0].messages[1].content).phase,'initial');
    let attempts=0;global.fetch=async()=>response(++attempts===1?'bad json':JSON.stringify({decisions:keyed}));
    assert.deepEqual(await createSession(config).decide(candidates),parsed);assert.equal(attempts,2);
    global.fetch=async()=>response('bad json');await assert.rejects(()=>createSession({...config,maxCalls:1}).decide(candidates),/call limit/);
    global.fetch=async()=>response('{}','length');await assert.rejects(()=>createSession(config).decide(candidates),/truncated/);
    global.fetch=async()=>new Response(JSON.stringify({status:{message:'unit-test-key rejected'}}),{status:401});
    await assert.rejects(()=>createSession(config).decide(candidates),e=>e.message.includes('[REDACTED]')&&!e.message.includes('unit-test-key'));
    const controller=new AbortController();controller.abort(Error('cancelled'));
    await assert.rejects(()=>createSession(config,{signal:controller.signal}).decide(candidates),/cancelled/);
  }finally{global.fetch=originalFetch;}
  console.log('PASS: Pipeline schema, evidence, review, repair, limits, truncation, key redaction and cancellation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
