// Responses transport for the adopted Luna V input. No retries for unknown sends.
const assert=require('node:assert/strict');
const {setTimeout:delay}=require('node:timers/promises');
const llm=require('./llm.cjs'),{contract}=require('./judgment.cjs');
const {messages,render,schemaFor}=require('./luna-input.cjs');
const {parseEnvelope}=require('./json-envelope.cjs');
function cost(u){const d=u.input_tokens_details||{},c=d.cached_tokens||0,w=d.cache_write_tokens||0;return ((u.input_tokens-c-w)*.1+c*.01+w*.125+u.output_tokens*.5)/1e6;}
function configFromEnv(env){assert(env.OPENAI_API_KEY?.trim(),'OPENAI_API_KEY missing');return {provider:'luna',model:'gpt-6-luna',reasoningEffort:'none',endpoint:'https://api.openai.com/v1/responses',apiKey:env.OPENAI_API_KEY.trim(),maxTokens:512,tokensPerMinute:130000,minIntervalMs:1000,structuredOutput:true};}
function parse(raw,cs){
 assert.equal(raw.status,'completed','Refused or truncated Luna response');
 const contents=(raw.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]);assert(!contents.some(x=>x.type==='refusal'),'Luna refusal');
 const text=contents.filter(x=>x.type==='output_text').map(x=>x.text).join(''),v=parseEnvelope(text);
 assert(v&&Object.keys(v).length===1&&v.decisions&&typeof v.decisions==='object'&&!Array.isArray(v.decisions),'Invalid decisions envelope');
 const ids=cs.map(c=>c.node_id),keys=Object.keys(v.decisions);assert(keys.length&&keys.every(id=>ids.includes(id)),'Empty or foreign IDs');
 for(const d of Object.values(v.decisions))assert(d&&typeof d==='object'&&!Array.isArray(d)&&Object.keys(d).length===1&&Object.hasOwn(d,'publication_act'),'Missing or unexpected decision fields');
 const got=contract().validateModelDecisions(keys.map(node_id=>({...v.decisions[node_id],node_id})),cs.filter(c=>keys.includes(c.node_id)));
 if(keys.length<ids.length)throw Object.assign(Error('Confirmed response missing candidate decisions'),{code:'confirmed_incomplete_decisions',quarantine:{requested_ids:ids,missing_ids:ids.filter(id=>!keys.includes(id)),returned_decisions:got,raw_content:text}});
 return got;
}
function createSession(config,options={}){
 
 const {signal,deadlineAt,onRequestState=()=>{},log=()=>{},fetcher=fetch}=options;
 const calls=[],reservations=[];let next=0,gate=Promise.resolve(),tokenCap=config.tokensPerMinute,gap=config.minIntervalMs;
 const bodyFor=cs=>({model:config.model,store:false,reasoning:{effort:'none'},max_output_tokens:config.maxTokens,input:messages(cs),...(config.structuredOutput?{text:{format:{type:'json_schema',name:'publication_decisions',strict:true,schema:schemaFor(cs)}}}:{})});
 const estimate=body=>llm.estimateRequestTokens({messages:body.input,...(body.text?{text:body.text}:{}),maxCompletionTokens:config.maxTokens});
 async function acquire(body){const previous=gate;let release;gate=new Promise(r=>release=r);await previous;try{const n=estimate(body);assert(n<=tokenCap,'Single candidate exceeds request budget');while(true){signal?.throwIfAborted();const now=Date.now();if(deadlineAt&&now>=deadlineAt)throw Error('time_budget');while(reservations.length&&reservations[0].at<=now-61000)reservations.shift();if(now>=next&&reservations.reduce((s,x)=>s+x.tokens,0)+n<=tokenCap){next=now+gap;const r={at:now,tokens:n};reservations.push(r);return r;}await delay(200,undefined,{signal});}}finally{release();}}
 async function once(cs){
  signal?.throwIfAborted();assert(calls.length<config.maxCalls,'LLM call limit exceeded');
  const body=bodyFor(cs);
  const call={number:calls.length+1,role:'judge',provider:'luna',started_at:new Date().toISOString(),usage:null};calls.push(call);const start=performance.now();let r;
  try{r=await acquire(body);call.reserved_tokens=r.tokens;call.queue_wait_sec=(performance.now()-start)/1000;if(deadlineAt&&Date.now()>=deadlineAt)throw Error('time_budget');
   log({event:'llm_request',call_number:call.number,body});call.sent_at_ms=Date.now();onRequestState({phase:'sent',call_number:call.number,sent_at:new Date().toISOString()});
   const timeout=AbortSignal.timeout(config.timeoutMs),response=await fetcher(config.endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.apiKey},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,timeout]):timeout});
   call.http_status=response.status;
   const tokenLimit=Number(response.headers.get('x-ratelimit-limit-tokens')),requestLimit=Number(response.headers.get('x-ratelimit-limit-requests'));
   if(tokenLimit>0)tokenCap=Math.min(tokenCap,Math.floor(tokenLimit*.65));if(requestLimit>0)gap=Math.max(gap,Math.ceil(61000/(requestLimit*.9)));
   call.effective_token_budget=tokenCap;call.effective_min_interval_ms=gap;call.rate_limit=Object.fromEntries([...response.headers].filter(([k])=>/ratelimit|retry-after/i.test(k)));
   onRequestState({phase:response.status===429?'rejected':'responded',call_number:call.number,http_status:response.status});
   const raw=await response.json();log({event:'llm_response',call_number:call.number,data:raw});
   if(!response.ok){if(response.status===429)r.tokens=0;throw Object.assign(Error('luna HTTP '+response.status),{rateLimited:response.status===429,retryAfterMs:Math.max(61000,Number(response.headers.get('retry-after')||0)*1000)});}
   assert.equal(raw.model,config.model,'Returned model mismatch');assert(raw.usage,'Missing provider usage');const u=raw.usage;call.model_returned=raw.model;call.response_id=raw.id;
   call.usage={prompt_tokens:u.input_tokens,completion_tokens:u.output_tokens,total_tokens:u.total_tokens,input_tokens_details:u.input_tokens_details,output_tokens_details:u.output_tokens_details};
   call.USD=cost(u);r.tokens=u.input_tokens+config.maxTokens;call.status='ok';
   try{return parse(raw,cs);}catch(e){if(e.quarantine)e.quarantine.call_number=call.number;throw e;}
  }catch(error){call.status=error.code==='confirmed_incomplete_decisions'?'quarantined':'failed';call.error=String(error.message).replaceAll(config.apiKey,'[REDACTED]');throw error;}
  finally{call.elapsed_sec=(performance.now()-start)/1000;call.finished_at_ms=Date.now();call.service_sec=call.sent_at_ms?(call.finished_at_ms-call.sent_at_ms)/1000:null;}
 }
 async function decide(cs){try{return await once(cs);}catch(e){if(!e.rateLimited||!config.retryRateLimit)throw e;await delay(e.retryAfterMs,undefined,{signal});return once(cs);}}
 async function fitBatch(cs){const proposed=cs.slice(0,12);let n=proposed.length;while(n&&estimate(bodyFor(proposed.slice(0,n)))>tokenCap)n--;assert(n,'Single candidate exceeds input budget; no truncation');return proposed.slice(0,n);}
 return {decide,fitBatch,calls,tracksRequests:true};
}

module.exports={configFromEnv,createSession,parse,render};
