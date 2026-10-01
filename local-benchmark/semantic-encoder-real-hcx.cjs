const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
const {body}=require('./slm-three.cjs'),{createSession,configFromEnv}=require('../agent/src/core/llm.cjs'),{estimate}=require('../agent/experiments/semantic-search-run.cjs');
const R='.runtime/semantic-encoder-real-hcx-v1',INPUT='.runtime/semantic-encoder-real-v1/review-inputs.json';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),save=(n,v)=>fs.writeFileSync(R+'/'+n+'.json',JSON.stringify(v,null,2));
function contract(row){return {SYSTEM:body(row).messages[0].content.replace('설명 없이 JSON {"label": 0} 형태로 라벨 정수 하나만 출력하세요.','각 대상마다 label 정수 하나만 출력하세요.'),JUDGE:'각 대상의 게시 행위를 분류하세요.',promptJson:true,formatRepair:false,
 initialEvidence:r=>({node_id:r.node_id,target:r.input.target,context:r.input.context}),modelItemSchema:()=>({type:'object',properties:{label:{type:'integer',enum:[0,1,2,3]}},required:['label'],additionalProperties:false}),
 validateModelDecisions:(v,rs)=>{assert(Array.isArray(v)&&v.length===rs.length);assert.deepEqual(v.map(r=>r.node_id).sort(),rs.map(r=>r.node_id).sort());for(const r of v){assert.deepEqual(Object.keys(r).sort(),['label','node_id']);assert(Number.isInteger(r.label)&&[0,1,2,3].includes(r.label));}return v;}};}
async function main(){
 const rows=read(INPUT).map(r=>({...r,node_id:crypto.createHash('sha256').update(r.id).digest('hex').slice(0,16)})),ids=new Map(rows.map(r=>[r.node_id,r.id]));assert.equal(ids.size,31);assert.equal(sha(INPUT),read('.runtime/semantic-encoder-real-v1/prepared.json').review_inputs_sha256);
 const c=contract(rows[0]),publicConfig={provider:'hcx',reasoningEffort:'none',temperature:0,seed:42,maxTokens:512,maxCalls:6,tokensPerMinute:58000,minIntervalMs:1000,timeoutMs:120000,retryRateLimit:false,retryTransientTransport:false},plans=[];
 for(const [order,rs]of [['forward',rows],['reverse',[...rows].reverse()]])for(let i=0;i<rs.length;i+=12){const batch=rs.slice(i,i+12);plans.push({order,rows:batch,...await estimate(batch,publicConfig,c)});}
 const reserved=plans.reduce((n,p)=>n+p.tokens,0);assert(plans.length===6&&reserved<=50000&&plans.every(p=>p.tokens<=58000));console.log(JSON.stringify({calls:6,reserved,rows:31,live:process.argv.includes('--live')}));
 if(!process.argv.includes('--live')){c.validateModelDecisions([{node_id:'x',label:3}],[{node_id:'x'}]);assert.throws(()=>c.validateModelDecisions([{node_id:'x',label:4}],[{node_id:'x'}]));return;}
 assert(!fs.existsSync(R),'Preserve existing run; no automatic retry');const config={...configFromEnv('hcx',parseEnv(fs.readFileSync('agent/.env','utf8'))),...publicConfig};fs.mkdirSync(R);
 const files=[INPUT,__filename,'local-benchmark/slm-three.cjs','agent/src/core/llm.cjs','agent/src/core/json-envelope.cjs','docs/semantic-encoder-real-hcx-plan.md'];
 save('manifest',{created:new Date().toISOString(),files:Object.fromEntries(files.map(f=>[f,sha(f)])),config:publicConfig,reserved,plans,labels_used:false});
 const started=performance.now(),deadlineAt=Date.now()+600000,signal=AbortSignal.timeout(600000),originalFetch=global.fetch;let sent=0,total=0;
 const session=createSession(config,{contract:c,signal,deadlineAt,onRequestState:e=>fs.appendFileSync(R+'/lifecycle.jsonl',JSON.stringify(e)+'\n'),log:e=>{if(e.event==='llm_request'){assert.deepEqual(e.body,plans[sent].body);sent++;}fs.appendFileSync(R+'/trace.jsonl',JSON.stringify(e)+'\n');}});
 global.fetch=async(...args)=>{const index=sent-1,response=await originalFetch(...args);save(index+'-raw-response',{status:response.status,text:await response.clone().text(),headers:Object.fromEntries([...response.headers].filter(([k])=>/ratelimit|request-id/.test(k)))});return response;};
 try{
  for(const order of ['forward','reverse']){const predictions=[],begin=performance.now();
   for(const p of plans.filter(p=>p.order===order)){assert(total<50000);for(const f of files)assert.equal(sha(f),read(R+'/manifest.json').files[f]);const decisions=await session.decide(p.rows),call=session.calls.at(-1);assert(Number.isFinite(call.usage?.total_tokens));total+=call.usage.total_tokens;predictions.push(...decisions.map(d=>({id:ids.get(d.node_id),label:d.label})));save(order+'-predictions',predictions);save('calls',session.calls);console.log(JSON.stringify({order,processed:predictions.length,calls:sent,tokens:total}));}
   save(order+'-completion',{completed:true,seconds:(performance.now()-begin)/1000,rows:predictions.length});
  }save('completion',{status:'completed',sent,confirmed_tokens:total,seconds:(performance.now()-started)/1000,api_errors:0});
 }catch(error){save('completion',{status:'stopped',sent,confirmed_tokens:total,error:String(error.message).replaceAll(config.apiKey,'[REDACTED]')});throw Error('Stopped; inspect saved evidence. No automatic retry.');}
 finally{save('calls',session.calls);global.fetch=originalFetch;}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={contract};
