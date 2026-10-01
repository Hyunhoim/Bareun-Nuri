// Saved real responses only: continuous versus 300-call stop/resume; no API/browser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const bounded=require('../src/core/bounded-scan.cjs'),core=require('../src/core/scan.cjs');
const {fitBatch}=require('../src/core/request-budget.cjs'),judgment=require('../src/core/judgment.cjs').contract();
const read=p=>JSON.parse(fs.readFileSync(p));
global.fetch=()=>{throw Error('Offline replay: network forbidden');};
async function run(source,out){
 assert(!fs.existsSync(out));assert(fs.existsSync(path.join(source,'completion.json')));fs.mkdirSync(out,{recursive:true});
 const manifest=read(path.join(source,'manifest.json')),actual=read(path.join(source,'scan/checkpoint.json')).state;
 const trace=fs.readFileSync(path.join(source,'scan/trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse),requests=trace.filter(e=>e.event==='llm_request'),responses=trace.filter(e=>e.event==='llm_response');assert.equal(requests.length,responses.length);
 const snapshots=fs.readdirSync(path.join(source,'snapshots')).filter(n=>n.endsWith('.json')).map(n=>read(path.join(source,'snapshots',n))),pages=new Map(snapshots.map(s=>[s.pages[0].url,s]));
 const config=manifest.settings,seen=[];let index=0;
 const options={entry:actual.entry,scope:'/',mode:'fifo',policy:'srpt',activeWindow:8,aging:8,observeTechniques:true,identity:{provider:'replay',code:'recorded-input-output-parity'},
 limits:{pages:200,calls:requests.length,seconds:600,nodes:0},readPage:async url=>{assert(pages.has(url),'Unrecorded URL');return structuredClone(pages.get(url));},
 createJudge:({onRequestState})=>{const calls=[];return{calls,tracksRequests:true,fitBatch:cs=>fitBatch(cs,config,judgment,4),decide:async cs=>{
  const q=requests[index],r=responses.find(e=>e.call_number===q.call_number);assert(q&&r);assert.deepEqual(JSON.parse(JSON.stringify(cs.map(c=>judgment.initialEvidence(c)))),JSON.parse(q.body.messages[1].content).candidates,'Changed batch or input');
  const value=JSON.parse(r.data.choices[0].message.content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/,'$1'));calls.push({number:calls.length+1,status:'ok',usage:r.data.usage});onRequestState({phase:'sent'});onRequestState({phase:'responded'});seen.push(cs.map(c=>c.node_id));index++;
  return judgment.validateModelDecisions(Object.entries(value.decisions).map(([node_id,d])=>({node_id,...d})),cs);
 }}}};
 const continuousDir=path.join(out,'continuous'),a=await bounded.run({...options,dir:continuousDir});assert.notEqual(a.status,'failed',a.reason);assert.equal(index,requests.length);const batchOrder=structuredClone(seen);
 index=0;seen.length=0;const resumeDir=path.join(out,'resumed'),cut=await bounded.run({...options,dir:resumeDir,limits:{...options.limits,calls:300}});assert.equal(cut.reason,'call_budget');const previous=structuredClone(cut.batch_history);
 const b=await bounded.run({...options,dir:resumeDir});assert.notEqual(b.status,'failed',b.reason);assert.deepEqual(seen,batchOrder);assert.deepEqual(b.batch_history.slice(0,300),previous);assert.deepEqual(b.batch_history,a.batch_history);assert.deepEqual(b.pending,a.pending);assert.deepEqual(b.visited,a.visited);
 const x=bounded.materialize(continuousDir,a),y=bounded.materialize(resumeDir,b);for(const field of ['candidates','work','decisions','technique_observations'])assert.deepEqual(x[field],y[field],field);assert.deepEqual(core.combine(x),core.combine(y));assert.equal(new Set(seen.flat()).size,seen.flat().length);
 const result={status:'passed',api_calls:0,browser_calls:0,recorded_requests:requests.length,cut:300,targets:seen.flat().length,continuous_and_resume_exact:true,original_request_evidence_exact:true,duplicate_targets:0};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
if(require.main===module)run(path.resolve(process.argv[2]),path.resolve(process.argv[3])).catch(e=>{console.error(e);process.exitCode=1});
