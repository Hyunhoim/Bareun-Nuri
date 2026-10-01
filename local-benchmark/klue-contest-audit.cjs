const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-context.cjs');
const root='.runtime/klue-contest-v1',read=f=>JSON.parse(fs.readFileSync(f)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function main(){
 const gold=read('test-set-contest-v1/data/private/gold.json'),inputs=read(root+'/inputs.json'),coverage=read(root+'/coverage.json'),result=read(root+'/result.json');
 for(const [file,h]of Object.entries(read(root+'/frozen.json')))assert.equal(sha(fs.readFileSync(file)),h,file);
 for(const [file,h]of Object.entries(read(root+'/input-hashes.json')))assert.equal(sha(fs.readFileSync(root+'/'+file)),h,file);
 const candidates=new Map();let snapshotCount=0;
 for(const file of fs.readdirSync(root+'/snapshots')){const snap=read(root+'/snapshots/'+file);for(const c of snap.candidates){assert(!candidates.has(c.node_id));candidates.set(c.node_id,c);}snapshotCount++;}
 const ci=new Map(coverage.map(r=>[r.id,r])),gi=new Map(gold.map(r=>[r.id,r]));let rawMismatch=0;
 for(const row of inputs){const c=candidates.get(ci.get(row.id).node_id);assert(c);const e=contract().initialEvidence(c);assert.deepEqual(row.input,{target:e.normalized_text,context:context(c,e)});if(c.raw_text!==gi.get(row.id).raw_text)rawMismatch++;assert.deepEqual(Object.keys(row.input).sort(),['context','target']);}
 const metrics={};for(const name of ['baseline','candidate']){
  const ps=read(root+'/'+name+'-predictions.json');assert.deepEqual(ps.map(r=>r.id),inputs.map(r=>r.id));assert(ps.every(r=>Number.isInteger(r.prediction)&&r.prediction>=0&&r.prediction<4));
  const pred=new Map(ps.map(r=>[r.id,r.prediction]));let tp=0,fp=0,fn=0;
  for(const r of gold){if(r.is_violation){if(pred.get(r.id)===0)tp++;else fn++;}else if(pred.get(r.id)===0)fp++;}
  const f1=2*tp/(2*tp+fp+fn);assert.equal(result[name].overall.tp,tp);assert.equal(result[name].overall.fp,fp);assert.equal(result[name].overall.fn,fn);assert.equal(result[name].overall.f1,f1);metrics[name]={tp,fp,fn,f1};
 }
 const audit={status:'passed',snapshots:snapshotCount,inputs:inputs.length,exact_operational_input_reconstruction:inputs.length,raw_text_mismatches:rawMismatch,model_and_data_hashes_preserved:true,independent_metrics:metrics,additional_inference:0};fs.writeFileSync(root+'/audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
}
main();
