// Read-only saved-artifact audit; collected-only nodes are not semantic regressions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {isDeepStrictEqual:equal}=require('node:util');
const {splitCandidate}=require('../src/core/scan.cjs');
const base=require('../src/core/judgment.cjs').contract();
const auto=require('./jamo-context-auto.cjs').contract();
const json=value=>JSON.parse(JSON.stringify(value));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const withoutReading=value=>{const result=json(value);delete result.normalized_text;return result;};
const prefix=(a,b)=>{let n=0;while(n<Math.min(a.length,b.length)&&equal(a[n],b[n]))n++;return n;};
function load(root,contract){
 const scan=path.join(root,'scan');
 assert(fs.existsSync(path.join(scan,'run.json')),'Final run.json required; do not audit a running scan');
 const run=read(path.join(scan,'run.json'));
 const events=fs.readFileSync(path.join(scan,'trace.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 const requests=events.filter(e=>e.event==='llm_request'),responses=events.filter(e=>e.event==='llm_response');
 const candidates=new Map(),work=new Map();
 for(const name of fs.readdirSync(path.join(scan,'pages')).sort()){
  const file=path.join(scan,'pages',name,'evidence.json');if(!fs.existsSync(file))continue;
  for(const c of read(file).candidates){candidates.set(c.node_id,c);for(const part of splitCandidate(c))work.set(part.node_id,part);}
 }
 const submitted=new Map(),decisions=new Map(),issues=[],settings=[];
 for(const q of requests){
  const input=JSON.parse(q.body.messages.find(m=>m.role==='user').content);
  q.ids=input.candidates.map(c=>c.node_id);q.input=input;
  const setting=json(q.body);delete setting.messages;settings.push(setting);
  const system=q.body.messages.find(m=>m.role==='system')?.content;
  if(!system?.startsWith(base.SYSTEM))issues.push({type:'system_prompt_prefix',call:q.call_number});
  for(const c of input.candidates){
   if(submitted.has(c.node_id))issues.push({type:'duplicate_submission',id:c.node_id});
   submitted.set(c.node_id,c);
   const source=work.get(c.node_id);
   if(!source)issues.push({type:'missing_saved_work',id:c.node_id});
   else if(!equal(c,json(contract.initialEvidence(source))))issues.push({type:'contract_mismatch',id:c.node_id});
  }
  const response=responses.find(r=>r.call_number===q.call_number);
  if(!response){issues.push({type:'unconfirmed_request',call:q.call_number});continue;}
  try{
   const choice=response.data.choices[0];
   if(choice.finish_reason!=='stop')issues.push({type:'finish_reason',call:q.call_number,value:choice.finish_reason});
   const parsed=JSON.parse(choice.message.content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/,'$1'));
   if(!equal(Object.keys(parsed.decisions).sort(),q.ids.slice().sort()))issues.push({type:'response_id_contract',call:q.call_number});
   for(const [id,d]of Object.entries(parsed.decisions))decisions.set(id,d.publication_act);
  }catch(error){issues.push({type:'parse_response',call:q.call_number,message:error.message});}
 }
 return {run,requests,responses,candidates,work,submitted,decisions,issues,settings};
}
function audit(rootA,rootC){
 const a=load(rootA,base),c=load(rootC,auto),common=[...a.submitted.keys()].filter(id=>c.submitted.has(id));
 const inputChanges=[],readingChanges=[];
 for(const id of common){const x=a.submitted.get(id),y=c.submitted.get(id);if(!equal(withoutReading(x),withoutReading(y)))inputChanges.push(id);if(x.normalized_text!==y.normalized_text)readingChanges.push(id);}
 const batchKey=q=>JSON.stringify(q.ids),batchesA=new Map(a.requests.map(q=>[batchKey(q),q]));
 let commonBatches=0;const bodyDifferences=[];
 const stripBody=q=>{const b=json(q.body),u=b.messages.find(m=>m.role==='user'),v=JSON.parse(u.content);v.candidates=v.candidates.map(withoutReading);u.content=JSON.stringify(v);return b;};
 for(const q of c.requests){const prior=batchesA.get(batchKey(q));if(prior){commonBatches++;if(!equal(stripBody(prior),stripBody(q)))bodyDifferences.push({A:prior.call_number,C:q.call_number});}}
 const sharedCollected=[...a.candidates.keys()].filter(id=>c.candidates.has(id));
 const preservedFields=['raw_text','selector','location','url','frame_urls','signals','own_style','ancestors'];
 const collectionDifferences=[];
 for(const id of sharedCollected){const x=a.candidates.get(id),y=c.candidates.get(id),fields=preservedFields.filter(k=>!equal(x[k],y[k]));if(fields.length)collectionDifferences.push({id,fields});}
 const decisionChanges=[],commonDecisions=[...a.decisions.keys()].filter(id=>c.decisions.has(id));
 for(const id of commonDecisions){const x=a.decisions.get(id),y=c.decisions.get(id);if(x!==y)decisionChanges.push({id,A:x,C:y,adChanged:(x==='이용권유')!==(y==='이용권유'),readingChanged:readingChanges.includes(id)});}
 const summarize=s=>({pages:s.run.pages,collected:s.candidates.size,submitted:s.submitted.size,decided:s.decisions.size,calls:s.requests.length,responses:s.responses.length,elapsed_sec:s.run.elapsed_sec,reason:s.run.reason,issues:s.issues});
 return {baseline:path.resolve(rootA),candidate:path.resolve(rootC),A:summarize(a),C:summarize(c),
  settingsAllEqual:[...a.settings,...c.settings].every(v=>equal(v,a.settings[0])),
  batchPrefix:prefix(a.requests.map(q=>q.ids),c.requests.map(q=>q.ids)),targetPrefix:prefix([...a.submitted.keys()],[...c.submitted.keys()]),
  commonBatches,batchOnlyA:a.requests.filter(q=>!c.requests.some(r=>batchKey(q)===batchKey(r))).map(q=>q.call_number),batchOnlyC:c.requests.filter(q=>!batchesA.has(batchKey(q))).map(q=>q.call_number),
  commonSubmitted:common.length,inputChangesBeyondReading:inputChanges,readingChanges,commonBatchBodyDifferencesBeyondReading:bodyDifferences,
  commonCollected:sharedCollected.length,collectionDifferences,commonDecisions:commonDecisions.length,decisionChanges,
  baselinePositiveNotDecidedInC:[...a.decisions].filter(([id,v])=>v==='이용권유'&&!c.decisions.has(id)).map(([id])=>id),
  limitations:['Historical baseline versus new timed run; wall time and model variation are not randomized paired evidence.','Decision changes are restricted to nodes judged in both runs. Additional/missing collected nodes are coverage differences, not semantic regressions.','Positive transitions are raw model acts, not TP/FP without independent labels.','Checks reconstruct actual normalized_text from each saved raw work item, including long-text splitting.']};
}
module.exports={audit};
if(require.main===module){
 if(process.argv.includes('--self-test')){assert.equal(prefix([1,2],[1,3]),1);assert.deepEqual(withoutReading({node_id:'x',normalized_text:'a',passage:'raw'}),{node_id:'x',passage:'raw'});console.log('PASS prefix and one-field exclusion checks');}
 else{const result=audit(process.argv[2]||'.runtime/call-budget-600-v1',process.argv[3]||'.runtime/jamo-context-live-c-v1');const out=process.argv[4]||'.runtime/jamo-context-live-audit.json';fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
}
