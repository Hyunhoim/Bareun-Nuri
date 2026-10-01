const assert=require('node:assert/strict');
const {estimateBatch,fitBatch}=require('./request-budget.cjs');
const {splitCandidate}=require('./progressive.cjs');
const config={provider:'hcx',model:'HCX-007',temperature:0,reasoningEffort:'none',seed:42,maxTokens:3072,tokensPerMinute:52000};
const style={opacity:1,display:'block',font_size:16,color:'rgb(0, 0, 0)',background:'rgb(255, 255, 255)',position:'static',rect:{right:100,bottom:20}};
const make=(id,raw_text)=>({node_id:id,raw_text,normalized_text:raw_text,page_title:'안내',signals:[],nearby:{before:'',after:''},links:[],frame_urls:[],own_style:style,ancestors:[]});
(async()=>{
 const originalFetch=global.fetch;let attempts=0;global.fetch=()=>{attempts++;throw Error('No network permitted');};
 try{
  const short=Array.from({length:16},(_,i)=>make('n'+i,'공공시설 이용 안내'));
  assert.equal((await fitBatch(short,config)).length,16);
  for(const text of ['긴 본문 안내입니다. '.repeat(2400),'인용과 예방에 관한 문장입니다. '.repeat(2600),'😀 자모 ㄱㅏ를 함께 설명합니다. '.repeat(2300)]){
   const parts=splitCandidate(make('long',text)),remaining=[...parts],seen=[];
   while(remaining.length){const batch=await fitBatch(remaining,config);assert(await estimateBatch(batch,config)<=52000);seen.push(...batch.map(c=>c.node_id));remaining.splice(0,batch.length);}
   assert.deepEqual(seen,parts.map(c=>c.node_id));assert.equal(new Set(seen).size,parts.length);
  }
  await assert.rejects(()=>fitBatch([make('too-big','가'.repeat(100000))],config),/Single candidate/);
  assert.equal(attempts,0);console.log('PASS: exact existing request estimator, unchanged normal 16-item batches, large-input ordered coverage, oversized single-item refusal, zero network');
 }finally{global.fetch=originalFetch;}
})().catch(e=>{console.error(e);process.exitCode=1;});
