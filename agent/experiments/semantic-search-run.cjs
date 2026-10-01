// Bounded parallel comparisons, sharing one account budget. Never imported by production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseEnv}=require('node:util'),{setTimeout:delay}=require('node:timers/promises');
const {createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs');
const {contract:prior}=require('./semantic-intent-contract.cjs'),{score}=require('./context-ownership.cjs');
const {integrateObservations}=require('../src/core/techniques.cjs');
const project=path.resolve(__dirname,'../..'),read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function method(mode){if(mode==='O')return prior('O');if(mode.startsWith('reference'))return require('./semantic-reference.cjs').contract();if(mode==='act'||mode==='act4')return require('./semantic-act.cjs').contract();if(mode==='J'||mode==='JJson')return {...prior('J'),...(mode==='JJson'?{promptJson:true}:{})};if(mode==='S'||mode==='S4')return prior('S');if(mode.startsWith('passage'))return {...require('./semantic-passage.cjs').contract(),...(mode.includes('Json')?{promptJson:true}:{})};return require('./semantic-methods.cjs').contract(mode.replace(/4$/,''));}
const batchSize=mode=>Number(mode.match(/([48])$/)?.[1]||16);
async function estimate(candidates,config,contract){const stop=Error('estimate-only');let body;
 const session=createSession({...config,apiKey:'ESTIMATE_ONLY',endpoint:'http://127.0.0.1:0',maxCalls:1,minIntervalMs:0,tokensPerMinute:undefined},{contract,log:e=>{if(e.event==='llm_request'){body=e.body;throw stop;}}});
 try{await session.decide(candidates);throw Error('Estimator unexpectedly completed');}catch(e){if(e!==stop)throw e;}return {tokens:estimateRequestTokens(body),body};
}
function measured(group,decisions,calls){const result=score(group.labels,decisions),by=new Map(decisions.map(d=>[d.node_id,d]));
 result.explicit_uncertain=group.labels.filter(l=>l.is_ad===null&&by.get(l.node_id).raw_ad_verdict==='uncertain').length;
 result.unknown_predicted_ad=group.labels.filter(l=>l.is_ad===null&&by.get(l.node_id).is_violation&&!by.get(l.node_id).needs_review).length;
 result.empty_reasons=decisions.filter(d=>!d.reason.trim()).length;
 if(group.snapshot.technique_observations?.length===decisions.length){const integrated=integrateObservations(group.snapshot,decisions,group.snapshot.technique_observations);result.observer={...score(group.labels,integrated.decisions),unresolved:integrated.technique_diagnostics.length};}
 result.tokens=calls.reduce((n,c)=>n+(c.usage?.total_tokens||0),0);result.calls=calls.length;
 result.service_sec=calls.reduce((n,c)=>n+(c.service_sec||0),0);result.api_queue_sec=calls.reduce((n,c)=>n+(c.queue_wait_sec||0),0);
 return result;
}
function groupsFor(panel,data){if(panel==='diagnostic'){const parts=['dev','confirmation'].map(n=>({labels:read(path.join(data,n+'-labels.json')),snapshot:read(path.join(data,n+'-evidence.json'))}));return [{name:panel,labels:parts.flatMap(p=>p.labels),snapshot:{candidates:parts.flatMap(p=>p.snapshot.candidates),technique_observations:parts.flatMap(p=>p.snapshot.technique_observations)}}];}
 if(panel==='regression'){const old=read(path.join(project,'.runtime/stage4-reuse/pilot-evidence.json')),labels=read(path.join(project,'.runtime/stage4-reuse/pilot-labels.json')),ids=new Set(labels.map(l=>l.node_id));return [{name:panel,labels,snapshot:{candidates:old.candidates.filter(c=>ids.has(c.node_id)),technique_observations:old.technique_observations.filter(o=>ids.has(o.node_id))}}];}
 return [{name:panel,labels:read(path.join(data,'evaluation-labels.json')),snapshot:read(path.join(data,'evaluation-evidence.json'))}];
}
function reordered(group,round){if(!round)return group;const ranked=group.snapshot.candidates.map(c=>({c,key:crypto.createHash('sha256').update('evaluation-order-'+c.node_id).digest('hex')})).sort((a,b)=>a.key.localeCompare(b.key));return {...group,snapshot:{...group.snapshot,candidates:ranked.map(x=>x.c)}};}
async function runComparison({root,groups,modes,rounds=1,maxTokens=3072,resumeFrom,methodSpecs={},sourceFiles=[],limits={calls:40,tokens:650000,seconds:3600}}){
 for(const mode of modes)if(methodSpecs[mode]){const s=methodSpecs[mode];assert(s.contract&&Number.isInteger(s.batchSize)&&s.batchSize>=1&&s.batchSize<=16,'Invalid external method');assert(Number.isInteger(s.maxTokens)&&s.maxTokens>0,'Invalid external output budget');}
 assert(!fs.existsSync(root),'Use new output directory');fs.mkdirSync(root,{recursive:true});const save=(n,v)=>fs.writeFileSync(path.join(root,n+'.json'),JSON.stringify(v,null,2));
 const files=[__filename,require.resolve('./semantic-methods.cjs'),require.resolve('./semantic-intent-contract.cjs'),require.resolve('./context-ownership.cjs'),require.resolve('./priority-one.cjs'),require.resolve('../src/core/llm.cjs'),require.resolve('../src/core/techniques.cjs'),path.join(project,'docs/semantic-search-plan.md')];
 if(modes.some(m=>m.startsWith('passage')))files.push(require.resolve('./semantic-passage.cjs'),path.join(project,'docs/semantic-passage-plan.md'));
 if(modes.some(m=>/Low|Json/.test(m)))files.push(path.join(project,'docs/semantic-low-plan.md'));
 if(modes.includes('JJson'))files.push(path.join(project,'docs/semantic-json-plan.md'));
 if(modes.some(m=>m.startsWith('act')))files.push(require.resolve('./semantic-act.cjs'),require.resolve('./semantic-passage.cjs'),path.join(project,'docs/semantic-act-plan.md'));
 if(modes.some(m=>m.startsWith('reference')))files.push(require.resolve('./semantic-reference.cjs'),require.resolve('./semantic-passage.cjs'),path.join(project,'docs/semantic-reference-plan.md'));
 files.push(...sourceFiles.map(f=>path.resolve(f)));const names=new Map();for(const f of files){assert(!names.has(path.basename(f))||names.get(path.basename(f))===f,'Archive basename collision');names.set(path.basename(f),f);}
 const hashes=Object.fromEntries(files.map(f=>[f,sha(f)]));fs.mkdirSync(path.join(root,'source-archive'));for(const f of files)fs.copyFileSync(f,path.join(root,'source-archive',path.basename(f)));
 for(const g of groups){save(g.name+'-evidence',g.snapshot);save(g.name+'-labels',g.labels);for(const suffix of ['evidence','labels']){const f=path.join(root,g.name+'-'+suffix+'.json');hashes[f]=sha(f);}}
 save('manifest',{created_at:new Date().toISOString(),modes,rounds,maxTokens,...(Object.keys(methodSpecs).length?{method_settings:Object.fromEntries(modes.map(m=>[m,{batchSize:methodSpecs[m]?.batchSize??batchSize(m),maxTokens:methodSpecs[m]?.maxTokens??maxTokens}]))}:{}),resume_from:resumeFrom||null,limits,concurrency:2,tpm:48000,hashes});
 const env={...process.env,...parseEnv(fs.readFileSync(path.join(project,'agent/.env'),'utf8'))},config={...configFromEnv('hcx',env),temperature:0,seed:42,maxTokens,maxCalls:limits.calls,timeoutMs:180000,minIntervalMs:0,tokensPerMinute:undefined,retryRateLimit:false,retryTransientTransport:false};
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('Experiment deadline')),limits.seconds*1000),reservations=[];let attempts=0,reserved=0,halt=null,gate=Promise.resolve();const results={},jobs=[];
 const accountFile=path.join(project,'.runtime/semantic-last-request.json');
 // Sequential experiment processes share the trailing quota window; this is not a multi-process lock.
 let lastDispatch=fs.existsSync(accountFile)?read(accountFile).at:Date.now();
 if(resumeFrom){const b=read(path.join(resumeFrom,'budget.json'));attempts=b.attempts;reserved=b.reserved;}
 for(let round=0;round<rounds;round++)for(const input of groups){const g=reordered(input,round);for(const mode of modes){const spec=methodSpecs[mode],key=g.name+'-'+mode+'-r'+round,contract=spec?.contract??method(mode),job={key,g,mode,round,contract,batchSize:spec?.batchSize??batchSize(mode),decisions:[],failed:null};
  job.config={...config,maxTokens:spec?.maxTokens??maxTokens,reasoningEffort:mode.includes('Low')?'low':'none'};
  job.session=createSession(job.config,{contract,signal:ctl.signal,log:e=>{if(e.event==='llm_request'){attempts++;const tokens=estimateRequestTokens(e.body);assert(attempts<=limits.calls&&reserved+tokens<=limits.tokens,'Shared experiment budget');reserved+=tokens;save('budget',{attempts,reserved});fs.writeFileSync(accountFile,JSON.stringify({at:Date.now(),root}));}fs.appendFileSync(path.join(root,key+'-trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n');}});jobs.push(job);}}
 if(resumeFrom)for(const job of jobs){const callsFile=path.join(resumeFrom,job.key+'-calls.json'),decisionFile=path.join(resumeFrom,job.key+'-decisions.json');
  if(!fs.existsSync(callsFile))continue;const records=read(callsFile);assert(records.every(c=>c.status==='ok'||c.http_status===429),'Unconfirmed or rejected model result cannot be resumed automatically');lastDispatch=Math.max(lastDispatch,...records.map(c=>c.finished_at_ms||c.sent_at_ms||0));
  const confirmed=records.filter(c=>c.status==='ok');if(!confirmed.length)continue;assert(fs.existsSync(decisionFile),'Confirmed response missing decisions');const ds=read(decisionFile),size=job.batchSize;
  assert(ds.length===Math.min(confirmed.length*size,job.g.snapshot.candidates.length),'Incomplete validated batch');
  const lines=fs.readFileSync(path.join(resumeFrom,job.key+'-trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse);const requests=lines.filter(e=>e.event==='llm_request'&&e.call_number<=confirmed.length);
  assert.equal(requests.length,confirmed.length);for(let n=0;n<confirmed.length;n++)assert.deepEqual((await estimate(job.g.snapshot.candidates.slice(n*size,(n+1)*size),job.config,job.contract)).body,requests[n].body,'Resume would change the actual request');
  job.decisions=ds;job.session.calls.push(...confirmed);fs.writeFileSync(path.join(root,job.key+'-trace.jsonl'),lines.filter(e=>e.call_number<=confirmed.length).map(e=>JSON.stringify({...e,reused_from:resumeFrom})).join('\n')+'\n');save(job.key+'-decisions',ds);save(job.key+'-calls',confirmed);
 }
 // Round-robin batches stop one variant monopolizing the shared provider budget.
 const tasks=[];for(let n=0;jobs.some(j=>n*j.batchSize<j.g.snapshot.candidates.length);n++)for(const job of jobs){const size=job.batchSize;if(n*size<job.decisions.length)continue;const batch=job.g.snapshot.candidates.slice(n*size,(n+1)*size);if(batch.length)tasks.push({job,batch});}
 async function acquire(tokens){const previous=gate;let release;gate=new Promise(r=>release=r);await previous;try{assert(tokens<=48000,'Oversized batch');while(true){ctl.signal.throwIfAborted();if(halt)throw halt;const now=Date.now();while(reservations.length&&reservations[0].at<=now-61000)reservations.shift();if(reservations.reduce((n,r)=>n+r.tokens,0)+tokens<=48000){const r={at:now,tokens};reservations.push(r);return r;}await delay(500,undefined,{signal:ctl.signal});}}finally{release();}}
 let index=0;async function worker(){while(index<tasks.length&&!halt){const {job,batch}=tasks[index++];if(job.failed)continue;
  // Calls of the same condition remain sequential, including when only that condition is left.
  const priorJob=job.pending||Promise.resolve();let done;job.pending=new Promise(r=>done=r);await priorJob;
  try{if(job.failed||halt)continue;for(const[f,h]of Object.entries(hashes))assert.equal(sha(f),h,'Frozen source changed');const request=await estimate(batch,job.config,job.contract);if(attempts>=limits.calls||reserved+request.tokens>limits.tokens)throw Error('Shared experiment budget');const before=performance.now(),r=await acquire(request.tokens);job.shared_wait=(job.shared_wait||0)+(performance.now()-before)/1000;
   const ds=await job.session.decide(batch),call=job.session.calls.at(-1);if(Number.isFinite(call.usage?.prompt_tokens))r.tokens=call.usage.prompt_tokens+job.config.maxTokens;
   job.decisions.push(...ds);save(job.key+'-decisions',job.decisions);save(job.key+'-calls',job.session.calls);console.log(JSON.stringify({root,key:job.key,processed:job.decisions.length,total:job.g.labels.length,attempts}));
  }catch(e){job.failed=e.message;save(job.key+'-failure',{error:e.message,completed:job.decisions.length});save(job.key+'-calls',job.session.calls);if(job.session.calls.at(-1)?.status!=='ok')halt=e;
  }finally{done();}}
 }
 try{await delay(Math.max(0,61000-(Date.now()-lastDispatch)),undefined,{signal:ctl.signal});const workers=await Promise.allSettled([worker(),worker()]);for(const w of workers)if(w.status==='rejected')halt ||=w.reason;for(const job of jobs){results[job.key]=job.failed||job.decisions.length!==job.g.labels.length?{failed:job.failed||'incomplete',processed:job.decisions.length}:{...measured(job.g,job.decisions,job.session.calls),shared_wait_sec:job.shared_wait};}save('results',results);save('completion',{status:halt?'partial':'completed',attempts,reserved,failed_conditions:Object.values(results).filter(r=>r.failed).length,error:halt?.message||null});console.log(JSON.stringify({root,summary:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,{tp:v.tp,fp:v.fp,fn:v.fn,f1:v.f1,tokens:v.tokens,calls:v.calls,failed:v.failed}]))}));return {root,results};}finally{clearTimeout(timer);}
}
async function main(){const arg=(k,d)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:d;
 if(!process.argv.includes('--live')){const c={node_id:'n',raw_text:'원문',normalized_text:'원문',frame_urls:[],signals:[]};const x=await estimate([c],{provider:'hcx',temperature:0,maxTokens:3072,reasoningEffort:'none'},prior('O'));assert(x.tokens>3072);assert.equal(x.body.messages[1].role,'user');console.log('PASS no-network request estimate');return;}
 const panel=arg('--panel','diagnostic'),data=path.resolve(arg('--data','.runtime/context-ownership-data-v2'));let groups=groupsFor(panel,data);
 const take=Number(arg('--take','0'));if(take)groups=groups.map(g=>{const candidates=g.snapshot.candidates.slice(0,take),ids=new Set(candidates.map(c=>c.node_id));return {...g,labels:g.labels.filter(l=>ids.has(l.node_id)),snapshot:{...g.snapshot,candidates,technique_observations:g.snapshot.technique_observations.filter(o=>ids.has(o.node_id))}};});
 await runComparison({root:path.resolve(arg('--out','.runtime/semantic-search-'+Date.now())),groups,modes:arg('--modes','O,S,scope,compact,contrast,S4').split(','),rounds:Number(arg('--rounds','1')),maxTokens:Number(arg('--max-tokens','3072')),resumeFrom:arg('--resume-from')?path.resolve(arg('--resume-from')):undefined,limits:{calls:Number(arg('--calls','40')),tokens:Number(arg('--tokens','650000')),seconds:3600}});
}
module.exports={method,batchSize,estimate,measured,groupsFor,reordered,runComparison};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
