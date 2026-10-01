// Audit the bounded comparison decision; this does not certify a new deployment.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const data='.runtime/technique-specialist-data-v3',manifest=read(data+'/manifest.json');
for(const [f,v] of Object.entries(manifest.splits))assert.equal(sha(data+'/'+f),v.sha256);
for(const name of ['technique-specialist','technique-role']){const base='.runtime/'+name+'-model-v1';assert.equal(sha(base+'/model/model.safetensors'),read(base+'/frozen.json').model_sha256);}
const train=read(data+'/train-inputs.json'),dev=read(data+'/dev-inputs.json'),final=read(data+'/final-inputs.json');
const texts=a=>new Set(a.map(r=>JSON.stringify(r.input)));
for(const a of [dev,final])for(const v of texts(a))assert(!texts(train).has(v));
assert.equal(read(data+'/evaluation-status.json').final_campaigns,1);
assert.equal(read('.runtime/technique-specialist-eval-v1/submission-audit.json').html_checked,192);
assert.equal(read('.runtime/technique-collected-v1/audit.json').identity_checks,80);
assert(read('.runtime/technique-specialist-hcx-v1/completion.json').completed);
assert(read('.runtime/technique-collected-v1/hcx-completion.json').completed);
const {code}=require('./technique-specialist.cjs');
const timings=[];for(let i=0;i<25;i++){const start=performance.now();const result=final.map(code);assert.equal(result.filter(r=>r.label===0).length,12);timings.push((performance.now()-start)/1000);}
timings.sort((a,b)=>a-b);
const report={data_files_verified:Object.keys(manifest.splits).length,model_hashes_verified:2,exact_train_evaluation_overlap:0,
 lexical_family_independence:false,limitation:'deposit/depositary related family; already disclosed, no independent generalization claim',
 final_campaigns:1,code_seconds_96_median:timings[12],code_seconds_96_min:timings[0],code_seconds_96_max:timings.at(-1),
 decision:'retain operating code; reject tested auxiliary architectures for production',
 scope:'comparison decision only, not a claim that unresolved techniques are solved',
 promotion_25min_required_if_adopting:true,promotion_performed:false};
fs.writeFileSync('.runtime/technique-decision-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
