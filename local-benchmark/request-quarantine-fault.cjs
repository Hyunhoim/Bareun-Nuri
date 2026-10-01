require('./request-quarantine-preload.cjs');
const fs=require('node:fs'),path=require('node:path'),{parseEnvelope}=require('../agent/src/core/json-envelope.cjs');
const original=global.fetch;let count=0;
global.fetch=async(...args)=>{
 const response=await original(...args);count++;
 if(count!==20||!response.ok)return response;
 const raw=await response.clone().json(),value=parseEnvelope(raw.result?.message?.content);
 if(raw.result?.finishReason!=='stop'||!value?.decisions||Object.keys(value.decisions).length<2)throw Error('Fault injection requires a complete multi-candidate response');
 const before=structuredClone(raw),removed=Object.keys(value.decisions).at(-1);delete value.decisions[removed];raw.result.message.content=JSON.stringify(value);
 fs.writeFileSync(path.join(process.env.QUARANTINE_RUN_DIR,'fault.json'),JSON.stringify({call:count,removed,original:before,injected:raw,scope:'Controlled response fault, not a provider error'},null,2));
 return new Response(JSON.stringify(raw),{status:response.status,headers:response.headers});
};
