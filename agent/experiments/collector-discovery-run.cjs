// Isolated local benchmark: no HCX imports, no production changes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createCollector,canonical,inScope}=require('../src/core/collect.cjs');
const {site}=require('./scope-site.cjs');
const {fixture,evidence,checkFixture,options}=require('./collector-reuse.test.cjs');
const {startServer}=require('./replica-intent-site.cjs');
const ROOT=path.resolve(__dirname,'../..'),KATANA=path.join(ROOT,'.runtime/tools/katana-1.7.0/katana.exe');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const save=(f,x)=>fs.writeFileSync(f,JSON.stringify(x,null,2));
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const listen=s=>new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});
const close=s=>new Promise(resolve=>{s.closeAllConnections();s.close(resolve);});
const origin=s=>'http://127.0.0.1:'+s.address().port;

async function mixedFixtures(){
 const requests=[],servers=[],sites=[];let active='setup';
 const serve=routes=>http.createServer((req,res)=>{const url=new URL(req.url,'http://'+req.headers.host).href;
  requests.push({run:active,at:Date.now(),url,method:req.method,agent:req.headers['user-agent']||''});
  const body=routes.get(url);res.writeHead(req.method!=='GET'?405:body?200:404,{'Content-Type':'text/html; charset=utf-8'});res.end(body||'Not found');});
 const frames=new Map(),external=serve(frames);await listen(external);servers.push(external);
 for(let i=0;i<2;i++){const routes=new Map(),server=serve(routes);await listen(server);servers.push(server);
  const d=site(i,origin(server),origin(external));for(const [u,b]of d.routes)routes.set(u,b);for(const [u,b]of d.frames)frames.set(u,b);
  sites.push({...d,urls:[...d.routes.keys()].filter(u=>!new URL(u).pathname.startsWith('/widget/'))});}
 return {sites,requests,setRun:id=>{active=id;},close:async()=>{for(const s of servers)await close(s);}};
}

// Bounded FIFO waves: results and newly found links are committed in dispatch order.
async function walk({entry,urls,concurrency,seconds=600,maxPages=100,readPage,onResult=()=>{},start=performance.now(),discover=true,signal,retainSnapshots=true}){
 const pending=[],known=new Set(),attempts=[],rows=[],controller=new AbortController();let active=0,peakConcurrency=0;
 const onAbort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
 const add=url=>{if(!inScope(url,new URL(entry),'/'))return;const key=canonical(url);if(!known.has(key)){known.add(key);pending.push(url);}};
 for(const u of urls||[entry])add(u);
 const remaining=Math.max(0,seconds*1000-(performance.now()-start));
 const timer=setTimeout(()=>controller.abort(Error('time_budget')),remaining);let stop=null;
 try{while(pending.length&&attempts.length<maxPages&&!controller.signal.aborted){
  const batch=pending.splice(0,Math.min(concurrency,maxPages-attempts.length));
  const jobs=batch.map(url=>{const row={url,index:attempts.length,started_ms:performance.now()-start};attempts.push(row);
   return (async()=>{active++;peakConcurrency=Math.max(peakConcurrency,active);try{const snapshot=await readPage(url,controller.signal);return {row,snapshot};}catch(e){return{row,error:e.message};}finally{active--;row.finished_ms=performance.now()-start;}})();});
  for(const result of await Promise.all(jobs)){const {row,snapshot,error}=result;row.committed_ms=performance.now()-start;
   if(error){row.error=error;row.status=controller.signal.aborted?'cancelled':'failed';continue;}
   row.status=row.committed_ms<=seconds*1000?'completed':'late';row.candidates=snapshot.candidates.length;
   rows.push({row,...(retainSnapshots?{snapshot}:{})});await onResult(row,snapshot);row.committed_ms=performance.now()-start;row.status=row.committed_ms<=seconds*1000?'completed':'late';
   if(discover&&row.status==='completed')for(const link of snapshot.pages.flatMap(p=>p.navigation?.links||[]))add(link.url);
  }
 }stop=controller.signal.aborted?(controller.signal.reason?.message||'time_budget'):pending.length?'page_budget':'queue_exhausted';
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
 return {attempts,rows,pending,discovered:[...known],stop,peakConcurrency};
}

function katana(entry,folder){return new Promise((resolve,reject)=>{
 const escaped=new URL(entry).origin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const args=['-u',entry,'-cs','^'+escaped+'(?:/|$)','-s','breadth-first','-d','20','-ct','8s','-timeout','5','-retry','0','-c','2','-p','1','-rl','5','-mdp','80','-duf','-ndef','-duc','-j','-silent','-nc','-ob','-or'];
 const started=performance.now(),child=spawn(KATANA,args,{windowsHide:true,cwd:folder,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},10000);
 child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);
  fs.writeFileSync(path.join(folder,'katana.jsonl'),stdout);fs.writeFileSync(path.join(folder,'katana.stderr.txt'),stderr);
  try{const records=stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse),urls=[entry],seen=new Set([canonical(entry)]),excluded=[];
   for(const r of records){const u=r.request?.endpoint;if(!u)continue;if(!inScope(u,new URL(entry),'/')){excluded.push(u);continue;}if(!seen.has(canonical(u))){seen.add(canonical(u));urls.push(u);}}
   resolve({args,code,timedOut,elapsed_ms:performance.now()-started,records:records.length,urls,excluded,stderr});
  }catch(e){reject(e);}
 });
});}

function processMonitor(folder,{intervalMs=1500,onSample=()=>{}}={}){
 if(process.platform!=='win32')return{stop:async()=>({available:false})};
 const stopfile=path.join(folder,'monitor.stop'),script=path.join(folder,'monitor.ps1');
 const literal=x=>"'"+x.replaceAll("'","''")+"'";
 fs.writeFileSync(script,`$ErrorActionPreference='Stop'\nwhile(-not(Test-Path -LiteralPath ${literal(stopfile)})){\n try {\n $all=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate,Name)\n $byId=@{};foreach($p in $all){$byId[[int]$p.ProcessId]=$p}\n $ids=[System.Collections.Generic.HashSet[int]]::new();[void]$ids.Add(${process.pid})\n $rejected=[System.Collections.Generic.HashSet[int]]::new()\n do {$oldCount=$ids.Count;foreach($p in $all){if($ids.Contains([int]$p.ParentProcessId)){if($p.CreationDate -ge $byId[[int]$p.ParentProcessId].CreationDate){[void]$ids.Add([int]$p.ProcessId)}else{[void]$rejected.Add([int]$p.ProcessId)}}}}while($ids.Count -gt $oldCount)\n $identities=@(foreach($p in (Get-Process -Id @($ids) -ErrorAction SilentlyContinue)){try{$record=$byId[[int]$p.Id];if([Math]::Abs(($p.StartTime-$record.CreationDate).TotalMilliseconds) -lt 50){[pscustomobject]@{pid=$p.Id;parent_pid=[int]$record.ParentProcessId;name=$record.Name;created_ms=([DateTimeOffset]$p.StartTime).ToUnixTimeMilliseconds();working_set_bytes=$p.WorkingSet64;cpu_seconds=$p.CPU}}}catch{}})\n @{at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();root_pid=${process.pid};working_set_sum_bytes=($identities|Measure-Object working_set_bytes -Sum).Sum;cpu_seconds=($identities|Measure-Object cpu_seconds -Sum).Sum;processes=$identities.Count;identities=$identities;rejected_older_children=@($rejected)}|ConvertTo-Json -Depth 5 -Compress\n }catch{ @{error=$_.Exception.Message}|ConvertTo-Json -Compress }\n Start-Sleep -Milliseconds 1500\n}\n`);
 // Keep the generated monitor reusable; only the sampling interval changes by experiment.
 fs.writeFileSync(script,fs.readFileSync(script,'utf8').replace('Start-Sleep -Milliseconds 1500',`Start-Sleep -Milliseconds ${intervalMs}`).replace('$ids=[System.Collections.Generic.HashSet[int]]::new()',`if(-not $byId.ContainsKey(${process.pid})){break}\n $ids=[System.Collections.Generic.HashSet[int]]::new()`));
 const child=spawn('powershell.exe',['-NoProfile','-File',script],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='',buffer='';
 child.stdout.on('data',b=>{out+=b;buffer+=b;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let sample;try{sample=JSON.parse(line);}catch{continue;}fs.appendFileSync(path.join(folder,'resources-stream.jsonl'),JSON.stringify(sample)+'\n');onSample(sample);}});child.stderr.on('data',b=>err+=b);child.on('error',e=>{err+=e.message;onSample({error:e.message});});
 const exited=new Promise(resolve=>child.on('close',resolve));
 return{stop:async()=>{fs.writeFileSync(stopfile,'stop');await Promise.race([exited,new Promise(r=>setTimeout(r,4000))]);if(child.exitCode===null)child.kill();
  const samples=out.trim().split(/\r?\n/).filter(Boolean).flatMap(l=>{try{return[JSON.parse(l)];}catch{return[];}});save(path.join(folder,'resources.json'),{samples,stderr:err});
  return{available:samples.some(s=>s.working_set_sum_bytes),samples:samples.length,peak_working_set_sum_bytes:Math.max(0,...samples.map(s=>s.working_set_sum_bytes||0)),note:'Creation-time-checked live process subtree including monitor; summed working sets can double-count shared pages; exited parents may omit descendants.'};}};
}

function normalize(snapshot){const e=evidence(snapshot);for(const p of e.pages)p.issues?.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return e;}
async function measure(dataset,arm,round,section,out,mixed){
 const concurrency=arm==='katana1'?1:Number(/^fifo([1-9]|[1-3][0-9]|40)$/.exec(arm)?.[1]);
 assert(Number.isInteger(concurrency)&&concurrency>=1&&concurrency<=40,'Unsupported concurrency arm');
 const id=`${section}-${dataset.id}-${round}-${arm}`,folder=path.join(out,id);fs.mkdirSync(folder);
 mixed.setRun(id);const events=[],started_at_ms=Date.now(),start=performance.now(),memoryController=new AbortController();let memoryStop=null,collection_finished_at_ms;
 const monitor=processMonitor(folder,{intervalMs:dataset.monitorIntervalMs||1500,onSample:s=>{if(dataset.memoryStopBytes&&!memoryController.signal.aborted&&(s.error||s.working_set_sum_bytes>=dataset.memoryStopBytes)){memoryStop=s;memoryController.abort(Error(s.error?'resource_monitor_error':'memory_budget'));}}});let reader,discovery=null,result,wall_ms,resources;
 try{
  if(arm==='katana1'){discovery=await katana(dataset.entry,folder);save(path.join(folder,'discovery.json'),discovery);if(discovery.code!==0)throw Error('Katana exit '+discovery.code);}
  reader=await createCollector({channel:'msedge',onTiming:e=>events.push(e)});
  result=await walk({entry:dataset.entry,urls:section==='fixed'?dataset.urls:discovery?.urls,concurrency,
   seconds:section==='fixed'?600:20,maxPages:section==='fixed'?100:40,start,discover:section!=='fixed',signal:memoryController.signal,retainSnapshots:!dataset.diskEvidence,
   readPage:(url,signal)=>reader.collect(url,{...options,entryUrl:dataset.entry,observeTechniques:true,signal}),
   onResult:async(row,snapshot)=>{save(path.join(folder,`page-${row.index}.json`),snapshot);row.evidence_hash=sha(JSON.stringify(normalize(snapshot)));if(dataset.diskEvidence&&dataset.labels){const keys=new Set(snapshot.candidates.map(c=>c.url+'\n'+c.location+'\n'+c.raw_text));row.gold_hits=dataset.labels.filter(l=>keys.has(l.page+'\n'+l.location+'\n'+l.text)).map(l=>l.page+'\n'+l.location+'\n'+l.text);}}});
 }finally{try{if(reader)await reader.close();}finally{wall_ms=performance.now()-start;collection_finished_at_ms=Date.now();resources=await monitor.stop();}}
 const phases={};
 for(const e of events){if(e.kind==='page_collection')for(const[k,v]of Object.entries(e.phases_ms))phases[k]=(phases[k]||0)+v;else phases[e.kind]=(phases[e.kind]||0)+e.total_ms;}
 const completed=result.rows.filter(r=>r.row.status==='completed'),found=new Set(completed.flatMap(r=>dataset.diskEvidence?(r.row.gold_hits||[]):r.snapshot.candidates.map(c=>c.url+'\n'+c.location+'\n'+c.raw_text)));
 const gold=dataset.labels?.map(l=>({page:l.page,location:l.location,is_ad:l.is_ad,collected:found.has(l.page+'\n'+l.location+'\n'+l.text)}));
 const summary={id,section,dataset:dataset.id,arm,round,wall_ms,started_at_ms,collection_finished_at_ms,phases_sum_ms:phases,resources,peak_concurrency:result.peakConcurrency,memory_stop:memoryStop,
  pages:completed.length,candidates:completed.reduce((s,r)=>s+r.row.candidates,0),stop:result.stop,
  attempts:result.attempts,pending:result.pending,discovered:result.discovered,discovery,
  gold:gold?{ads:gold.filter(x=>x.is_ad).length,ads_collected:gold.filter(x=>x.is_ad&&x.collected).length,normal_collected:gold.filter(x=>!x.is_ad&&x.collected).length,rows:gold}:null,
  fixture:section==='fixed'&&dataset.id==='behavior'?checkFixture(completed.map(r=>r.snapshot||read(path.join(folder,`page-${r.row.index}.json`)))):undefined,
  requests:mixed.requests.filter(r=>r.run===id),evidence:completed.map(r=>({url:r.row.url,hash:r.row.evidence_hash})),api_calls:0};
 save(path.join(folder,'result.json'),summary);save(path.join(folder,'timings.json'),events);
 console.log(JSON.stringify({id,pages:summary.pages,candidates:summary.candidates,ads:summary.gold?.ads_collected,seconds:wall_ms/1000,stop:result.stop}));
 return summary;
}

function compare(rows,baselineArm='fifo1'){
 const groups=[];for(const section of ['fixed','explore'])for(const dataset of [...new Set(rows.filter(r=>r.section===section).map(r=>r.dataset))]){
  const rs=rows.filter(r=>r.section===section&&r.dataset===dataset),base=rs.filter(r=>r.arm===baselineArm);
  for(const arm of [...new Set(rs.map(r=>r.arm))]){const a=rs.filter(r=>r.arm===arm),checks=a.map(r=>{const b=base.find(x=>x.round===r.round),m=new Map(b.evidence.map(e=>[e.url,e.hash]));
    return{round:r.round,evidence_different:r.evidence.filter(e=>m.has(e.url)&&m.get(e.url)!==e.hash).map(e=>e.url),common:r.evidence.filter(e=>m.has(e.url)).length,
     missing:section==='fixed'?b.evidence.filter(e=>!r.evidence.some(x=>x.url===e.url)).map(e=>e.url):[],failures:r.attempts.filter(x=>x.status==='failed').length,
     ads_delta:r.gold?r.gold.ads_collected-b.gold.ads_collected:null,faster:r.wall_ms<b.wall_ms};});
   groups.push({section,dataset,arm,runs:a.length,median_wall_ms:median(a.map(r=>r.wall_ms)),median_pages:median(a.map(r=>r.pages)),mean_pages:a.reduce((s,r)=>s+r.pages,0)/a.length,
    median_candidates:median(a.map(r=>r.candidates)),median_ads:a[0].gold?median(a.map(r=>r.gold.ads_collected)):null,median_requests:median(a.map(r=>r.requests.length)),
    peak_working_set_sum_bytes:Math.max(...a.map(r=>r.resources.peak_working_set_sum_bytes||0)),checks});
  }
 }return{groups,api_calls:0,scope:'Historical synthetic fixtures and real DOM replay. Collection coverage, not semantic F1 or 25-minute end-to-end adoption.'};
}

async function selftest(){
 const calls=[],fake=async(url,signal)=>{calls.push(url);await new Promise((r,j)=>{const t=setTimeout(r,20);signal.addEventListener('abort',()=>{clearTimeout(t);j(signal.reason);},{once:true});});
  return{pages:[{navigation:{links:url.endsWith('/a')?[{url:'http://local.test/c?i=1'},{url:'http://local.test/c?i=2'},{url:'http://other.test/no'}]:[]}}],candidates:[]};};
 const r=await walk({entry:'http://local.test/a',urls:['http://local.test/a','http://local.test/b'],concurrency:2,readPage:fake,seconds:1});
 assert.deepEqual(calls,['http://local.test/a','http://local.test/b','http://local.test/c?i=1','http://local.test/c?i=2']);assert.equal(r.stop,'queue_exhausted');
 const cancelled=await walk({entry:'http://local.test/a',concurrency:2,readPage:fake,seconds:.005});assert.equal(cancelled.stop,'time_budget');assert.equal(cancelled.rows.length,0);
 for(const concurrency of [3,4,5,10,15,20,25,30,35,40]){
  let active=0,peak=0;const urls=Array.from({length:43},(_,i)=>'http://local.test/'+i);
  const r=await walk({entry:urls[0],urls,concurrency,seconds:2,discover:false,readPage:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return{pages:[],candidates:[]};}});
  assert.equal(peak,concurrency);assert.equal(r.peakConcurrency,concurrency);assert.deepEqual(r.attempts.map(a=>a.url),urls);assert.equal(active,0);assert(r.attempts.every(a=>a.finished_ms>=a.started_ms));
 }
 const memory=new AbortController();memory.abort(Error('memory_budget'));
 const stopped=await walk({entry:'http://local.test/a',concurrency:40,signal:memory.signal,readPage:()=>{throw Error('Must not read');}});assert.equal(stopped.stop,'memory_budget');assert.equal(stopped.attempts.length,0);
 const disk=await walk({entry:'http://local.test/a',concurrency:2,readPage:fake,retainSnapshots:false});assert.equal(disk.rows.length,3);assert(disk.rows.every(r=>!('snapshot'in r)));assert.equal(disk.discovered.length,3);
 console.log('PASS FIFO dispatch/commit, origin boundary, query values, budget cancellation');
}
async function main(){
 const out=path.resolve(process.argv[3]||'.runtime/collector-discovery-v1');assert(!fs.existsSync(out),'Use a fresh output directory');fs.mkdirSync(out,{recursive:true});
 const sources=['agent/src/core/collect.cjs','agent/src/core/frontier.cjs','agent/src/core/frame-access.cjs','agent/src/core/techniques.cjs','agent/src/core/judgment.cjs','agent/src/core/llm.cjs','agent/src/core/bounded-scan.cjs','agent/src/worker.cjs','agent/experiments/collector-discovery-run.cjs','docs/collector-discovery-plan.md'];
 const hashes=()=>Object.fromEntries(sources.map(f=>[f,sha(fs.readFileSync(path.join(ROOT,f)))]));
 const initial=hashes();save(path.join(out,'manifest.json'),{at:new Date().toISOString(),sources:initial,node:process.version,playwright:require('playwright/package.json').version,katana_sha256:sha(fs.readFileSync(KATANA)),api_calls:0});
 const mixed=await mixedFixtures(),behavior=await fixture();let replica;const rows=[];
 try{
  replica=await startServer(undefined,{split:'dev',port:0});
  const captured=read(path.join(ROOT,'.runtime/real-replica-v1/live-runs/busan-board-fifo.json'));
  const originalUrls=(captured.attempts||captured.visited).map(x=>typeof x==='string'?x:x.url).slice(0,20);
  assert.equal(originalUrls.length,20);const urls=originalUrls.map(u=>{const x=new URL(u);return replica.origin+x.pathname+x.search;});
  const fixed=[mixed.sites[0],{...behavior,id:'behavior'},{id:'real-dom20',entry:replica.entryUrl,urls}];
  save(path.join(out,'datasets.json'),{fixed:fixed.map(d=>({id:d.id,entry:d.entry,urls:d.urls})),explore:mixed.sites.map(d=>({id:d.id,entry:d.entry,labels:d.labels}))});
  for(let round=0;round<3;round++)for(const d of fixed)for(const arm of round%2?['fifo2','fifo1']:['fifo1','fifo2']){
   rows.push(await measure(d,arm,round,'fixed',out,mixed));save(path.join(out,'progress.json'),rows.map(({requests,discovery,...r})=>r));
  }
  for(let round=0;round<3;round++)for(const d of mixed.sites)for(const arm of [['fifo1','fifo2','katana1'],['katana1','fifo1','fifo2'],['fifo2','katana1','fifo1']][round]){
   rows.push(await measure(d,arm,round,'explore',out,mixed));save(path.join(out,'progress.json'),rows.map(({requests,discovery,...r})=>r));
  }
  save(path.join(out,'summary.json'),compare(rows));
 }finally{await mixed.close();await behavior.close();if(replica)await replica.close();const final=hashes();save(path.join(out,'source-after.json'),{sources:final,unchanged:JSON.stringify(initial)===JSON.stringify(final)});}
 console.log(JSON.stringify({completed:true,out}));
}
module.exports={walk,compare,katana,mixedFixtures,measure,normalize,processMonitor};
if(require.main===module)(process.argv[2]==='selftest'?selftest():main()).catch(e=>{console.error(e);process.exitCode=1;});
