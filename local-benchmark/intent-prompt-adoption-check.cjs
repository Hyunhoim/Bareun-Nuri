const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {contract}=require('../agent/src/core/judgment.cjs'),{estimate}=require('../agent/experiments/semantic-search-run.cjs');
const root='.runtime/intent-prompt-adoption-v1',read=f=>JSON.parse(fs.readFileSync(f));
(async()=>{assert.equal(contract().SYSTEM,read(root+'/expected-system.json'));
 const before=fs.readFileSync(root+'/judgment-before.cjs','utf8'),after=fs.readFileSync('agent/src/core/judgment.cjs','utf8'),strip=s=>s.replace(/const SYSTEM=.*?;\r?\nconst JUDGE=/s,'const JUDGE=');assert.equal(strip(before),strip(after));
 const inputs=read('.runtime/intent-prompt-refinement-v1/inputs.json'),by=new Map(inputs.map(r=>[r.c.node_id,r.c])),done=read('.runtime/intent-prompt-refinement-v1/completion.json');let n=0;
 for(const s of done.results.filter(s=>s.mode==='K'))for(const r of s.rows){const actual=await estimate(r.ids.map(id=>by.get(id)),{provider:'hcx',temperature:0,seed:42,reasoningEffort:'none',maxTokens:512},contract());assert.deepEqual(actual.body,r.body);n++;}
 const result={api:0,matching_frozen_K_requests:n,only_system_changed:true,sha256:crypto.createHash('sha256').update(after).digest('hex')};fs.writeFileSync(root+'/check.json',JSON.stringify(result,null,2));console.log(result);
})().catch(e=>{console.error(e);process.exitCode=1});
