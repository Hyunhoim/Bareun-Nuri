// No API: prove the post-comparison URL-preservation fix leaves measured runs unchanged.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {run,atomic}=require('../src/core/scan.cjs'),{canonical}=require('../src/core/collect.cjs');
const read=p=>JSON.parse(fs.readFileSync(p));
(async()=>{
 const root=process.argv[2]||'.runtime/scope-trial-v2',out=path.join(root,'final-replay-'+Date.now());fs.mkdirSync(out);let verified=0;
 for(const id of ['mixed-0','mixed-1'])for(const mode of ['fifo','bandit','bandit-path']){
  const original=read(path.join(root,id+'-'+mode,'checkpoint.json')).state,data=read(path.join(root,id+'.json'));
  const batchIds=fs.readFileSync(path.join(root,id+'-'+mode,'trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.event==='llm_request').map(e=>JSON.parse(e.body.messages.find(m=>m.role==='user').content).candidates.map(c=>c.node_id));let index=0;
  const state=await run({dir:path.join(out,id+'-'+mode),entry:data.entry,scope:'/',mode,limits:{pages:12,calls:20,seconds:60},identity:{provider:'recorded-replay'},
   readPage:async url=>{const p=data.snapshot.pages.find(p=>canonical(p.url)===canonical(url));return structuredClone({pages:[p],candidates:data.snapshot.candidates.filter(n=>n.url===p.url),collection_issues:[]});},
   createJudge:()=>{const calls=[];return {calls,decide:async cs=>{assert.deepEqual(cs.map(c=>c.node_id),batchIds[index++]);calls.push({usage:{total_tokens:0}});return cs.map(c=>original.decisions.find(d=>d.node_id===c.node_id));}};}});
  assert.equal(state.reason,'page_budget');assert.deepEqual(state.pages,original.pages);assert.deepEqual(state.candidates,original.candidates);assert.deepEqual(state.decisions,original.decisions);assert.equal(index,batchIds.length);verified++;
 }
 const sourceHashes=Object.fromEntries(['scan.cjs','frontier.cjs','collect.cjs','frame-access.cjs','llm.cjs','output.cjs'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync('agent/src/core/'+f)).digest('hex')]));
 atomic(root,'final-replay-check.json',{verified,api_calls:0,sourceHashes,out});console.log(JSON.stringify({verified,api_calls:0,out}));
})().catch(e=>{console.error(e);process.exitCode=1;});
