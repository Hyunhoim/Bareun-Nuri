const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {run,materialize}=require('../src/core/bounded-scan.cjs');
const {fixture,options,evidence}=require('./collector-reuse.test.cjs');
const {createCollector}=require('../src/core/collect.cjs');
const {spawn}=require('node:child_process');
const root=path.resolve('.runtime/collector-five-adoption-'+Date.now());fs.mkdirSync(root,{recursive:true});
const entry='http://fixture.local/',urls=Array.from({length:13},(_,i)=>entry+'?page='+i);
const snapshots=Object.fromEntries(urls.map((url,i)=>[url,{pages:[{url,readiness:{settled:true},navigation:{links:i===0?urls.slice(1).map(url=>({url})):[]}}],collection_issues:[],technique_observations:[],candidates:Array.from({length:17},(_,j)=>({node_id:`p${i}n${j}`,url,selector:'#n'+j,location:'#n'+j,raw_text:'정상 안내 '+j,normalized_text:'정상 안내 '+j,signals:[],links:[],frame_urls:[],ancestors:[],own_style:{}}))}]));
function judge(){const calls=[];return {calls,decide:async batch=>{calls.push({number:calls.length+1});return batch.map(c=>({node_id:c.node_id,is_violation:false,needs_review:false,techniques:[],reason:'offline'}));}};}
const base={entry:urls[0],identity:{provider:'mock',code:'five-adoption'},limits:{pages:30,calls:1000,seconds:120,nodes:0},policy:'srpt',activeWindow:8,batchSize:12,collectionConcurrency:5,createJudge:judge};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function workerCheck(){
 const dir=path.join(root,'worker'),hook=path.join(root,'worker-hook.cjs'),source=path.join(root,'snapshots.json'),trace=path.join(root,'worker-collection.json');fs.writeFileSync(source,JSON.stringify(snapshots));
 fs.writeFileSync(hook,`const fs=require('node:fs'),snapshots=JSON.parse(fs.readFileSync(${JSON.stringify(source)}));let active=0,peak=0,launches=0;const starts=[];global.fetch=()=>{throw Error('Network forbidden');};require(${JSON.stringify(path.resolve('agent/src/core/collect.cjs'))}).createCollector=async()=>{launches++;await new Promise(r=>setTimeout(r,10));return{isConnected:()=>true,collect:async url=>{active++;peak=Math.max(peak,active);starts.push(url);await new Promise(r=>setTimeout(r,20));active--;return structuredClone(snapshots[url]);},close:async()=>fs.writeFileSync(${JSON.stringify(trace)},JSON.stringify({launches,peak,starts}))};};`);
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--require',hook,'agent/src/worker.cjs'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';const timeout=setTimeout(()=>{child.kill();reject(Error('Worker timeout'));},30000);child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>{clearTimeout(timeout);try{assert.equal(code,0,err+'\n'+out);resolve();}catch(e){reject(e);}});child.stdin.write(JSON.stringify({url:urls[0],provider:'mock',maxPages:30,maxNodes:0,maxCalls:100,timeoutSeconds:120,jobDir:dir,envFile:path.join(root,'unused.env')})+'\n');});
 const record=JSON.parse(fs.readFileSync(trace)),state=JSON.parse(fs.readFileSync(path.join(dir,'checkpoint.json'))).state;assert.equal(record.launches,1);assert.equal(record.peak,5);assert.deepEqual(record.starts,urls);assert.equal(state.collection_concurrency,5);assert.equal(state.status,'completed');
}
async function main(){
 let active=0,peak=0,maxWindow=0;const started=[];
 const readPage=async url=>{started.push(url);active++;peak=Math.max(peak,active);await delay(20-(urls.indexOf(url)%5)*3);active--;return structuredClone(snapshots[url]);};
 const fullDir=path.join(root,'full'),full=await run({...base,dir:fullDir,readPage,onProgress:s=>{maxWindow=Math.max(maxWindow,s.active.length);}});
 assert.equal(full.status,'completed',full.reason);assert.equal(peak,5);assert(maxWindow<=8);assert.deepEqual(started,urls);assert.deepEqual(full.pages.map(p=>p.url),urls);
 const data=materialize(fullDir,full);assert.deepEqual(data.candidates,Object.values(snapshots).flatMap(s=>s.candidates));assert.equal(new Set(data.decisions.map(d=>d.node_id)).size,221);
 const resumeDir=path.join(root,'resume'),first=await run({...base,dir:resumeDir,readPage,limits:{...base.limits,calls:2}});assert.equal(first.reason,'call_budget');
 const prior=materialize(resumeDir,first),before=started.length,resumed=await run({...base,dir:resumeDir,readPage});assert.equal(resumed.status,'completed');assert.deepEqual(resumed.batch_history,full.batch_history);assert(started.slice(before).every(url=>!first.pages.some(p=>p.url===url)));assert.deepEqual(materialize(resumeDir,resumed).decisions,data.decisions);assert(prior.decisions.length>0);
 const saved=fs.readFileSync(path.join(resumeDir,'checkpoint.json'));await assert.rejects(run({...base,collectionConcurrency:1,dir:resumeDir,readPage}),/Cannot resume/);assert.deepEqual(fs.readFileSync(path.join(resumeDir,'checkpoint.json')),saved);
 const cancel=new AbortController(),cancelDir=path.join(root,'cancel');let held=0;
 const cancelled=await run({...base,dir:cancelDir,signal:cancel.signal,readPage:async(url,signal)=>{
  if(url===urls[0]||url===urls[1])return structuredClone(snapshots[url]);
  held++;if(held===4)setTimeout(()=>cancel.abort(Error('Cancelled by user')),15);
  await new Promise((r,j)=>signal.addEventListener('abort',()=>j(signal.reason),{once:true}));
 }});
 assert.equal(cancelled.status,'partial');assert.deepEqual(cancelled.pages.map(p=>p.url),urls.slice(0,2));assert.deepEqual(cancelled.pending.map(p=>p.url),urls.slice(2));assert.equal(cancelled.inflight,null);
 const afterCancel=[];const recovered=await run({...base,dir:cancelDir,readPage:async url=>{afterCancel.push(url);return structuredClone(snapshots[url]);}});assert.equal(recovered.status,'completed');assert.deepEqual(afterCancel,urls.slice(2));assert.deepEqual(materialize(cancelDir,recovered).candidates,data.candidates);
 const limited=await run({...base,dir:path.join(root,'page-cap'),readPage,limits:{...base.limits,pages:3}});assert.equal(limited.reason,'page_budget');assert.equal(limited.attempts.length,3);assert.equal(limited.pending.length,10);
 const failure=await run({...base,dir:path.join(root,'failure'),readPage:async url=>{if(url===urls[2])throw Error('controlled failure');return structuredClone(snapshots[url]);}});assert.equal(failure.reason,'collection_gaps');assert.equal(failure.pages.length,12);assert.equal(failure.attempts.length,13);
 const candidateCap=await run({...base,dir:path.join(root,'candidate-cap'),readPage,limits:{...base.limits,nodes:40}});assert.equal(candidateCap.reason,'candidate_budget');assert.equal(candidateCap.pages.length,2);assert.deepEqual(candidateCap.pending.map(p=>p.url),urls.slice(2));
 const expired=await run({...base,dir:path.join(root,'deadline'),limits:{...base.limits,seconds:.12},readPage:async(url,signal)=>{if(url===urls[0])return structuredClone(snapshots[url]);await new Promise((r,j)=>signal.addEventListener('abort',()=>j(signal.reason),{once:true}));}});assert.equal(expired.reason,'time_budget');assert.equal(expired.pages.length,1);assert.deepEqual(expired.pending.map(p=>p.url),urls.slice(1));assert.equal(expired.inflight,null);
 await workerCheck();
 let browserChecked=false;
 if(process.argv.includes('--browser')){const site=await fixture(),collector=await createCollector({channel:'msedge'});try{
  let reference;for(const n of [1,5]){let now=0,maximum=0;const dir=path.join(root,'browser'+n),state=await run({...base,dir,entry:site.entry,collectionConcurrency:n,observeTechniques:true,readPage:async(url,signal)=>{now++;maximum=Math.max(maximum,now);try{const snapshot=await collector.collect(url,{...options,entryUrl:site.entry,observeTechniques:true,signal});if(url===site.entry)snapshot.pages[0].navigation.links=site.urls.slice(1).map(url=>({url}));return snapshot;}finally{now--;}}});assert.equal(state.pages.length,8);assert.equal(maximum,n);const actual=state.pages.map(p=>evidence(JSON.parse(fs.readFileSync(path.join(dir,p.evidence.file)))));if(reference)assert.deepEqual(actual,reference);else reference=actual;assert.equal(state.reason,'collection_gaps');}browserChecked=true;
 }finally{await collector.close();await site.close();}}
 const result={status:'passed',root,peak_concurrency:peak,max_active_pages:maxWindow,candidates:data.candidates.length,browser_checked:browserChecked,api_calls:0,checks:['FIFO evidence parity','five concurrent reads','active window eight','call-budget exact batch resume','no completed page recollection','changed concurrency refuses checkpoint without writes','mid-wave cancel preserves completed evidence and pending URLs','page and candidate budgets','time budget preserves pending URLs','single page failure retains other results','actual worker five concurrency and single shared browser',...(browserChecked?['real browser eight-page serial/five evidence equality']:[])]};fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}main().catch(e=>{console.error(e);process.exitCode=1;});
