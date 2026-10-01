const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{parseEnv}=require('node:util');
const {createSession,configFromEnv}=require('../agent/src/core/llm.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{materialize}=require('../agent/src/core/bounded-scan-store.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),root=path.resolve(__dirname,'..'),base=path.join(root,'.runtime/phase1-operating-1790735149471');
const cleanMode=process.argv.includes('--clean-contract');
let cleanSession=createSession;
if(cleanMode){
 const Module=require('node:module'),filename=require.resolve('../agent/src/core/llm.cjs');
 let src=fs.readFileSync(filename,'utf8');
 const line=src.split('\n').find(x=>x.includes("JSON decisions는 모든 입력 node_id"));assert(line);
 const replacement="      messages[0].content += '\n출력 형식은 API에 지정된 JSON 스키마를 따른다. decisions에 입력 node_id 각각의 publication_act를 기록하고 모든 후보를 빠짐없이 포함한다. JSON 외 설명이나 코드 블록은 출력하지 않는다.';";
 src=src.replace(line,replacement.replace("'\n", "'\\n"));
 const m=new Module(filename+'.clean',module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(src,filename);cleanSession=m.exports.createSession;
}
async function main(){
 const dir=path.join(root,(cleanMode?'.runtime/output-contract-':'.runtime/output-format-')+Date.now());fs.mkdirSync(dir);const save=(n,v)=>fs.writeFileSync(path.join(dir,n+'.json'),JSON.stringify(v,null,2));
 const cp=JSON.parse(fs.readFileSync(path.join(base,'scan/checkpoint.json'))),ex=materialize(path.join(base,'scan'),cp.state),by=new Map(ex.work.map(c=>[c.node_id,c]));
 const ranked=cp.state.batch_history.map((b,i)=>({i,hash:sha(JSON.stringify(b.ids))})).sort((a,b)=>a.hash.localeCompare(b.hash));
 let indices=ranked.slice(0,cleanMode?12:18).map(x=>x.i);
 if(cleanMode){const rest=ranked.filter(x=>!indices.includes(x.i)).map(x=>({...x,size:JSON.stringify(cp.state.batch_history[x.i].ids.map(id=>contract().initialEvidence(by.get(id)))).length})).sort((a,b)=>a.size-b.size||a.hash.localeCompare(b.hash));indices.push(...rest.slice(0,3).map(x=>x.i),...rest.slice(-3).map(x=>x.i));}
 const jobs=indices.map(i=>({index:i,items:cp.state.batch_history[i].ids.map(id=>by.get(id))}));assert(jobs.every(j=>j.items.every(Boolean)));assert.equal(new Set(indices).size,18);
 const maxCalls=cleanMode?108:72,maxTokens=cleanMode?750000:500000,duration=cleanMode?1800000:1200000;

 const config={...configFromEnv('hcx',{...process.env,...parseEnv(fs.readFileSync(path.join(root,'agent/.env'),'utf8'))}),maxTokens:512,timeoutMs:180000,maxCalls,minIntervalMs:1000,tokensPerMinute:58000,retryRateLimit:false,retryTransientTransport:false,seed:42};
 const pins=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'))).source_hashes;for(const[f,h]of Object.entries(pins))assert.equal(sha(fs.readFileSync(path.join(root,f))),h);
 const order=cleanMode?['A','B','C','C','B','A']:['A','B','B','A'];save('manifest',{pins,indices,order,source_run:base,plan_sha:sha(fs.readFileSync(cleanMode?'docs/output-contract-plan.md':'docs/output-reliability-plan.md')),settings:{...config,apiKey:undefined},selection:cleanMode?'12 hash-ranked + 3 shortest + 3 longest remaining committed batches':'18 hash-ranked committed batches',cleanMode,max_total_calls:maxCalls,max_total_tokens:maxTokens});save('inputs',jobs);console.log(JSON.stringify({dir,batches:jobs.length,order}));
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('time_budget')),duration),all=[];let totalTokens=0;
 try{for(const[round,arm]of order.entries()){
  const c={...contract(),promptJson:arm==='A'},name=String(round)+'-'+arm,rows=[],events=[];
  const session=(arm==='C'?cleanSession:createSession)(config,{contract:c,signal:ctl.signal,deadlineAt:Date.now()+duration,log:e=>fs.appendFileSync(path.join(dir,name+'-trace.jsonl'),JSON.stringify(e)+'\n'),onRequestState:e=>{events.push(e);save(name+'-lifecycle',events)}});const start=performance.now();let error=null;
  try{for(const job of jobs){const decisions=await session.decide(job.items);rows.push({index:job.index,decisions});save(name+'-rows',rows);save(name+'-calls',session.calls);totalTokens+=session.calls.at(-1).usage?.total_tokens||0;if(totalTokens>maxTokens)throw Error('token_budget');}}
  catch(e){error=String(e.message).replaceAll(config.apiKey,'[REDACTED]');}
  const result={round,arm,error,wall_sec:(performance.now()-start)/1000,rows:rows.length,calls:session.calls};all.push(result);save(name+'-calls',session.calls);save('results',all);console.log(JSON.stringify({round,arm,rows:rows.length,error,wall_sec:result.wall_sec}));if(error)break;
 }}finally{clearTimeout(timer);save('completion',{rounds:all.length,completed:all.length===order.length&&all.every(r=>!r.error),tokens:all.flatMap(r=>r.calls).reduce((n,c)=>n+(c.usage?.total_tokens||0),0),sources_unchanged:Object.entries(pins).every(([f,h])=>sha(fs.readFileSync(path.join(root,f)))===h),no_retries:true});}
 console.log(JSON.stringify({dir,phase:'finished'}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
