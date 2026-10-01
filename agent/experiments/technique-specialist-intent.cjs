// One common HCX intent result for every technique arm; not a crawler throughput trial.
const fs=require('node:fs'),assert=require('node:assert/strict'),{parseEnv}=require('node:util');
const {createSession,configFromEnv}=require('../src/core/llm.cjs'),{contract}=require('../src/core/judgment.cjs');
const ROOT='.runtime/technique-specialist-intent-v1',DATA='.runtime/technique-specialist-data-v3';
async function main(){assert(!fs.existsSync(ROOT));assert(JSON.parse(fs.readFileSync('.runtime/technique-specialist-hcx-v1/completion.json')).completed);fs.mkdirSync(ROOT);
 const config={...configFromEnv('hcx',{...process.env,...parseEnv(fs.readFileSync('agent/.env','utf8'))}),reasoningEffort:'none',temperature:0,seed:42,maxTokens:512,maxCalls:32,tokensPerMinute:58000,minIntervalMs:1000,retryRateLimit:false,retryTransientTransport:false};
 const session=createSession(config,{contract:contract(),deadlineAt:Date.now()+600000,log:e=>fs.appendFileSync(ROOT+'/trace.jsonl',JSON.stringify(e)+'\n'),onRequestState:e=>fs.appendFileSync(ROOT+'/lifecycle.jsonl',JSON.stringify(e)+'\n')});
 const start=performance.now();try{for(const split of ['dev','final']){const rows=JSON.parse(fs.readFileSync(DATA+'/'+split+'-inputs.json')),decisions=[];
  const cs=rows.map(x=>({node_id:x.id,raw_text:x.raw_text,page_title:x.input.context,links:[],nearby:[],context_evidence:{scope:'synthetic_article',target_quoted:false,truncated:false,units:[{relation:'target',text:x.raw_text}]}}));
  for(let i=0;i<cs.length;i+=12){decisions.push(...await session.decide(cs.slice(i,i+12)));fs.writeFileSync(ROOT+'/'+split+'-decisions.json',JSON.stringify(decisions,null,2));fs.writeFileSync(ROOT+'/calls.json',JSON.stringify(session.calls));console.log(JSON.stringify({split,done:decisions.length}));}
 }fs.writeFileSync(ROOT+'/completion.json',JSON.stringify({completed:true,calls:session.calls.length,tokens:session.calls.reduce((n,c)=>n+(c.usage?.total_tokens||0),0),wall_sec:(performance.now()-start)/1000,scope:'saved synthetic inputs, common batch12 intent; not operating page grouping'}));}
 catch(e){fs.writeFileSync(ROOT+'/completion.json',JSON.stringify({completed:false,error:String(e.message).replaceAll(config.apiKey,'[REDACTED]')}));process.exitCode=1;}
 finally{fs.writeFileSync(ROOT+'/calls.json',JSON.stringify(session.calls));}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
