// Real packaged CPU inference; stored development predictions only, no HCX/network/final-set calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {identity,queries,createAntiSpoof}=require('./src/core/antispoof.cjs');
const {observeTechniques,integrateObservations}=require('./src/core/techniques.cjs');
const {run}=require('./src/core/bounded-scan.cjs');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
async function main(){
 const id=identity(),service=createAntiSpoof();
 try{
  const audit=read('.runtime/dual-technique-v1/input-audit/full.json');
  const actual=await service.request(audit.inputs);
  assert.deepEqual(actual.map(r=>r.labels),audit.predictions,'Packaged CPU decisions must match frozen calibrated development predictions');
  const base={node_id:'positive',url:'https://example.test/',location:'#post',raw_text:'ㅎㅏㄱㄱㅛ c0ral',page_title:'이용 안내',context_evidence:{units:[],truncated:false}};
  const negative={...base,node_id:'negative'};
  const ds=[base,negative].map((c,i)=>({node_id:c.node_id,is_violation:i===0,needs_review:false,techniques:[],reason:'fixed intent'}));
  const annotated=await service.annotate([base,negative],ds);
  assert(annotated[0].antispoof);assert(!annotated[1].antispoof);assert.equal(annotated[1].is_violation,false);
  const long={...base,node_id:'long',raw_text:'학교 '.repeat(1000)+'c0ral'};
  const longResult=await service.annotate([long],[{...ds[0],node_id:'long'}]);
  assert(longResult[0].antispoof.unresolved.some(x=>x.reason==='token_limit'));
  assert.equal(longResult[0].is_violation,true);
  const emoji={...base,raw_text:'😀 c0ral ㅎㅏㄱㄱㅛ'};
  for(const q of queries(emoji))assert.equal(emoji.raw_text.slice(q.start,q.end),q.token);
  const snapshot={candidates:[base,negative],pages:[{url:base.url,readiness:{settled:true},navigation:{links:[]}}],collection_issues:[]};
  snapshot.technique_observations=snapshot.candidates.map(c=>observeTechniques(c));
  const combined=integrateObservations(snapshot,annotated,snapshot.technique_observations);
  assert(combined.decisions[0].techniques.includes('JAMO'));assert.deepEqual(combined.decisions[1].techniques,[]);
  // Code proof survives even if the model reports no positive observation.
  const noModel=integrateObservations({candidates:[base]},[{...ds[0],antispoof:{observations:[],unresolved:[]}}],[snapshot.technique_observations[0]]);
  assert(noModel.decisions[0].techniques.includes('JAMO'));
  const dir=path.join(root,'.runtime/antispoof-adoption-'+Date.now());let calls=0;
  const options={dir,entry:base.url,scope:'/',mode:'fifo',observeTechniques:true,identity:{provider:'test',antispoof:id},limits:{pages:1,calls:1,seconds:120},readPage:async()=>structuredClone(snapshot),
   createJudge:()=>({calls:[],decide:async()=>{calls++;return structuredClone(annotated);}})};
  const first=await run(options);assert.equal(first.status,'completed');assert.equal(calls,1);
  const before=fs.readFileSync(path.join(dir,first.pages[0].batches[0].file),'utf8');
  await run(options);assert.equal(calls,1);assert.equal(fs.readFileSync(path.join(dir,first.pages[0].batches[0].file),'utf8'),before);
  await assert.rejects(()=>run({...options,identity:{provider:'test',antispoof:{...id,version:'changed'}}}),/Cannot resume changed/);
  const missing=createAntiSpoof({python:path.join(root,'missing-python')});
  try{const failed=await missing.annotate([base],[{...ds[0]}]);assert(failed[0].antispoof.unresolved.length);assert.equal(failed[0].is_violation,true);}finally{missing.close();}
  const summary={model:id.name,version:id.version,development_parity:actual.length,positive_only:true,length_protection:true,raw_offsets:true,code_preserved:true,resume_no_inference:true,changed_identity_rejected:true,missing_runtime_diagnostic:true,api_calls:0,final_evaluation:false};
  // Actual worker entry point + real CPU model; only browser and HCX network are stubbed.
  const hook=path.join(dir,'worker-hook.cjs'),core=path.join(__dirname,'src/core');
  fs.writeFileSync(hook,`global.fetch=async(url,options)=>{const cs=JSON.parse(JSON.parse(options.body).messages[1].content).candidates;return {ok:true,status:200,headers:new Map(),json:async()=>({status:{code:'20000'},result:{finishReason:'stop',message:{content:JSON.stringify({decisions:Object.fromEntries(cs.map(c=>[c.node_id,{publication_act:c.node_id==='positive'?'이용권유':'일반정보'}]))})},usage:{promptTokens:100,completionTokens:20,totalTokens:120}}})};};require(${JSON.stringify(path.join(core,'collect.cjs'))}).createCollector=async()=>({isConnected:()=>true,close:async()=>{},collect:async()=>(${JSON.stringify(snapshot)})});`);
  const envFile=path.join(dir,'test.env');fs.writeFileSync(envFile,'CLOVASTUDIO_API_KEY=TEST_ONLY\nCLOVASTUDIO_MODEL=HCX-007\n');
  const jobDir=path.join(dir,'worker');
  const events=await new Promise((resolve,reject)=>{
   const child=require('node:child_process').spawn(process.execPath,['--require',hook,path.join(__dirname,'src/worker.cjs')],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
   const timer=setTimeout(()=>{child.kill();reject(Error('Worker integration timed out'));},120000);
   child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',e=>{clearTimeout(timer);reject(e);});
   child.on('exit',code=>{clearTimeout(timer);try{assert.equal(code,0,stdout+stderr);resolve(stdout.trim().split('\n').map(JSON.parse));}catch(e){reject(e);}});
   child.stdin.write(JSON.stringify({url:base.url,provider:'hcx',jobDir,envFile,maxPages:1,maxNodes:0,maxCalls:1,timeoutSeconds:120})+'\n');
  });
  assert(events.some(e=>e.type==='done'&&e.processed===2));
  const checkpoint=JSON.parse(fs.readFileSync(path.join(jobDir,'checkpoint.json'))).state;
  const saved=JSON.parse(fs.readFileSync(path.join(jobDir,checkpoint.pages[0].batches[0].file))).decisions;
  assert(saved.find(d=>d.node_id==='positive').antispoof.predictions.length>0);
  assert(!saved.find(d=>d.node_id==='negative').antispoof);
  assert(saved.find(d=>d.node_id==='positive').antispoof.predictions.every(p=>!p.protected));
  const findings=JSON.parse(fs.readFileSync(path.join(jobDir,'result.json'))).findings;assert(findings.length>0);
  for(const o of saved.find(d=>d.node_id==='positive').antispoof.observations)assert(findings.some(f=>f.technique===o.technique),'Model observation missing from final output');
  summary.actual_worker_real_cpu=true;
  fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({dir,...summary}));
 }finally{service.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
