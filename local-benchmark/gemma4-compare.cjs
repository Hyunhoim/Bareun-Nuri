const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process'),{setTimeout:delay}=require('node:timers/promises');
const {plans,validate}=require('./exaone-hcx.cjs'),{hash}=require('./qwen-cpu-setup.cjs');
const ROOT='.runtime/gemma4-cpu',OUT=ROOT+'/comparison-v2',base='http://127.0.0.1:18977';
function request(p){return {messages:p.body.messages,temperature:0,seed:42,max_tokens:p.body.maxCompletionTokens,cache_prompt:false,stream:false,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{name:'ad_intent',strict:true,schema:p.body.responseFormat.schema}}};}
function parse(r,p){assert.equal(r.choices?.[0]?.finish_reason,'stop');assert(!(r.choices[0].message.reasoning_content||'').trim(),'Unexpected reasoning');return validate(r.choices[0].message.content,p.ids);}
async function main(){
 assert(!fs.existsSync(OUT),'Preserve prior run');fs.mkdirSync(OUT);const save=(n,v)=>fs.writeFileSync(OUT+'/'+n+'.json',JSON.stringify(v,null,2));
 const ps=plans().filter(p=>p.phase!=='repeat'),assets=JSON.parse(fs.readFileSync(ROOT+'/assets.json'));for(const a of assets.assets)assert.equal(await hash(ROOT+'/'+a.name),a.sha256);
 const exe=path.resolve(ROOT+'/bin/llama-server.exe');const args=['-m',path.resolve(ROOT+'/gemma-4-E2B_q4_0-it.gguf'),'--host','127.0.0.1','--port','18977','--device','none','--n-gpu-layers','0','--no-kv-offload','--no-op-offload','--fit','off','--threads','8','--threads-batch','8','--ctx-size','16384','--parallel','1','--no-cache-prompt','--cache-ram','0','--no-context-shift','--reasoning','off','--jinja','--offline'];
 save('manifest',{date:new Date().toISOString(),cpu:os.cpus()[0].model,threads:8,input_hash:await hash('.runtime/slm-three/inputs.json'),script_hash:await hash(__filename),exe_hash:await hash(exe),assets,args,calls:ps.length,plans:ps,phase2_used:false});
 const fd=fs.openSync(OUT+'/server.log','w'),server=spawn(exe,args,{windowsHide:true,stdio:['ignore',fd,fd]}),start=performance.now(),rows=[];let fatal=null;
 try{
  let ready=false;for(let i=0;i<120;i++){if(server.exitCode!==null)throw Error('Server exit '+server.exitCode);try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await delay(500);}assert(ready,'startup timeout');save('startup',{seconds:(performance.now()-start)/1000});
  const props=await(await fetch(base+'/props')).json();save('props',props);
  const probe=request(ps[0]);probe.messages=[{role:'user',content:'Return exactly {"unexpected":"bad"}.'}];probe.response_format.json_schema.schema={type:'object',properties:{label:{type:'integer',const:2}},required:['label'],additionalProperties:false};save('schema-probe-request',probe);const probeResp=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(probe),signal:AbortSignal.timeout(30000)});assert(probeResp.ok);const probeData=await probeResp.json();save('schema-probe-response',probeData);assert.deepEqual(parse(probeData,ps[0]),[2],'Schema is not enforced');
  for(const [index,p] of ps.entries()){
   assert(performance.now()-start<3600000,'One hour cap');const body=request(p);save(index+'-request',body);const t=performance.now();
   const resp=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});const text=await resp.text(),seconds=(performance.now()-t)/1000;save(index+'-response',{status:resp.status,text,seconds});assert(resp.ok,'HTTP '+resp.status+': '+text.slice(0,200));
   const r=JSON.parse(text);let pred=null,error=null;try{pred=parse(r,p);}catch(e){error=e.message;}
   rows.push({index,phase:p.phase,rows:p.rows.map((x,i)=>({id:x.id,panel:x.panel,prediction:pred?.[i]??null})),error,seconds,usage:r.usage,timings:r.timings});save('rows',rows);
   if((index+1)%10===0||index===ps.length-1)console.log(JSON.stringify({done:index+1,total:ps.length,phase:p.phase,seconds:(performance.now()-start)/1000,invalid:rows.filter(x=>x.error).length}));
   if(rows.length===3&&rows.every(x=>x.error))throw Error('Three initial format failures');
  }
  try{save('memory',JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${server.pid} | Select-Object WorkingSet64,PeakWorkingSet64,PrivateMemorySize64,CPU | ConvertTo-Json -Compress`],{windowsHide:true,encoding:'utf8'})));}catch{}
 }catch(e){fatal=e.message;console.error(fatal);}finally{server.kill();await Promise.race([new Promise(r=>server.once('exit',r)),delay(5000)]);fs.closeSync(fd);save('completion',{complete:rows.length===ps.length,error:fatal,requests:rows.length,seconds:(performance.now()-start)/1000,server_stopped:server.exitCode!==null||server.signalCode!==null});}
}
if(process.argv.includes('--check')){const p=plans()[0];assert.deepEqual(request(p).messages,p.body.messages);assert.deepEqual(request(p).response_format.json_schema.schema,p.body.responseFormat.schema);assert.deepEqual(parse({choices:[{finish_reason:'stop',message:{content:'{"label":2}'}}]},p),[2]);assert.throws(()=>parse({choices:[{finish_reason:'length',message:{content:'{"label":2}'}}]},p));console.log('PASS exact input and strict output');}else main().catch(e=>{console.error(e);process.exitCode=1});
