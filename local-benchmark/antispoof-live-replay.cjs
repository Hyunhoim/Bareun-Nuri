// Replay frozen HCX decisions through both CPU technique models. No new API calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {materialize}=require('../agent/src/core/bounded-scan-store.cjs'),{digest}=require('../agent/src/core/scan.cjs');
async function main(dir){
 const partial=process.argv.includes('--committed-partial'),status=JSON.parse(fs.readFileSync(path.join(dir,'completion.json'))).status;
 assert.equal(status,partial?'failed':'completed','Do not compete with live timing');
 const out=path.join(dir,partial?'counterfactual-partial':'counterfactual');assert(!fs.existsSync(out),'Preserve replay; inspect prior run instead of restarting');fs.mkdirSync(out);
 let active;
 try{
  for(const source of (partial?['baseline']:['baseline','typed'])){
   const job=path.join(dir,source,'scan'),cp=JSON.parse(fs.readFileSync(path.join(job,'checkpoint.json')));assert.equal(digest(cp.state),cp.sha256);const data=materialize(job,cp.state),by=new Map(data.work.map(c=>[c.node_id,c])),ds=data.decisions.filter(d=>d.is_violation&&!d.needs_review),cs=ds.map(d=>by.get(d.node_id));assert(cs.every(Boolean));
   assert(!cp.state.inflight?.ids.some(id=>ds.some(d=>d.node_id===id)),'Unconfirmed decisions must not be replayed');
   fs.writeFileSync(path.join(out,source+'-input.json'),JSON.stringify({candidates:cs,decisions:ds,committed_work:data.decisions.length,unconfirmed_excluded:cp.state.inflight?.ids.length||0}));
   for(const arm of ['baseline','typed']){
    const bridge=arm==='baseline'?require('../agent/src/core/antispoof.cjs'):require('./antispoof-typed-bridge.cjs');active=bridge.createAntiSpoof({deadlineAt:Date.now()+3600000});const values=[],start=performance.now();
    try{for(let i=0;i<ds.length;i++){
     const copy=structuredClone(ds[i]);delete copy.antispoof;const [v]=await active.annotate([cs[i]],[copy]);assert(v.antispoof&&!v.antispoof.unresolved.some(x=>x.technique===null),'Runtime failure: preserve partial replay');values.push(v);
     fs.writeFileSync(path.join(out,source+'-'+arm+'.json'),JSON.stringify(values));
    }}finally{active.close();active=null;}
    console.log(JSON.stringify({source,arm,positive_work:ds.length,seconds:(performance.now()-start)/1000,api:0}));
   }
  }
  if(!partial){
   const {score,prefix}=require('./antispoof-live-evaluate.cjs'),{localKeys}=require('../.runtime/replica-context-supplement-v1/evaluate.cjs');
   const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>require('node:crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
   const seal=read('.runtime/replica-context-supplement-v1/manifest.json');for(const[f,h]of Object.entries(seal.gold_sha256))assert.equal(sha(path.join('.runtime/replica-context-supplement-v1',f)),h);
   const keys=localKeys('dev'),inventory=new Set(read(path.join(dir,'manifest.json')).profile.urls.map(keys.position)),gold=read('.runtime/replica-context-supplement-v1/dev-controlled-gold.json').filter(g=>inventory.has(keys.position(g))),result={};
   for(const source of ['baseline','typed']){
    const job=path.join(dir,source,'scan'),file=path.join(job,'checkpoint.json'),before=sha(file),state=read(file).state;
    const event=fs.readFileSync(path.join(dir,source,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.type==='progress'&&e.elapsedSec<=1500).at(-1);assert(event);
    result[source]={};for(const[period,s]of Object.entries({first25:prefix(state,event),end:state})){
     const ids=new Set(materialize(job,s).decisions.map(d=>d.node_id)),arms={};
     for(const arm of ['baseline','typed'])arms[arm]=score(job,s,gold,keys,read(path.join(out,source+'-'+arm+'.json')).filter(d=>ids.has(d.node_id)));
     assert.deepEqual(arms.baseline.rows.map(r=>[r.id,r.predicted]),arms.typed.rows.map(r=>[r.id,r.predicted]),'Intent changed');
     const changes=arms.baseline.rows.flatMap((a,i)=>{const b=arms.typed.rows[i];assert.equal(a.id,b.id);return JSON.stringify([...a.got].sort())===JSON.stringify([...b.got].sort())?[]:[{id:a.id,is_ad:a.is_ad,want:a.want,baseline:a.got,typed:b.got}];});
     result[source][period]={baseline:arms.baseline.controlled64,typed:arms.typed.controlled64,changes,antispoof:{baseline:arms.baseline.antispoof,typed:arms.typed.antispoof}};
    }assert.equal(sha(file),before,'Replay modified checkpoint');
   }
   fs.writeFileSync(path.join(out,'evaluation.json'),JSON.stringify({scope:'Fixed saved HCX intent; controlled positions only; historical regression, not independent generalization',api:0,result},null,2));
  }
  fs.writeFileSync(path.join(out,'completion.json'),JSON.stringify({status:'completed',api:0,partial,scope:'Same saved HCX positive work; not a new live speed run or completed 25-minute comparison'}));
 }catch(e){fs.writeFileSync(path.join(out,'completion.json'),JSON.stringify({status:'failed',error:e.message,no_automatic_retry:true}));throw e;}finally{active?.close();}
}
main(path.resolve(process.argv[2])).catch(e=>{console.error(e.message);process.exitCode=1;});
