// Adoption plumbing checks only; fetch is disabled and no browser is launched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'../..');
let networkCalls=0;global.fetch=async()=>{networkCalls++;throw Error('Network disabled in staging check');};
const core=path.join(project,'agent/src/core'),{combine,digest}=require(path.join(core,'scan.cjs'));
const {run,materialize}=require(path.join(core,'bounded-scan.cjs'));
const {contract,MAX_BATCH}=require(path.join(core,'judgment.cjs')),{fitBatch,estimateBatch}=require(path.join(core,'request-budget.cjs'));
const {createSession,estimateRequestTokens}=require(path.join(core,'llm.cjs')),{observeTechniques}=require(path.join(core,'techniques.cjs'));
const root=path.join(project,'.runtime','semantic-adoption-check-'+Date.now());fs.mkdirSync(root,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(p)),entry='http://fixture.local/';
const nodes=Array.from({length:18},(_,i)=>({node_id:'n'+i,url:entry,selector:'p#n'+i,location:'p#n'+i,raw_text:i===0?'긴 본문 광고 문맥 '.repeat(1300):i===14?'m0del2026x 표현':'원문 '+i,normalized_text:'문맥',signals:[],links:[],frame_urls:[],ancestors:[],page_title:'관찰 검사',own_style:{tag:'p'}}));
function observation(c){
 if(['n14','n17'].includes(c.node_id))return observeTechniques(c,null);
 const partial=c.node_id==='n16',end=partial?2:c.raw_text.length;
 return {node_id:c.node_id,url:c.url,location:c.location,raw_text:c.raw_text,version:1,unresolved:[],observations:[{technique:'TRANSPARENT',coverage:partial?'partial-text':'all-text',evidence:[{technique:'TRANSPARENT',reason:'test-style-evidence',start:0,end,text:c.raw_text.slice(0,end)}]}]};
}
const snapshot={pages:[{url:entry,readiness:{settled:true},navigation:{links:[]}}],candidates:nodes,collection_issues:[],technique_observations:nodes.map(observation)};
const identity={provider:'hcx',code:'staged-check-v1'},base={entry,scope:'/',mode:'fifo',identity,batchSize:MAX_BATCH,observeTechniques:true,limits:{pages:10,nodes:0,calls:30,seconds:30},readPage:async()=>structuredClone(snapshot)};
let judgments=0;
function judge({onRequestState}){
 const calls=[];return {calls,tracksRequests:true,fitBatch:async items=>items.slice(0,MAX_BATCH),decide:async items=>{
  judgments++;onRequestState?.({phase:'sent'});calls.push({status:'ok',usage:{total_tokens:1}});onRequestState?.({phase:'responded'});
  return contract().validateModelDecisions(items.map(c=>({node_id:c.node_id,publication_act:Number((c.source_node_id||c.node_id).slice(1))%2===0?'이용권유':'일반정보'})),items);
 }};
}
function resultParts(dir){const r=read(path.join(dir,'result.json'));return r.findings;}
async function main(){
 const {executionSignature,selectPage}=require(path.join(core,'bounded-scan.cjs'));
 assert.notEqual(executionSignature({...base,batchSize:4}),executionSignature({...base,batchSize:12}));
 const scheduling={turn:0,active:['a','b'],pages:[{id:'a',work:9,offset:0,last_turn:0},{id:'b',work:5,offset:0,last_turn:0}]};
 assert.equal(selectPage(scheduling,'srpt',8,4).id,'b');
 assert.equal(selectPage(scheduling,'srpt',8,12).id,'a');
 const config={provider:'hcx',reasoningEffort:'none',temperature:0,seed:42,maxTokens:512,tokensPerMinute:1000000};
 const simple=nodes.slice(1),selected=await fitBatch(simple,config,contract(),MAX_BATCH);assert.equal(selected.length,MAX_BATCH);assert(selected.every((c,i)=>c===simple[i]));
 const cap=await estimateBatch(simple.slice(0,2),config,contract()),smaller=await fitBatch(simple,{...config,tokensPerMinute:cap},contract(),MAX_BATCH);assert.equal(smaller.length,2);assert(smaller.every((c,i)=>c===simple[i]));
 await assert.rejects(()=>fitBatch(simple,{...config,tokensPerMinute:1},contract(),MAX_BATCH),/Single candidate/);
 await assert.rejects(()=>fitBatch(simple,config,contract(),0),/maximum batch/);
 let body;const stop=Error('capture only'),session=createSession({...config,maxCalls:1,tokensPerMinute:undefined,minIntervalMs:0},{contract:contract(),log:e=>{if(e.event==='llm_request'){body=e.body;throw stop;}}});
 await assert.rejects(()=>session.decide(simple.slice(0,2)),e=>e===stop);assert.equal(body.maxCompletionTokens,512);assert.equal(estimateRequestTokens(body),cap);assert(!body.responseFormat);assert(body.messages[0].content.includes('publication_act'));

 const dir=path.join(root,'resume'),first=await run({...base,dir,limits:{...base.limits,calls:1},createJudge:judge});
 const firstStored=materialize(dir,first);
 assert.equal(first.status,'partial');assert.equal(first.reason,'call_budget');assert.equal(firstStored.decisions.length,MAX_BATCH);assert.equal(firstStored.technique_observations.length,nodes.length);
 const checkpoint=read(path.join(dir,'checkpoint.json'));assert.equal(digest(checkpoint.state),checkpoint.sha256);const saved=structuredClone(firstStored.decisions),started=first.started_at;
 const resumed=await run({...base,dir,createJudge:judge}),resumedStored=materialize(dir,resumed);assert.equal(resumed.status,'completed');assert.deepEqual(resumedStored.decisions.slice(0,MAX_BATCH),saved);assert.equal(resumed.started_at,started);
 assert(resumedStored.work.some(c=>c.source_node_id==='n0'));assert(resumedStored.decisions.every(d=>d.techniques.length===0&&d.observed_techniques.length===0),'Stored semantic decisions must remain untouched');
 const findings=resultParts(dir);assert(findings.some(f=>f.location==='p#n0'&&f.evidence_text===nodes[0].raw_text&&f.technique==='TRANSPARENT'));
 assert(!findings.some(f=>['p#n14','p#n16','p#n17'].includes(f.location)),'Uncertain digit/partial style/legacy proof must not become findings');
 const td=read(path.join(dir,'technique-diagnostics.json')),di=read(path.join(dir,'diagnostics.json'));assert(td.some(d=>d.node_id==='n14'));assert(td.some(d=>d.node_id==='n16'));assert(td.some(d=>d.node_id==='n17'));
 assert.equal(new Set(di.map(d=>d.node_id)).size,di.length);assert(td.every(d=>d.technique_needs_review===true&&d.intent_needs_review===false));
 const uninterrupted=path.join(root,'uninterrupted'),all=await run({...base,dir:uninterrupted,createJudge:judge});assert.deepEqual(combine(resumedStored),combine(materialize(uninterrupted,all)));assert.deepEqual(findings,resultParts(uninterrupted));

 const before=fs.readFileSync(path.join(dir,'checkpoint.json'),'utf8');await assert.rejects(()=>run({...base,dir,identity:{...identity,code:'changed'},createJudge:judge}),/Cannot resume changed/);assert.equal(fs.readFileSync(path.join(dir,'checkpoint.json'),'utf8'),before);
 const invalid=structuredClone(snapshot);invalid.technique_observations[0].observations[0].evidence[0].text='잘못된 원문';const beforeInvalid=judgments;
 const badDir=path.join(root,'malformed'),bad=await run({...base,dir:badDir,readPage:async()=>invalid,createJudge:judge});assert.equal(bad.status,'failed');assert.match(bad.reason,/observation span/i);assert.equal(judgments,beforeInvalid);assert.equal(materialize(badDir,bad).candidates.length,0);

 const uncertainDir=path.join(root,'uncertain');let dispatch=0,factories=0;
 const failingJudge=({onRequestState})=>{factories++;const calls=[];return {calls,tracksRequests:true,fitBatch:async items=>items.slice(0,4),decide:async()=>{dispatch++;onRequestState({phase:'sent'});calls.push({status:'failed'});throw Error('Unknown transmission outcome');}};};
 const interrupted=await run({...base,dir:uncertainDir,createJudge:failingJudge});assert.equal(interrupted.inflight.phase,'sent');
 const blocked=await run({...base,dir:uncertainDir,createJudge:failingJudge});assert.match(blocked.reason,/automatic retry refused/);assert.equal(dispatch,1);assert.equal(factories,1);

 const mockCandidates=nodes.slice(1,3),mockConfig={provider:'mock',maxCalls:3,maxTokens:3072,temperature:0,reasoningEffort:'none'};
 const {baselineContract}=require(path.join(core,'llm.cjs')),bodies=[];
 const mockReply=await createSession(mockConfig,{log:e=>{if(e.event==='llm_request')bodies.push(e.body);}}).decide(mockCandidates);
 assert.deepEqual(mockReply.map(d=>({node_id:d.node_id,is_violation:d.is_violation,needs_review:d.needs_review,techniques:d.techniques})),mockCandidates.map(c=>({node_id:c.node_id,is_violation:false,needs_review:false,techniques:[]})));
 assert.equal(bodies.length,1);assert(bodies[0].messages[0].content.startsWith(baselineContract.SYSTEM+'\n현재 역할: '+baselineContract.JUDGE));
 assert.deepEqual(JSON.parse(bodies[0].messages[1].content),JSON.parse(JSON.stringify({role:'judge',phase:'initial',candidates:mockCandidates.map(baselineContract.initialEvidence)})));
 assert(!bodies[0].messages[0].content.includes('publication_act'));
 const mockSnap={pages:snapshot.pages,candidates:mockCandidates,collection_issues:[]},mockBase={...base,identity:{provider:'mock'},observeTechniques:false,readPage:async()=>structuredClone(mockSnap),createJudge:()=>createSession(mockConfig)};
 const mockDir=path.join(root,'mock'),mockState=await run({...mockBase,dir:mockDir}),mockStored=materialize(mockDir,mockState);assert.deepEqual(combine(mockStored).decisions,mockReply);assert.deepEqual(mockStored.technique_observations,[]);assert.equal(mockState.observe_techniques,false);assert.deepEqual(read(path.join(mockDir,'technique-diagnostics.json')),[]);

 const frozen=path.join(project,'.runtime/jamo-context-live-c-v1/source-archive'),crypto=require('node:crypto');
 const archivedReading=fs.readFileSync(path.join(frozen,'agent/experiments/jamo-context-normalize.cjs'),'utf8');
 const operationalReading=fs.readFileSync(path.join(core,'jamo-reading.cjs'),'utf8');
 assert.equal(operationalReading,archivedReading.replace("require('../src/core/jamo.cjs')","require('./jamo.cjs')"),'Promoted reading implementation must match frozen C');
 const readingHash=crypto.createHash('sha256').update(archivedReading).digest('hex');
 const frozenManifest=read(path.join(project,'.runtime/jamo-context-live-c-v1/manifest.json'));
 assert.equal(readingHash,frozenManifest.hashes['agent\\experiments\\jamo-context-normalize.cjs']);
 assert(fs.readFileSync(path.join(project,'agent/src/worker.cjs'),'utf8').includes("'jamo-reading.cjs'"),'Reading helper must affect resume identity');
 const experiment=require(path.join(frozen,'agent/experiments/jamo-context-auto.cjs')).contract(),live=contract(),parityNodes=[{...nodes[1],raw_text:'ㅎ ㅏ ㄱ ㄱ ㅛ  ㅇ ㅏ ㄴ ㄴ ㅐ'},{...nodes[2],raw_text:'ㅎ\u200bㅏ\u200bㄴ\u200bㄱ\u200bㅡ\u200bㄹ',context_evidence:{scope:{tag:'article'},target_quoted:true,truncated:false,units:[{relation:'before',text:'설명 문장'},{relation:'target'},{relation:'after',text:'후속 문장'}]}}];
 // K prompt was adopted separately; retain the frozen C input/output checks.
 assert.equal(require('node:crypto').createHash('sha256').update(live.SYSTEM).digest('hex'),require('node:crypto').createHash('sha256').update(read(path.join(project,'.runtime/phase2-improvement-adoption/expected-system.json'))).digest('hex'));
 experiment.SYSTEM=live.SYSTEM;
 for(const key of ['SYSTEM','JUDGE','formatRepair','promptJson'])assert.deepEqual(live[key],experiment[key]);assert.deepEqual(live.modelItemSchema(),experiment.modelItemSchema());
 for(const c of parityNodes){const before=structuredClone(c),observed=observeTechniques(c,null);assert.deepEqual(live.initialEvidence(c),experiment.initialEvidence(c));assert.deepEqual(c,before);assert.deepEqual(observeTechniques(c,null),observed);}
 for(const publication_act of experiment.modelItemSchema().properties.publication_act.enum){const values=parityNodes.map(c=>({node_id:c.node_id,publication_act}));assert.deepEqual(live.validateModelDecisions(values,parityNodes),experiment.validateModelDecisions(values,parityNodes));}
 assert.equal(await estimateBatch(parityNodes,config,live),await estimateBatch(parityNodes,config,experiment));
 const capture=async selectedContract=>{let captured;const stop=Error('offline request parity');const session=createSession({...config,maxCalls:1,minIntervalMs:0,tokensPerMinute:undefined},{contract:selectedContract,log:e=>{if(e.event==='llm_request'){captured=e.body;throw stop;}}});await assert.rejects(()=>session.decide(parityNodes),e=>e===stop);return captured;};
 assert.deepEqual(await capture(live),await capture(experiment));
 const sourceWork=new Map();const {splitCandidate}=require(path.join(core,'scan.cjs'));const pages=path.join(project,'.runtime/jamo-context-live-c-v1/scan/pages');
 for(const name of fs.readdirSync(pages)){const evidence=path.join(pages,name,'evidence.json');if(fs.existsSync(evidence))for(const c of read(evidence).candidates)for(const part of splitCandidate(c))sourceWork.set(part.node_id,part);}
 let actualRequestTargets=0;const savedTrace=fs.readFileSync(path.join(project,'.runtime/jamo-context-live-c-v1/scan/trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 for(const event of savedTrace.filter(e=>e.event==='llm_request'))for(const input of JSON.parse(event.body.messages.find(m=>m.role==='user').content).candidates){assert.deepEqual(JSON.parse(JSON.stringify(live.initialEvidence(sourceWork.get(input.node_id)))),input);actualRequestTargets++;}
 assert.equal(actualRequestTargets,1845);
 assert.equal(networkCalls,0);const result={status:'passed',root,network_calls:networkCalls,tests:['batch12-prefix','batch-signature-and-srpt-sizing','budget-shrink-prefix','request-estimate-parity','original-observation-checkpoint','long-chunk-original-integration','semantic-decision-preservation','technique-uncertainty-diagnostics','resume-equals-uninterrupted','changed-identity-refused','invalid-observation-before-judgment','unknown-transmission-no-retry','mock-baseline-request-and-scan','frozen-experiment-contract-parity']};
 Object.assign(result,{reading_source_sha256:readingHash,actual_request_targets:actualRequestTargets,frozen_C_parity_except_adopted_R_system:true,raw_and_observations_unchanged:true});
 fs.writeFileSync(path.join(root,'check-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
