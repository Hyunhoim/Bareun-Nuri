const fs=require('node:fs'),assert=require('node:assert/strict');
const {createSession,encode,restore}=require('./throughput-wire.cjs');
const {contract}=require('../src/core/judgment.cjs');
const {splitCandidate}=require('../src/core/scan.cjs');
const {estimateRequestTokens}=require('../src/core/llm.cjs');
const {parseEnvelope}=require('../src/core/json-envelope.cjs');
const read=f=>JSON.parse(fs.readFileSync(f));
async function main(){
 const dir='.runtime/scale-large-live-v1',out=process.argv[2]||'.runtime/throughput-wire-v1';assert(!fs.existsSync(out));
 const work=new Map();for(const f of fs.readdirSync(dir+'/snapshots'))for(const c of read(dir+'/snapshots/'+f).candidates)for(const w of splitCandidate(c))work.set(w.node_id,w);
 const events=fs.readFileSync(dir+'/scan/trace.jsonl','utf8').trim().split('\n').map(JSON.parse),responses=new Map(events.filter(e=>e.event==='llm_response').map(e=>[e.call_number,e.data]));
 const config={...read(dir+'/manifest.json').settings,provider:'hcx',apiKey:'offline',minIntervalMs:0,tokensPerMinute:undefined,maxCalls:1};
 const rows=[],original=global.fetch;
 try{for(const req of events.filter(e=>e.event==='llm_request')){
  const data=responses.get(req.call_number);assert(data);
  const input=JSON.parse(req.body.messages[1].content).candidates,items=input.map(c=>work.get(c.node_id));assert(items.every(Boolean));
  const before=JSON.stringify(items),local=encode(items),raw=parseEnvelope(data.choices[0].message.content);
  const originalDecisions=contract().validateModelDecisions(Object.entries(raw.decisions).map(([node_id,d])=>({...d,node_id})),items);
  const shortRaw={decisions:Object.fromEntries(local.ids.map((id,i)=>['a'+i,raw.decisions[id]]))};
  let wireBody;
  global.fetch=async(url,options)=>{
   wireBody=JSON.parse(options.body);
   // Reconstruct the exact expected wire body; never replace strings inside evidence.
   const expected=structuredClone(req.body),schemaAt=expected.messages[0].content.lastIndexOf('\n'),schema=JSON.parse(expected.messages[0].content.slice(schemaAt+1));
   schema.properties.decisions.properties=Object.fromEntries(local.ids.map((id,i)=>['a'+i,schema.properties.decisions.properties[id]]));
   schema.properties.decisions.required=local.ids.map((_,i)=>'a'+i);
   expected.messages[0].content=expected.messages[0].content.slice(0,schemaAt+1)+JSON.stringify(schema);
   const user=JSON.parse(expected.messages[1].content);user.candidates=user.candidates.map((c,i)=>({...c,node_id:'a'+i}));expected.messages[1].content=JSON.stringify(user);
   assert.deepEqual(wireBody,expected,'Only ID values/schema keys may change');
   return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:'stop',message:{role:'assistant',content:JSON.stringify(shortRaw)},usage:{promptTokens:1,completionTokens:1,totalTokens:2}}}),{status:200});
  };
  assert.deepEqual(await createSession(config).decide(items),originalDecisions);assert.equal(JSON.stringify(items),before);
  rows.push({call:req.call_number,candidates:items.length,before_estimate:estimateRequestTokens(req.body),after_estimate:estimateRequestTokens(wireBody),before_request_chars:JSON.stringify(req.body).length,after_request_chars:JSON.stringify(wireBody).length,before_output_chars:JSON.stringify(raw).length,after_output_chars:JSON.stringify(shortRaw).length});
 }
 // Boundary checks: aliases cannot hide duplicate original IDs or accept foreign results.
 assert.throws(()=>encode([{node_id:'x'},{node_id:'x'}]));assert.throws(()=>encode([{node_id:''}]));
 assert.throws(()=>restore([{node_id:'z'}],['x']));assert.throws(()=>restore([],['x']));assert.throws(()=>restore([{node_id:'a0'},{node_id:'a0'}],['x','y']));
 assert.deepEqual(restore([{node_id:'a1'},{node_id:'a0'}],['x','y']),[{node_id:'y'},{node_id:'x'}]);
 const items=[...work.values()].slice(0,2);for(const decisions of [{a0:{publication_act:'일반정보'}},{bad:{publication_act:'일반정보'},a1:{publication_act:'일반정보'}},{a0:{publication_act:'invalid'},a1:{publication_act:'일반정보'}}]){
  global.fetch=async()=>new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:'stop',message:{content:JSON.stringify({decisions})}}}),{status:200});
  await assert.rejects(()=>createSession(config).decide(items));
 }
 // Shared session, deliberately reversed completion order, isolated local mappings.
 let sent=0;
 global.fetch=async(url,options)=>{
  const input=JSON.parse(JSON.parse(options.body).messages[1].content).candidates;
  const order=sent++;await new Promise(r=>setTimeout(r,order===0?20:0));
  return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:'stop',message:{content:JSON.stringify({decisions:Object.fromEntries(input.map(c=>[c.node_id,{publication_act:'일반정보'}]))})}}}),{status:200});
 };
 const shared=createSession({...config,maxCalls:2}),first=[...work.values()].slice(0,2),second=[...work.values()].slice(4,6);
 const concurrent=await Promise.all([shared.decide(first),shared.decide(second)]);
 assert.deepEqual(concurrent.map(ds=>ds.map(d=>d.node_id)),[first.map(c=>c.node_id),second.map(c=>c.node_id)]);
 assert.equal(shared.calls.length,2);
 }finally{global.fetch=original;}
 const totals=Object.fromEntries(Object.keys(rows[0]).filter(k=>k!=='call').map(k=>[k,rows.reduce((s,r)=>s+r[k],0)]));
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/audit.json',JSON.stringify({api_calls:0,requests:rows.length,totals,rows},null,2));console.log(JSON.stringify({api_calls:0,requests:rows.length,totals}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
