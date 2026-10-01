const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-scoped-context.cjs');
const root='.runtime/klue-retention-v1',run=root+'/run',read=p=>JSON.parse(fs.readFileSync(p)),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
for(const [f,h]of Object.entries(read(run+'/frozen.json')))assert.equal(sha(fs.readFileSync(f)),h,f);
for(const [f,h]of Object.entries(read(root+'/manifest.json').hashes))assert.equal(sha(fs.readFileSync(root+'/'+f)),h,f);
assert.equal(sha(fs.readFileSync('.runtime/klue-cycle3-v1/train.json')),read(run+'/contract.json').rehearsal_sha256);
for(const [f,h]of Object.entries(read('.runtime/klue-contest-v1/frozen.json')))assert.equal(sha(fs.readFileSync(f)),h,f);
const tr=read(root+'/train.json'),dev=read(root+'/development.json'),all=[...tr,...dev];assert.equal(new Set(all.map(r=>JSON.stringify(r.input))).size,all.length);assert(!tr.some(t=>dev.some(d=>d.group===t.group)));
for(const c of read(root+'/new-evidence.json')){const row=all.find(r=>c.selector==='p#'+r.id);assert(row);const e=contract().initialEvidence(c);assert.deepEqual(row.input,{target:e.normalized_text,context:context(c,e)});}
const result=read(run+'/result.json');for(const [arm,r]of Object.entries(result.development)){assert.equal(r.predictions.length,dev.length);const cm=Array.from({length:4},()=>Array(4).fill(0));dev.forEach((d,i)=>cm[d.label][r.predictions[i]]++);assert.deepEqual(cm,r.metrics.confusion);const tp=cm[0][0],fp=cm[1][0]+cm[2][0],fn=cm[0].slice(1).reduce((a,b)=>a+b,0);assert.equal(r.metrics.ad_f1,2*tp/(2*tp+fp+fn));}
const audit={status:'passed',new_dom_inputs_verified:24,unique_inputs:all.length,split_group_overlap:0,original_artifacts_preserved:true,selected:result.selected,extra_inference:0};
if(result.selected!=='A'){
 const rows=read('.runtime/klue-input-audit-v2/corrected-inputs.json'),ps=read(run+'/regression-predictions.json');assert.deepEqual(rows.map(r=>r.id),ps.map(r=>r.id));const p=new Map(ps.map(r=>[r.id,r.prediction]));let tp=0,fp=0,fn=0;const families={};for(const g of read('test-set-contest-v1/data/private/gold.json')){const f=families[g.scenario_family]??={tp:0,fp:0,fn:0,rows:0};f.rows++;if(g.is_violation){if(p.get(g.id)===0){tp++;f.tp++;}else{fn++;f.fn++;}}else if(p.get(g.id)===0){fp++;f.fp++;}}
 assert.equal(result.after.tp,tp);assert.equal(result.after.fp,fp);assert.equal(result.after.fn,fn);assert.equal(result.after.ad_f1,2*tp/(2*tp+fp+fn));audit.regression={tp,fp,fn,f1:2*tp/(2*tp+fp+fn)};fs.writeFileSync(run+'/by-family.json',JSON.stringify(families,null,2));
}
fs.writeFileSync(run+'/audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
