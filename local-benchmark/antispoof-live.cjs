// Actual worker A/B with identical validated response handling and fixed discovery inventory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{setTimeout:delay}=require('node:timers/promises');
const root=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function main(){
 const live=process.argv.includes('--live');assert(live!==process.argv.includes('--smoke'),'Choose --live or --smoke');
 const verified=read(path.join(root,'.runtime/antispoof-typed-runtime-v1/verification.json'));assert(verified.parity&&verified.persist_resume&&verified.identity_refusal);
 const workerProof=path.join(root,'.runtime/antispoof-typed-runtime-v1/worker-verification.json');
 if(live){const proof=read(workerProof);assert.equal(proof.runner_sha256,sha(__filename));assert.equal(proof.completed,2);}
 const dir=path.join(root,'.runtime/antispoof-'+(live?'live':'smoke')+'-'+Date.now());fs.mkdirSync(dir);
 const profile=require('../agent/experiments/scale-profile.cjs').load('large'),dataset=path.join(root,'.runtime/replica-intent-data-v1');
 for(const [file,hash] of Object.entries(read(path.join(dataset,'manifest.json')).files))assert.equal(sha(path.join(dataset,file)),hash,'Dataset drift');
 const pins=read(path.join(root,'.runtime/antispoof-scope-v1/operating-before.json'));
 for(const [file,hash] of Object.entries(pins))assert.equal(sha(path.resolve(root,file)),hash,'Operating source changed');
 const responseFiles=['antispoof-response-audit.cjs','antispoof-response-regression.cjs'].map(f=>path.join(__dirname,f));
 const experimentFiles=[__filename,...responseFiles,path.join(__dirname,'antispoof-typed-bridge.cjs'),path.join(root,'.runtime/antispoof-typed-runtime-v1/infer.py'),path.join(root,'.runtime/antispoof-typed-runtime-v1/assets/manifest.json'),path.join(root,'docs/antispoof-live-plan.md')];
 const hashes={...pins,...Object.fromEntries(experimentFiles.map(f=>[f,sha(f)]))};
 const save=(name,x)=>fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(x,null,2));save('manifest',{live,dataset,profile,hashes,limits:{seconds:1500,calls:600,pages:200,nodes:0},order:['baseline','typed'],scope:'Previously observed closed workload; real API only if live=true'});
 let server;const completed=[];
 try{
  if(live)server=await require('../agent/experiments/replica-intent-site.cjs').startServer(dataset,{split:'dev',port:19160});
  for(const arm of ['baseline','typed']){
   if(live){console.log(JSON.stringify({arm,phase:'quota_washout',seconds:61}));await delay(61000);}
   for(const [file,hash] of Object.entries(hashes))assert.equal(sha(path.resolve(root,file)),hash);
   const armDir=path.join(dir,arm);fs.mkdirSync(armDir);const hook=path.join(armDir,'hook.cjs');
   const core=path.join(root,'agent/src/core'),anti=path.join(core,'antispoof.cjs');
   let code=`const fs=require('node:fs');const original=require(${JSON.stringify(anti)});const selected=${arm==='typed'?`require(${JSON.stringify(path.join(__dirname,'antispoof-typed-bridge.cjs'))})`:'original'};require.cache[require.resolve(${JSON.stringify(anti)})].exports={...selected,identity:()=>({...selected.identity(),experiment:${JSON.stringify({profile,bridgeHash:sha(path.join(__dirname,'antispoof-typed-bridge.cjs')),responseHashes:responseFiles.map(sha)})}})};`;
   code+=`const patched=require(${JSON.stringify(path.join(__dirname,'antispoof-response-regression.cjs'))}).load();require.cache[require.resolve(${JSON.stringify(path.join(core,'llm.cjs'))})].exports=patched;`;
   if(live){code+=`const mod=require(${JSON.stringify(path.join(core,'collect.cjs'))}),create=mod.createCollector,profile=${JSON.stringify(profile)};mod.createCollector=async options=>{const c=await create(options);return {...c,collect:async(...args)=>{const s=await c.collect(...args);return require(${JSON.stringify(path.join(root,'agent/experiments/scale-profile.cjs'))}).bound(s,profile);}};};`;}
   else{
    const cs=[{node_id:'positive',url:'https://example.test/',location:'#post',raw_text:'ㅎㅏㄱㄱㅛ c0ral',page_title:'이용 안내',context_evidence:{units:[],truncated:false}},{node_id:'negative',url:'https://example.test/',location:'#normal',raw_text:'일반 안내',page_title:'안내',context_evidence:{units:[]}}];
    code+=`global.fetch=async(url,options)=>{const cs=JSON.parse(JSON.parse(options.body).messages[1].content).candidates;return {ok:true,status:200,headers:new Map(),json:async()=>({status:{code:'20000'},result:{finishReason:'stop',message:{content:'\`\`\`json\\n'+JSON.stringify({decisions:Object.fromEntries(cs.map(c=>[c.node_id,{publication_act:c.node_id==='positive'?'이용권유':'일반정보'}]))})+'\\n\`\`\`\\n판정 설명'},usage:{promptTokens:100,completionTokens:20,totalTokens:120}}})};};const cs=${JSON.stringify(cs)};require(${JSON.stringify(path.join(core,'collect.cjs'))}).createCollector=async()=>({isConnected:()=>true,close:async()=>{},collect:async()=>({candidates:cs,pages:[{url:'https://example.test/',readiness:{settled:true},navigation:{links:[]}}],collection_issues:[],technique_observations:cs.map(c=>require(${JSON.stringify(path.join(core,'techniques.cjs'))}).observeTechniques(c))})});`;
   }
   fs.writeFileSync(hook,code);const envFile=live?path.join(root,'agent/.env'):path.join(armDir,'test.env');if(!live)fs.writeFileSync(envFile,'CLOVASTUDIO_API_KEY=TEST_ONLY\nCLOVASTUDIO_MODEL=HCX-007\n');
   const input={url:live?server.boardUrl:'https://example.test/',provider:'hcx',jobDir:path.join(armDir,'scan'),envFile,maxPages:live?200:1,maxNodes:0,maxCalls:live?600:1,timeoutSeconds:live?1500:360};
   const start=performance.now();let lastPrint=0;const events=[];
   await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--require',hook,path.join(root,'agent/src/worker.cjs')],{windowsHide:true,stdio:['pipe','pipe','pipe'],cwd:root});let tail='';const timer=setTimeout(()=>{child.kill();reject(Error('worker_hard_timeout_no_retry'));},live?1800000:180000);
    child.stdout.on('data',b=>{tail+=b;let n;while((n=tail.indexOf('\n'))>=0){const line=tail.slice(0,n);tail=tail.slice(n+1);fs.appendFileSync(path.join(armDir,'events.jsonl'),line+'\n');try{const e=JSON.parse(line);events.push(e);if(Date.now()-lastPrint>30000||e.type==='done'||e.type==='error'){console.log(JSON.stringify({arm,...e}));lastPrint=Date.now();}}catch{}}});
    child.stderr.on('data',()=>{});child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',exit=>{clearTimeout(timer);exit===0?resolve():reject(Error('worker_exit_'+exit));});child.stdin.write(JSON.stringify(input)+'\n');
   });
   const done=events.findLast(e=>e.type==='done');assert(done&&!events.some(e=>e.type==='error'),'Worker did not finish cleanly');
   const state=read(path.join(input.jobDir,'checkpoint.json')).state;assert(!state.inflight,'Unconfirmed request: do not retry');
   if(!live){assert.equal(done.processed,2);const batch=read(path.join(input.jobDir,state.pages[0].batches[0].file)).decisions;const anti=batch.find(d=>d.node_id==='positive').antispoof;assert.equal(anti.version,arm==='typed'?'typed-research-v1':'1.0');assert.equal(anti.predictions.length,2,'Model inference was not executed');assert(anti.predictions.every(p=>!p.protected));assert(!anti.unresolved.some(x=>x.technique===null));assert(!batch.find(d=>d.node_id==='negative').antispoof);}
   completed.push({arm,wall_sec:(performance.now()-start)/1000,...done});save('completion',{status:completed.length===2?'completed':'running',completed});
  }
 }catch(e){save('completion',{status:'failed',error:e.message,completed,no_automatic_retry:true});throw e;}
 finally{await server?.close();save('source-after',{verified:Object.entries(hashes).every(([f,h])=>sha(path.resolve(root,f))===h)});}
 if(!live)fs.writeFileSync(workerProof,JSON.stringify({runner_sha256:sha(__filename),dir,completed:completed.length},null,2));
 console.log(JSON.stringify({dir,completed:completed.length,live}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

