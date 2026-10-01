// Independent saved-request audit. No API calls; run only after completion.json exists.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {contracts}=require('./attribution-next-contracts.cjs');
const {estimate,reordered,measured}=require('./semantic-search-run.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const clean=v=>JSON.parse(JSON.stringify(v));
function assertNoGold(value){
 if(!value||typeof value!=='object')return;
 for(const [key,item]of Object.entries(value)){assert(!['expected','is_ad','reading','scenario','group','split'].includes(key),'Evaluator field in request: '+key);assertNoGold(item);}
}
async function audit(root){
 root=path.resolve(root);const completion=read(path.join(root,'completion.json')),manifest=read(path.join(root,'manifest.json'));
 assert.equal(completion.status,'completed','Final complete run required');assert.equal(completion.failed_conditions,0);
 assert.deepEqual(manifest.modes,['A','E','F','H']);assert.equal(manifest.rounds,2);
 let archived=0,hashedInputs=0;
 for(const [file,want]of Object.entries(manifest.hashes)){
  assert.equal(hash(file),want,'Frozen current source/input changed: '+file);
  if(path.dirname(file)===root){hashedInputs++;continue;}
  assert.equal(hash(path.join(root,'source-archive',path.basename(file))),want,'Archive changed: '+file);archived++;
 }
 const methods=contracts();methods.H=methods.A;
 const groups=['dev','eval','replica'].map(name=>({name,labels:read(path.join(root,name+'-labels.json')),snapshot:read(path.join(root,name+'-evidence.json'))}));
 const result={verified:false,sourceArchiveFiles:archived,hashedInputFiles:hashedInputs,conditions:{},calls:0,tokens:0,reserved:0,finishStop:0,http200:0,fencedResponses:0,unconfirmed:0,inputRows:0,networkCalls:0};
 const recorded=read(path.join(root,'results.json')),conditionInputs={};
 for(let round=0;round<manifest.rounds;round++)for(const original of groups)for(const mode of manifest.modes){
  const group=reordered(original,round),key=group.name+'-'+mode+'-r'+round,contract=methods[mode],size=mode==='H'?2:4;
  assert.equal(manifest.method_settings[mode].batchSize,size);assert.equal(manifest.method_settings[mode].maxTokens,512);
  const trace=fs.readFileSync(path.join(root,key+'-trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const requests=trace.filter(e=>e.event==='llm_request'),responses=trace.filter(e=>e.event==='llm_response'),calls=read(path.join(root,key+'-calls.json')),decisions=[];
  assert.equal(requests.length,Math.ceil(group.snapshot.candidates.length/size));assert.equal(requests.length,responses.length);assert.equal(requests.length,calls.length);
  const submitted=[],allInputs=[];let conditionTokens=0;
  for(let index=0;index<requests.length;index++){
   const request=requests[index],response=responses.find(e=>e.call_number===request.call_number),call=calls[index],batch=group.snapshot.candidates.slice(index*size,(index+1)*size);
   assert(response);assert.equal(call.number,request.call_number);assert.equal(call.status,'ok');assert.equal(call.http_status,200);assert.equal(call.model_returned,'HCX-007');
   assert.deepEqual(call.usage,response.data.usage);assert.equal(response.data.choices[0].finish_reason,'stop');
   const config={provider:'hcx',temperature:0,seed:42,maxTokens:512,reasoningEffort:'none'};
   const expected=await estimate(batch,config,contract);assert.deepEqual(request.body,expected.body,'Full body mismatch '+key+'/'+index);
   result.reserved+=expected.tokens;
   const input=JSON.parse(request.body.messages.find(m=>m.role==='user').content);assertNoGold(input);
   assert.deepEqual(Object.keys(input).sort(),['candidates','phase','role']);assert.equal(input.role,'judge');assert.equal(input.phase,'initial');
   for(let n=0;n<input.candidates.length;n++){
    const actual=input.candidates[n],baseline=clean(methods.A.initialEvidence(batch[n]));
    if(mode==='E'){const stripped=structuredClone(actual);delete stripped.observed_structure;assert.deepEqual(stripped,baseline);assert(actual.observed_structure);}
    else assert.deepEqual(actual,baseline,'A/F/H must have identical individual evidence');
    allInputs.push(actual);submitted.push(actual.node_id);result.inputRows++;
   }
   const content=response.data.choices[0].message.content.trim();if(content.startsWith('```'))result.fencedResponses++;
   const parsed=JSON.parse(content.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/,'$1'));
   assert.deepEqual(Object.keys(parsed.decisions).sort(),batch.map(c=>c.node_id).sort());
   const raw=Object.entries(parsed.decisions).map(([node_id,d])=>({...d,node_id}));
   decisions.push(...contract.validateModelDecisions(raw,batch));
   result.calls++;result.http200++;result.finishStop++;result.tokens+=call.usage.total_tokens;conditionTokens+=call.usage.total_tokens;
  }
  assert.equal(new Set(submitted).size,submitted.length,'Repeated candidate within condition');
  assert.deepEqual(submitted,group.snapshot.candidates.map(c=>c.node_id));
  assert.deepEqual(decisions,read(path.join(root,key+'-decisions.json')),'Raw response to saved decision mismatch '+key);
  const score=measured(group,decisions,calls);for(const k of ['tp','fp','fn','f1','precision','recall','tokens','calls','explicit_uncertain','unknown_predicted_ad'])assert.deepEqual(score[k],recorded[key][k],key+' '+k);
  conditionInputs[key]=allInputs;
  result.conditions[key]={targets:submitted.length,calls:calls.length,tokens:conditionTokens,tp:score.tp,fp:score.fp,fn:score.fn,f1:score.f1};
 }
 for(let round=0;round<manifest.rounds;round++)for(const group of groups){const k=mode=>group.name+'-'+mode+'-r'+round;assert.deepEqual(conditionInputs[k('A')],conditionInputs[k('F')]);assert.deepEqual(conditionInputs[k('A')],conditionInputs[k('H')]);}
 const budget=read(path.join(root,'budget.json'));assert.equal(result.calls,completion.attempts);assert.equal(result.calls,budget.attempts);assert.equal(result.reserved,budget.reserved);assert.equal(result.reserved,completion.reserved);
 assert(result.calls<=manifest.limits.calls);assert(result.reserved<=manifest.limits.tokens);result.verified=true;
 result.limitations=['Synthetic semantic panel; no real DOM extraction or 25-minute end-to-end adoption validation.','Two rounds change batch ordering; changes do not by themselves isolate model randomness from batch interference.','Labels are checked absent from actual request fields; authored source text and DOM metadata still have synthetic-design limitations.'];
 return result;
}
module.exports={audit};
if(require.main===module){
 global.fetch=async()=>{throw Error('Network forbidden in attribution audit');};
 if(process.argv.includes('--self-test')){assertNoGold({role:'judge',candidates:[{node_id:'x',normalized_text:'원문'}]});assert.throws(()=>assertNoGold({candidates:[{is_ad:true}]}));console.log('PASS label-field audit; API0');}
 else audit(process.argv[2]||'.runtime/attribution-next-v1').then(result=>{const file=process.argv[3]||'.runtime/attribution-next-audit.json';fs.writeFileSync(file,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}).catch(error=>{console.error(error);process.exitCode=1;});
}
