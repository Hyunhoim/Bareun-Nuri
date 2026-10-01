// Build the existing HCX request without sending it; no duplicate prompt/schema implementation.
const {createSession,estimateRequestTokens}=require('../src/core/llm.cjs');
async function estimateBatch(candidates,config){
 const stop=Error('request-estimate-only');let estimate;
 const session=createSession({...config,provider:'hcx',apiKey:'ESTIMATE_ONLY',endpoint:'http://127.0.0.1:0',maxCalls:1,
  tokensPerMinute:undefined,minIntervalMs:0,retryRateLimit:false,retryTransientTransport:false},
  {log:e=>{if(e.event==='llm_request'){estimate=estimateRequestTokens(e.body);throw stop;}}});
 try{await session.decide(candidates);throw Error('Estimator unexpectedly completed');}catch(e){if(e!==stop)throw e;}
 if(!Number.isFinite(estimate))throw Error('Request estimate missing');return estimate;
}
async function fitBatch(candidates,config){
 const limit=config.tokensPerMinute;if(!Number.isFinite(limit)||limit<=0)throw Error('Positive request token budget required');
 const items=candidates.slice(0,16);if(!items.length)throw Error('Empty candidate batch');
 if(await estimateBatch(items,config)<=limit)return items;
 let low=1,high=items.length-1,best=0;
 while(low<=high){const n=Math.floor((low+high)/2);if(await estimateBatch(items.slice(0,n),config)<=limit){best=n;low=n+1;}else high=n-1;}
 if(!best)throw Error('Single candidate exceeds request input budget; no truncation performed');
 return items.slice(0,best);
}
module.exports={estimateBatch,fitBatch};
