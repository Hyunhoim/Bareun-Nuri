// Experiment only: clarify the target's function without changing evidence or output.
const assert=require('node:assert/strict');
const {contract:baseContract}=require('../src/core/judgment.cjs');
const ADDITION='\n대상이 짧거나 명사형이어도 그 대상이 문맥에서 맡은 기능을 판정한다. 같은 게시물 안에서 대상에 직접 연결된 내용이 실제 불법 서비스의 이용 경로를 제공하면 그 기능을 함께 평가한다. 단순히 주변에 광고가 있다는 이유로 대상까지 이용권유로 분류하지 않는다. 반대로 경고나 인용 표현이 있다는 이유만으로 인용보도로 분류하지 않는다. 해당 표현을 설명·비판하는 행위인지, 이용 경로를 제공하는 행위인지 대상과 직접 연결된 내용에서 구분하며 그 연결이 확인되지 않으면 추측하지 않는다.';
function contract(){const base=baseContract();return {...base,SYSTEM:base.SYSTEM+ADDITION};}
function transformBody(body){
 const result=structuredClone(body),base=baseContract();
 const system=result.messages?.find(m=>m.role==='system');
 assert(system&&typeof system.content==='string'&&system.content.startsWith(base.SYSTEM),'Expected current operational system prompt');
 system.content=contract().SYSTEM+system.content.slice(base.SYSTEM.length);
 return result;
}
module.exports={contract,transformBody};
if(require.main===module){
 const base=baseContract(),candidate={node_id:'sample',raw_text:'참여 안내',normalized_text:'참여 안내',page_title:'안내',links:[{text:'이동',url:'https://example.test/?x=1'}],nearby:{before:'서로 다른 글의 내용'},context_evidence:{scope:{tag:'section'},target_quoted:false,truncated:false,units:[{relation:'before',text:'같은 문맥 설명'},{relation:'target',text:'참여 안내'}]}};
 const body={messages:[{role:'system',content:base.SYSTEM+'\n현재 역할: '+base.JUDGE},{role:'user',content:JSON.stringify({candidates:[base.initialEvidence(candidate)]})}],maxCompletionTokens:512,responseFormat:{type:'json_schema',schema:base.modelItemSchema()}};
 const before=structuredClone(body),changed=transformBody(body);
 assert.deepEqual(body,before);
 assert.notEqual(changed.messages[0].content,body.messages[0].content);
 assert.equal(changed.messages[0].content,contract().SYSTEM+'\n현재 역할: '+base.JUDGE);
 changed.messages[0].content=body.messages[0].content;
 assert.deepEqual(changed,body);
 assert.deepEqual(contract().initialEvidence(candidate),base.initialEvidence(candidate));
 assert.deepEqual(contract().modelItemSchema(),base.modelItemSchema());
 console.log('Context variant: original body, all evidence and output schema preserved');
}
