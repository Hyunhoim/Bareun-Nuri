const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=p=>JSON.parse(fs.readFileSync(p)),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function evidence(dir){
 const records=fs.readFileSync(path.join(dir,'trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse),inputs=new Map(),settings=new Set();
 for(const e of records.filter(e=>e.event==='llm_request')){
  const b=e.body;settings.add(hash(JSON.stringify({system:b.messages[0],temperature:b.temperature,max:b.maxCompletionTokens,thinking:b.thinking,seed:b.seed})));
  const cs=JSON.parse(b.messages.find(m=>m.role==='user').content).candidates;
  for(const c of cs){const h=hash(JSON.stringify(c));if(inputs.has(c.node_id))assert.equal(inputs.get(c.node_id),h,'Evidence changed on retry');inputs.set(c.node_id,h);}
 }return {inputs,settings};
}
function audit(root){
 const manifests=['phase-a-manifest.json','phase-b-manifest.json'];let verified=0;
 for(const name of manifests)for(const [file,h]of Object.entries(read(path.join(root,name)).files)){assert.equal(hash(fs.readFileSync(file)),h);verified++;}
 for(const name of ['scoring-manifest.json','path-source-manifest.json'])for(const [file,h]of Object.entries(read(path.join(root,name))))assert.equal(hash(fs.readFileSync(file)),h);
 const comparisons=[],settings=new Set();let successfulCalls=0,tokens=0;
 for(const site of ['dev-101','confirmation-201']){
  const runs={};
  for(const mode of ['fifo','bandit','bandit-path']){
   const dir=path.join(root,site+'-'+mode),run=read(path.join(dir,'run.json'));assert.equal(run.status,'completed');assert(!fs.existsSync(path.join(dir,'inflight.json')));
   const e=evidence(dir),ds=read(path.join(dir,'decisions.json'));for(const s of e.settings)settings.add(s);
   runs[mode]={...e,ds:new Map(ds.map(d=>[d.node_id,d]))};
   assert(run.calls.every(c=>c.http_status===200&&c.status==='ok'&&Number.isFinite(c.usage?.total_tokens)));
   successfulCalls+=run.calls.length;tokens+=run.calls.reduce((n,c)=>n+c.usage.total_tokens,0);
  }
  for(const [a,b]of [['fifo','bandit'],['bandit','bandit-path']]){
   const common=[...runs[a].inputs.keys()].filter(id=>runs[b].inputs.has(id));for(const id of common)assert.equal(runs[a].inputs.get(id),runs[b].inputs.get(id));
   const sig=d=>JSON.stringify({ad:d.is_violation,review:d.needs_review,tech:[...d.techniques].sort(),observed:[...d.observed_techniques].sort()});
   comparisons.push({site,baseline:a,variant:b,identical_common_inputs:common.length,decision_changes:common.filter(id=>sig(runs[a].ds.get(id))!==sig(runs[b].ds.get(id))),
    ad_changes:common.filter(id=>{const x=runs[a].ds.get(id),y=runs[b].ds.get(id);return (x.is_violation&&!x.needs_review)!==(y.is_violation&&!y.needs_review);})});
  }
 }
 assert.equal(settings.size,1,'Prompt or model settings changed between conditions');
 const budget=read(path.join(root,'budget.json')).requests;
 const result={verified_manifest_entries:verified,common_settings:true,successful_calls:successfulCalls,successful_tokens:tokens,total_attempts_including_v1:budget.length,
  confirmed_tokens_including_v1:budget.reduce((n,r)=>n+(r.tokens??0),0),accounted_tokens_including_unknown:budget.reduce((n,r)=>n+(r.tokens??r.reserved),0),comparisons};
 fs.writeFileSync(path.join(root,'final-audit.json'),JSON.stringify(result,null,2));return result;
}
if(require.main===module)console.log(JSON.stringify(audit(process.argv[2]||'.runtime/navigation-live-v2'),null,2));
