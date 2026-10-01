// Research-only response quarantine. Production modules are never edited.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const llm=require('../agent/src/core/llm.cjs'),{parseEnvelope}=require('../agent/src/core/json-envelope.cjs');
function classify(content,candidates,contract){
 const value=parseEnvelope(content);if(!value||Array.isArray(value)||Object.keys(value).length!==1||!value.decisions||Array.isArray(value.decisions)||typeof value.decisions!=='object')return null;
 const ids=candidates.map(c=>c.node_id),got=Object.keys(value.decisions);if(!got.length||got.length>=ids.length||got.some(id=>!ids.includes(id)))return null;
 const subset=candidates.filter(c=>got.includes(c.node_id));const valid=contract.validateModelDecisions(Object.entries(value.decisions).map(([node_id,d])=>({...d,node_id})),subset);
 return {requested_ids:ids,missing_ids:ids.filter(id=>!got.includes(id)),returned_decisions:valid,raw_content:content};
}
function createSession(config,options){
 let response=null;const session=llm.createSession(config,{...options,log:e=>{if(e.event==='llm_request')response=null;if(e.event==='llm_response')response=e;options.log?.(e)}}),decide=session.decide.bind(session);
 session.decide=async candidates=>{response=null;try{return await decide(candidates);}catch(original){
  let q=null;try{const call=session.calls.at(-1),choice=response?.data?.choices?.[0];if(call?.http_status===200&&call.status==='ok'&&choice?.finish_reason==='stop'&&!choice.message.tool_calls&&!choice.message.refusal&&typeof choice.message.content==='string')q=classify(choice.message.content,candidates,options.contract);}catch{}
  if(!q)throw original;throw Object.assign(Error('Confirmed response missing candidate decisions'),{code:'confirmed_incomplete_decisions',quarantine:{...q,call_number:response.call_number,original_error:original.message}});
 }};return session;
}
function loadBounded(){
 const filename=require.resolve('../agent/src/core/bounded-scan.cjs');let source=fs.readFileSync(filename,'utf8');
 const from='const values=await session.decide(batch);validateDecisions',to=`let values;try{values=await session.decide(batch);}catch(error){
    if(error.code!=='confirmed_incomplete_decisions'||state.inflight.phase!=='responded')throw error;
    state.quarantines ||= [];const record={page_id:selected.id,url:selected.url,offset:selected.offset,...error.quarantine};
    const ref=store.write('quarantine/'+String(state.quarantines.length).padStart(6,'0')+'.json',record,'quarantine_bytes_written',true);
    state.quarantines.push(ref);state.issues.push({url:selected.url,reason:'incomplete_response_page_deferred',missing_ids:record.missing_ids,quarantine:ref});
    state.active=state.active.filter(id=>id!==selected.id);state.service_page=null;state.remaining_quantum=0;state.inflight=null;store.evict(selected.id);progress();continue;
   }validateDecisions`;
 if(source.split(from).length!==2)throw Error('Research patch anchor drift');source=source.replace(from,to).replaceAll("state.issues.length?'collection_gaps':null","state.issues.length?(state.quarantines?.length?'judgment_gaps':'collection_gaps'):null");
 const gate="if(state.status==='completed'){";source=source.replace(gate,"for(const ref of state.quarantines||[]){const q=store.read(ref),p=state.pages.find(p=>p.id===q.page_id);assert(p&&p.offset===q.offset&&!state.active.includes(p.id),'Quarantined page must remain deferred');} "+gate);
 const m=new Module(filename+'.quarantine',module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(source,filename);return {api:m.exports,source};
}
module.exports={classify,createSession,loadBounded};
