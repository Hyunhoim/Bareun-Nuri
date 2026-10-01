const assert=require('node:assert/strict'),fs=require('node:fs');
const {createSession}=require('../agent/src/core/llm.cjs'),{contract}=require('../agent/src/core/judgment.cjs');
async function main(){
 const old=global.fetch,events=[],batches=['a','b'].map(p=>Array.from({length:12},(_,i)=>({node_id:p+i,raw_text:'정상 안내 문구',links:[]})));
 const cfg={provider:'hcx',model:'HCX-007',reasoningEffort:'none',temperature:0,endpoint:'https://stub.invalid',apiKey:'stub',maxTokens:512,maxCalls:2,minIntervalMs:0,tokensPerMinute:58000,timeoutMs:5000,seed:42};
 try{
 global.fetch=async(url,opts)=>{const input=JSON.parse(JSON.parse(opts.body).messages[1].content).candidates,first=input[0].node_id;await new Promise(r=>setTimeout(r,first==='a0'?60:5));return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:'stop',message:{content:JSON.stringify({decisions:Object.fromEntries(input.slice(0,11).map(c=>[c.node_id,{publication_act:'일반정보'}]))})},usage:{promptTokens:100,completionTokens:40,totalTokens:140}}}),{status:200});};
 const session=createSession(cfg,{contract:contract(),onRequestState:e=>events.push(e)}),answers=await Promise.allSettled(batches.map(b=>session.decide(b)));
 assert(answers.every(x=>x.status==='rejected'&&x.reason.code==='confirmed_incomplete_decisions'));
 assert.deepEqual(events.filter(x=>x.phase==='responded').map(x=>x.call_number),[2,1]);
 const observed=answers.map((x,i)=>({expected_call_number:i+1,actual_quarantine_call_number:x.reason.quarantine.call_number,requested_ids:x.reason.quarantine.requested_ids}));
 assert.deepEqual(observed.map(x=>x.actual_quarantine_call_number),[2,2]);
 assert.deepEqual(observed.map(x=>x.requested_ids),batches.map(b=>b.map(c=>c.node_id)));
 const result={api_calls:0,batch:12,tpm:58000,known_limitation_reproduced:true,observed,conclusion:'Operating llm quarantine.call_number uses calls.at(-1), so concurrent responses preserve candidate IDs but can misattribute request number. Experimental execution must own stable request IDs; production concurrency cannot be enabled as-is.'};
 fs.mkdirSync('.runtime/phase1-speed-concurrency-v1',{recursive:true});fs.writeFileSync('.runtime/phase1-speed-concurrency-v1/partial-stub.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{global.fetch=old;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
