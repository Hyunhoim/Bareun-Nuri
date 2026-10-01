// Read-only audit. estimate() aborts before transport; no API keys or calls needed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function noLabels(value){
 if(!value||typeof value!=='object')return;
 for(const [key,child]of Object.entries(value)){assert(!['is_ad','expected','reading','scenario','split','label','labels'].includes(key),'Evaluator field in input: '+key);noLabels(child);}
}
async function audit(root,{partial=false,regression=false,single=false}={}){
 assert(!(regression&&single),'Choose one audit stage');
 root=path.resolve(root);const manifest=read(path.join(root,'manifest.json'));
 for(const [file,hash]of Object.entries(manifest.hashes)){
  assert.equal(sha(file),hash,'Frozen source/evidence changed: '+file);
  const archive=path.join(root,'source-archive',path.basename(file));
  if(fs.existsSync(archive))assert.equal(sha(archive),hash,'Archive differs: '+file);
 }
 // Hashes above ensure these live modules exactly match the frozen experiment.
 const {groups,specs}=require('./jamo-context-run.cjs'),{estimate,reordered}=require('./semantic-search-run.cjs');
 const data=regression||single?{oracle:new Map(),groups:(single?['single']:['dev','holdout']).map(name=>({name,labels:read(path.join(root,name+'-labels.json')),snapshot:read(path.join(root,name+'-evidence.json'))}))}:groups();
 if(regression){assert(manifest.modes.includes('A'));assert(manifest.modes.every(m=>['A','C','D'].includes(m)),'Regression cannot use human oracle');}
 const methods=specs(data.oracle),base=require('../src/core/judgment.cjs').contract();
 if(single){assert.deepEqual(manifest.modes,['A','D']);for(const m of manifest.modes){assert.equal(manifest.method_settings[m].batchSize,1);methods[m]={...methods[m],batchSize:1};}}
 let requests=0,responses=0,decisions=0,pending=0,conditions=0;const counts={};
 for(const group of data.groups){
  const saved=read(path.join(root,group.name+'-evidence.json'));
  assert.deepEqual(saved,group.snapshot,'Saved evidence differs from frozen builder');
  assert.deepEqual(read(path.join(root,group.name+'-labels.json')),group.labels);
  for(let round=0;round<manifest.rounds;round++)for(const mode of manifest.modes){
   const key=group.name+'-'+mode+'-r'+round,file=path.join(root,key+'-trace.jsonl');
   if(!fs.existsSync(file)){assert(partial,'Missing trace: '+key);continue;}
   const candidates=reordered({...group,snapshot:saved},round).snapshot.candidates;
   const spec=methods[mode],text=fs.readFileSync(file,'utf8'),lines=text.trim().split('\n').filter(Boolean).map(JSON.parse);
   const req=lines.filter(e=>e.event==='llm_request'),res=lines.filter(e=>e.event==='llm_response'),reconstructed=[];
   assert.equal(new Set(req.map(e=>e.call_number)).size,req.length,'Repeated request number');
   assert.equal(new Set(res.map(e=>e.call_number)).size,res.length,'Repeated response number');
   for(let i=0;i<req.length;i++){
    const r=req[i],batch=candidates.slice(i*spec.batchSize,(i+1)*spec.batchSize);
    assert.equal(r.call_number,i+1);assert(batch.length,'Excess request');
    const expected=await estimate(batch,{provider:'hcx',temperature:0,seed:42,maxTokens:spec.maxTokens,reasoningEffort:'none'},spec.contract);
    assert.deepEqual(r.body,expected.body,'Actual body differs: '+key+' #'+r.call_number);
    const input=JSON.parse(r.body.messages.find(m=>m.role==='user').content);noLabels(input);
    for(let j=0;j<batch.length;j++){
     const original=JSON.parse(JSON.stringify(base.initialEvidence(batch[j]))),actual=structuredClone(input.candidates[j]);
     actual.normalized_text=original.normalized_text;
     assert.deepEqual(actual,original,'Raw/context changed beyond normalized_text');
    }
    const response=res.find(e=>e.call_number===r.call_number);
    if(!response){pending++;assert(partial,'Unconfirmed response: '+key);continue;}
    const choice=response.data.choices[0];assert.equal(choice.finish_reason,'stop');assert(!choice.message.tool_calls?.length);
    const parsed=JSON.parse(choice.message.content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/,'$1'));
    assert.deepEqual(Object.keys(parsed),['decisions']);
    reconstructed.push(...spec.contract.validateModelDecisions(Object.entries(parsed.decisions).map(([node_id,d])=>({...d,node_id})),batch));
   }
   assert(res.every(r=>req.some(q=>q.call_number===r.call_number)),'Orphan response');
   const decisionFile=path.join(root,key+'-decisions.json'),savedDecisions=fs.existsSync(decisionFile)?read(decisionFile):[];
   // During a live read a response can be appended just before the decision file.
   if(partial)assert.deepEqual(savedDecisions,reconstructed.slice(0,savedDecisions.length));
   else{assert.deepEqual(savedDecisions,reconstructed);assert.equal(savedDecisions.length,candidates.length);}
   assert.equal(new Set(savedDecisions.map(d=>d.node_id)).size,savedDecisions.length);
   counts[key]={requests:req.length,responses:res.length,decisions:savedDecisions.length};
   requests+=req.length;responses+=res.length;decisions+=savedDecisions.length;conditions++;
  }
 }
 const completionFile=path.join(root,'completion.json');
 if(!partial){const completion=read(completionFile);assert.equal(completion.status,'completed');assert.equal(completion.failed_conditions,0);assert.equal(completion.attempts,requests);}
 assert(requests<=manifest.limits.calls);
 return {ok:true,partial,regression,single,manifest_hashes:Object.keys(manifest.hashes).length,conditions,requests,responses,decisions,pending,counts};
}
module.exports={audit};
if(require.main===module){
 const args=process.argv.slice(2),regression=args.includes('--regression'),single=args.includes('--single'),root=args.find(a=>!a.startsWith('--'))||(regression?'.runtime/jamo-context-regression-v1':single?'.runtime/jamo-context-single-v1':'.runtime/jamo-context-v1');
 audit(root,{partial:args.includes('--partial'),regression,single}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
