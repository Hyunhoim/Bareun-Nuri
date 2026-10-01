const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {load}=require('./envelope-loader.cjs'),{contract}=require('../src/core/judgment.cjs'),{splitCandidate}=require('../src/core/scan.cjs');
const {materialize}=require('../src/core/bounded-scan-store.cjs');
const read=f=>JSON.parse(fs.readFileSync(f));
async function main(){const operating=process.argv.includes('--operating'),large=process.argv.includes('--large'),out=operating?'.runtime/envelope-operating-audit-v1.json':large?'.runtime/envelope-audit-large-v1.json':'.runtime/envelope-audit-v1.json';assert(!fs.existsSync(out));const original=global.fetch,rows=[];try{
 const names=['jamo-context-live-c-v1','batch-order-live-v1','scale-small-live-v1','scale-medium-live-v1'];
 for(const name of operating?[...names,'scale-large-live-v1','scale-medium-envelope-v1']:large?['scale-large-live-v1']:names){
  const dir='.runtime/'+name,manifest=read(dir+'/manifest.json'),cp=read(dir+'/scan/checkpoint.json').state;
  const work=new Map();for(const f of fs.readdirSync(dir+'/snapshots'))for(const c of read(dir+'/snapshots/'+f).candidates)for(const w of splitCandidate(c))work.set(w.node_id,w);
  const decisions=new Map(materialize(dir+'/scan',cp).decisions.map(d=>[d.node_id,d]));
  const events=fs.readFileSync(dir+'/scan/trace.jsonl','utf8').trim().split('\n').map(JSON.parse),responses=new Map(events.filter(e=>e.event==='llm_response').map(e=>[e.call_number,e.data]));
  let matched=0,recovered=0;const recoveredBatches=[];
  for(const req of events.filter(e=>e.event==='llm_request')){
   const data=responses.get(req.call_number);assert(data,'Unconfirmed response, no automatic replay');
   const items=JSON.parse(req.body.messages[1].content).candidates.map(c=>work.get(c.node_id));assert(items.every(Boolean));
   global.fetch=async(url,options)=>{assert.deepEqual(JSON.parse(options.body),req.body,'Request changed');return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:data.choices[0].finish_reason,message:data.choices[0].message,usage:{promptTokens:data.usage.prompt_tokens,completionTokens:data.usage.completion_tokens,totalTokens:data.usage.total_tokens}}}),{status:200});};
   const session=(operating?require('../src/core/llm.cjs'):load().llm).createSession({...manifest.settings,provider:'hcx',apiKey:'offline-stub',minIntervalMs:0,tokensPerMinute:undefined,maxCalls:1},{contract:contract()});
   const ds=await session.decide(items);let newBatch=false;
   for(const d of ds){const prior=decisions.get(d.node_id);if(prior){assert.deepEqual(d,prior,'Changed committed decision');matched++;}else {recovered++;newBatch=true;}}
   if(newBatch)recoveredBatches.push({call:req.call_number,ids:ds.map(d=>d.node_id),decisions:ds});
  }
  rows.push({name,requests:responses.size,matched,recovered,recovered_batches:recoveredBatches});
 }
}finally{global.fetch=original;}fs.writeFileSync(out,JSON.stringify({api_calls:0,rows},null,2));console.log(JSON.stringify(rows.map(({recovered_batches,...x})=>x)));}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
