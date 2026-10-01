const assert=require('node:assert/strict');
const {load}=require('./envelope-loader.cjs'),{contract}=require('../src/core/judgment.cjs');
async function main(){const api=process.argv.includes('--operating')?require('../src/core/llm.cjs'):load().llm,config={...api.configFromEnv('hcx',{CLOVASTUDIO_API_KEY:'test'}),maxTokens:512,maxCalls:1,minIntervalMs:0,reasoningEffort:'none'},old=global.fetch;
 const items=['a','b','c'].map(node_id=>({node_id,raw_text:'서로 독립된 원문',links:[]})),good={decisions:{a:{publication_act:'이용권유'},b:{publication_act:'일반정보'},c:{publication_act:'판단불가'}}};
 let calls=0;const stub=(text,finish='stop')=>{global.fetch=async()=>{calls++;return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:finish,message:{content:text},usage:{promptTokens:10,completionTokens:10,totalTokens:20}}}),{status:200});};};
 try{stub(JSON.stringify(good));const expected=await api.createSession(config,{contract:contract()}).decide(items);
  for(const suffix of ['\n설명입니다.','\nThe labels describe the supplied target.','\n분류는 "대상" 기준입니다.']){stub(JSON.stringify(good)+suffix);assert.deepEqual(await api.createSession(config,{contract:contract()}).decide(items),expected);}
  const bad=[JSON.stringify(good)+'\n{}',JSON.stringify(good)+'\n[]','앞 설명\n'+JSON.stringify(good),JSON.stringify(good).slice(0,-1),JSON.stringify({...good,extra:true}),JSON.stringify({decisions:{...good.decisions,x:{publication_act:'일반정보'}}}),JSON.stringify({decisions:{a:{publication_act:'unknown'},b:good.decisions.b,c:good.decisions.c}}),'{"decisions":{},"decisions":'+JSON.stringify(good.decisions)+'}'];
  for(const text of bad){stub(text);const before=calls;await assert.rejects(()=>api.createSession(config,{contract:contract()}).decide(items));assert.equal(calls,before+1,'No repair/retry');}
  stub(JSON.stringify(good),'length');await assert.rejects(()=>api.createSession(config,{contract:contract()}).decide(items),/truncated/);
  console.log('PASS API0 stub: exact meaning preserved, ambiguous/invalid schema rejected, truncation rejected, no retry');
 }finally{global.fetch=old;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
