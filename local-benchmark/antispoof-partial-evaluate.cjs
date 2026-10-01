// Score only committed work from a failed live run; never resume or edit it.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {score}=require('./antispoof-live-evaluate.cjs'),{digest}=require('../agent/src/core/scan.cjs'),{localKeys}=require('../.runtime/replica-context-supplement-v1/evaluate.cjs');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const dir=path.resolve(process.argv[2]),job=path.join(dir,'baseline/scan'),file=path.join(job,'checkpoint.json'),before=sha(file),cp=read(file);assert.equal(digest(cp.state),cp.sha256);assert.equal(read(path.join(dir,'completion.json')).status,'failed');
assert.equal(read(path.join(dir,'counterfactual-partial/completion.json')).status,'completed');
const seal=read('.runtime/replica-context-supplement-v1/manifest.json');for(const[f,h] of Object.entries(seal.gold_sha256))assert.equal(sha(path.join('.runtime/replica-context-supplement-v1',f)),h);
const keys=localKeys('dev'),inventory=new Set(read(path.join(dir,'manifest.json')).profile.urls.map(keys.position)),gold=read('.runtime/replica-context-supplement-v1/dev-controlled-gold.json').filter(g=>inventory.has(keys.position(g))),result={};
for(const arm of ['baseline','typed'])result[arm]=score(job,cp.state,gold,keys,read(path.join(dir,'counterfactual-partial/baseline-'+arm+'.json')));
assert.equal(sha(file),before);const out=path.join(dir,'partial-evaluation.json');assert(!fs.existsSync(out));fs.writeFileSync(out,JSON.stringify({scope:'Failed live baseline; same committed HCX work; NOT a completed 25-minute comparison',unconfirmed_excluded:cp.state.inflight,source_checkpoint_sha256:before,result},null,2));console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k,v])=>[k,{metrics:v.controlled64,antispoof:v.antispoof}]))));
