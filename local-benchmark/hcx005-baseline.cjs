const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {parseEnv}=require('node:util'),{setTimeout:delay}=require('node:timers/promises');
const {estimate}=require('../agent/experiments/semantic-search-run.cjs'),judgment=require('../agent/src/core/judgment.cjs');
const {parse}=require('./qwen-hcx.cjs'),{score}=require('./qwen-hcx-audit.cjs');
const OUT='.runtime/hcx005-baseline-v1',INPUT='.runtime/throughput-hypotheses-v1/inputs.json';
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
 const panels=read(INPUT),cs=panels.flatMap(p=>p.snapshot.candidates),labels=panels.flatMap(p=>p.labels);assert.equal(cs.length,137);
 const plans=[];let reserved=0;
 for(const reverse of [false,true]){const items=reverse?[...cs].reverse():cs,requests=[];for(let i=0;i<items.length;i+=12){const candidates=items.slice(i,i+12),e=await estimate(candidates,{provider:'hcx',temperature:0,maxTokens:512,reasoningEffort:'none',seed:42},judgment.contract());assert(e.tokens<58000);reserved+=e.tokens*2;requests.push({candidates,body:e.body,tokens:e.tokens});}plans.push(requests);}
 assert(reserved<=300000);console.log(JSON.stringify({calls:48,reserved,candidates:cs.length}));if(!process.argv.includes('--live'))return;
 assert(!fs.existsSync(OUT),'Existing run must not be retried');const env=parseEnv(fs.readFileSync('agent/.env','utf8')),keys={'005':env.CLOVASTUDIO_HCX005_API_KEY?.trim(),'007':env.CLOVASTUDIO_API_KEY?.trim()};assert(keys['005']&&keys['007'],'Missing keys');
 fs.mkdirSync(OUT);const save=(n,v)=>fs.writeFileSync(OUT+'/'+n+'.json',JSON.stringify(v,null,2)),files=[__filename,INPUT,'docs/hcx005-baseline-plan.md','agent/src/core/llm.cjs','agent/src/core/judgment.cjs','agent/src/core/json-envelope.cjs'],hashes=Object.fromEntries(files.map(f=>[f,sha(f)]));save('manifest',{hashes,reserved,plans,started:new Date().toISOString()});
 const conditions=['007-forward','005-forward','005-reverse','007-reverse'],results={},reservations=[];let last=0,attempts=0;const deadline=Date.now()+3600000;
 try{for(const condition of conditions){const model=condition.slice(0,3),plan=plans[condition.endsWith('reverse')?1:0],rows=[];for(const [index,p]of plan.entries()){
 for(const[f,h]of Object.entries(hashes))assert.equal(sha(f),h);
 let wait=0;while(true){assert(Date.now()<deadline,'Deadline');const now=Date.now();while(reservations.length&&reservations[0].at<=now-61000)reservations.shift();if(now-last>=1000&&reservations.reduce((s,r)=>s+r.tokens,0)+p.tokens<=58000)break;await delay(1000);wait++;}
 const body=structuredClone(p.body);if(model==='005'){delete body.thinking;delete body.maxCompletionTokens;body.maxTokens=512;}assert.deepEqual(body.messages,p.body.messages);
 const prefix=condition+'-'+index;save(prefix+'-request',{model:'HCX-'+model,body,ids:p.candidates.map(c=>c.node_id),status:'about_to_send'});assert(++attempts<=48);last=Date.now();const reservation={at:last,tokens:p.tokens};reservations.push(reservation);const start=performance.now();
 const response=await fetch('https://clovastudio.stream.ntruss.com/v3/chat-completions/HCX-'+model,{method:'POST',headers:{Authorization:'Bearer '+keys[model],'Content-Type':'application/json','X-NCP-CLOVASTUDIO-REQUEST-ID':crypto.randomUUID()},body:JSON.stringify(body),signal:AbortSignal.timeout(Math.min(180000,deadline-Date.now()))});
 const text=await response.text(),seconds=(performance.now()-start)/1000;save(prefix+'-response',{status:response.status,text,seconds,headers:Object.fromEntries([...response.headers].filter(([k])=>/ratelimit|request-id/.test(k)))});assert(response.ok,'HTTP '+response.status);const data=JSON.parse(text);assert.equal(data.status?.code,'20000');const r=data.result;assert(r?.message,'Missing message');if(Number.isFinite(r.usage?.promptTokens))reservation.tokens=r.usage.promptTokens+512;
 let decisions=null,error=null;try{assert.notEqual(r.finishReason,'length','Output truncated');decisions=parse(r.message.content,p.candidates);}catch(e){error=e.message;}
 rows.push({index,seconds,wait_sec:wait,usage:r.usage,finish:r.finishReason,decisions,error});save(condition+'-rows',rows);console.log(JSON.stringify({condition,done:index+1,valid:!!decisions,seconds}));
 }const ds=rows.flatMap(r=>r.decisions||[]),by=new Map(ds.map(d=>[d.node_id,d]));results[condition]={...score(labels,ds),seconds:rows.reduce((s,r)=>s+r.seconds,0),wait_sec:rows.reduce((s,r)=>s+r.wait_sec,0),tokens:rows.reduce((s,r)=>s+(r.usage?.totalTokens||0),0),valid_batches:rows.filter(r=>r.decisions).length,errors:labels.filter(l=>typeof l.is_ad==='boolean'&&(!by.has(l.node_id)||l.is_ad!==!!(by.get(l.node_id).is_violation&&!by.get(l.node_id).needs_review))),panels:Object.fromEntries(panels.map(p=>[p.name,score(p.labels,ds)]))};save('results',results);}
 save('completion',{status:'completed',attempts});
 }catch(e){save('completion',{status:'stopped',attempts,error:String(e.message).replaceAll(keys['005'],'[REDACTED]').replaceAll(keys['007'],'[REDACTED]')});throw Error('Experiment stopped; inspect saved completion, do not auto retry');}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
