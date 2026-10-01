const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-scoped-context.cjs');
const root='.runtime/klue-audit-learning-v1',run=root+'/run-cpu',read=p=>JSON.parse(fs.readFileSync(p)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const data=[...read(root+'/train.json'),...read(root+'/validation.json')],evidence=read(root+'/evidence.json');assert.equal(data.length,evidence.length);
for(let i=0;i<data.length;i++){const c=evidence[i],e=contract().initialEvidence(c);assert.equal(c.selector,'p#'+data[i].id);assert.deepEqual(data[i].input,{target:e.normalized_text,context:context(c,e)});}
for(const [f,h]of Object.entries(read(root+'/manifest.json').hashes))assert.equal(sha(fs.readFileSync(root+'/'+f)),h,f);
for(const [f,h]of Object.entries(read(run+'/frozen.json')))assert.equal(sha(fs.readFileSync(f)),h,f);
const old='.runtime/klue-contest-v1';for(const [f,h]of Object.entries(read(old+'/frozen.json')))assert.equal(sha(fs.readFileSync(f)),h,f);
const gp='test-set-contest-v1/data/private/gold.json',gold=read(gp);assert.equal(sha(fs.readFileSync(gp)),read('.runtime/klue-label-audit-v1/review-frozen.json').original_gold_sha256);
const rows=read('.runtime/klue-input-audit-v2/corrected-inputs.json'),ps=read(run+'/regression-predictions.json');assert.deepEqual(rows.map(r=>r.id),ps.map(r=>r.id));const pred=new Map(ps.map(r=>[r.id,r.prediction]));let tp=0,fp=0,fn=0;
for(const r of gold){if(r.is_violation){if(pred.get(r.id)===0)tp++;else fn++;}else if(pred.get(r.id)===0)fp++;}
const result=read(run+'/result.json');assert.equal(result.regression_after.tp,tp);assert.equal(result.regression_after.fp,fp);assert.equal(result.regression_after.fn,fn);assert.equal(result.regression_after.f1,2*tp/(2*tp+fp+fn));
const audit={status:'passed',new_dom_inputs_verified:data.length,original_models_sources_gold_preserved:true,prediction_ids_verified:ps.length,independent_metrics:{tp,fp,fn,f1:2*tp/(2*tp+fp+fn)},extra_inference:0};fs.writeFileSync(run+'/audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
