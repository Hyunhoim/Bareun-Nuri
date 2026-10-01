// Common response-envelope candidate, tested offline and via the actual LLM contract.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseCandidate}=require('./antispoof-response-audit.cjs'),{parseEnvelope}=require('../agent/src/core/json-envelope.cjs');
const {contract}=require('../agent/src/core/judgment.cjs');
function load(){const file=require.resolve('../agent/src/core/llm.cjs'),source=fs.readFileSync(file,'utf8'),needle="const {parseEnvelope}=require('./json-envelope.cjs');";assert.equal(source.split(needle).length,2);const m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(source.replace(needle,'const {parseCandidate:parseEnvelope}=require('+JSON.stringify(require.resolve('./antispoof-response-audit.cjs'))+');'),file);return m.exports;}
async function main(){
 const root='.runtime/antispoof-response-regression-v1';assert(!fs.existsSync(root));fs.mkdirSync(root);
 const sources=JSON.parse(fs.readFileSync('.runtime/envelope-operating-audit-v1.json')).rows.map(r=>'.runtime/'+r.name+'/scan/trace.jsonl');sources.push('.runtime/antispoof-live-1790709109240/baseline/scan/trace.jsonl');
 let preserved=0;const failures=[],recoveries=[],manifest=[];
 for(const file of sources){assert(fs.existsSync(file),file);manifest.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});for(const e of fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.event==='llm_response')){
  const text=e.data.choices?.[0]?.message?.content??e.data.result?.message?.content;assert.equal(typeof text,'string');let old,next,oldError,newError;try{old=parseEnvelope(text);}catch(e){oldError=e.message;}try{next=parseCandidate(text);}catch(e){newError=e.message;}
  if(!oldError){assert(!newError);assert.deepEqual(next,old);preserved++;}else if(!newError)recoveries.push({file,call:e.call_number});else failures.push({file,call:e.call_number,error:newError});
 }}
 const api=load(),config={...api.configFromEnv('hcx',{CLOVASTUDIO_API_KEY:'TEST_ONLY'}),maxTokens:512,maxCalls:1,minIntervalMs:0,reasoningEffort:'none',retryRateLimit:false,retryTransientTransport:false};
 const cs=['a','b','c'].map(node_id=>({node_id,raw_text:'독립 대상 원문',links:[]})),good={decisions:{a:{publication_act:'이용권유'},b:{publication_act:'일반정보'},c:{publication_act:'판단불가'}}},plain=JSON.stringify(good);let calls=0,checks=0;const original=global.fetch;
 const set=(text,finish='stop')=>{global.fetch=async()=>{calls++;return new Response(JSON.stringify({status:{code:'20000'},result:{finishReason:finish,message:{content:text},usage:{promptTokens:20,completionTokens:20,totalTokens:40}}}),{status:200});};};
 try{set(plain);const expected=await api.createSession(config,{contract:contract()}).decide(cs);
  for(const text of [plain,plain+'\n설명','```json\n'+plain+'\n```','```json\n'+plain+'\n```\n설명','```\r\n'+plain+'\r\n```\r\n설명']){set(text);assert.deepEqual(await api.createSession(config,{contract:contract()}).decide(cs),expected);checks++;}
  for(const text of ['설명\n'+plain,'```json\n'+plain+'\n```\n{}','```json\n'+plain+'\n```\n```\ntext\n```','```json\n'+plain.slice(0,-1)+'\n```\n설명','```json\n{"decisions":{},"decisions":{}}\n```\n설명',JSON.stringify({...good,extra:true}),JSON.stringify({decisions:{...good.decisions,x:{publication_act:'일반정보'}}}),JSON.stringify({decisions:{...good.decisions,a:{publication_act:'invalid'}}})]){set(text);const before=calls;await assert.rejects(()=>api.createSession(config,{contract:contract()}).decide(cs));assert.equal(calls,before+1);checks++;}
  set('```json\n'+plain+'\n```\n설명','length');await assert.rejects(()=>api.createSession(config,{contract:contract()}).decide(cs),/truncated/);checks++;
 }finally{global.fetch=original;}
 const pins=JSON.parse(fs.readFileSync('.runtime/antispoof-scope-v1/operating-before.json'));for(const[f,h]of Object.entries(pins))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),h);
 const summary={preserved,recoveries,failures,contract_checks:checks,stub_calls:calls,api:0,production_files_unchanged:Object.keys(pins).length,source_manifest:manifest};fs.writeFileSync(root+'/summary.json',JSON.stringify(summary,null,2));console.log({preserved,recoveries,still_rejected:failures.length,contract_checks:checks,api:0});
}
module.exports={load};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
