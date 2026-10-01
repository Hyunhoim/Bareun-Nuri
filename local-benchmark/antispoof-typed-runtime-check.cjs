const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const bridge=require('./antispoof-typed-bridge.cjs'),{run}=require('../agent/src/core/bounded-scan.cjs'),{observeTechniques}=require('../agent/src/core/techniques.cjs');
async function main(){
 const root='.runtime/antispoof-typed-runtime-v1',rows=JSON.parse(fs.readFileSync('.runtime/antispoof-auto-models-v1/inputs.json')),expected=JSON.parse(fs.readFileSync('.runtime/antispoof-typed-v1/automatic/scope-predictions.json'));
 const service=bridge.createAntiSpoof();try{
  const identity=bridge.identity(),pred=await service.request(rows);assert.deepEqual(pred.map(x=>x.labels),expected);
  const c={node_id:'probe',raw_text:'ㅎㅏㄱㄱㅛ c0ral',url:'https://example.test/',location:'#probe',page_title:'이용 안내',context_evidence:{units:[]}};
  const ds=await service.annotate([c],[{node_id:c.node_id,is_violation:true,needs_review:false,techniques:[],reason:'controlled fixture'}]);assert.equal(ds[0].antispoof.version,'typed-research-v1');assert(ds[0].antispoof.predictions.length);
  let calls=0;const dir=path.join(root,'resume-'+Date.now()),options={dir,entry:c.url,mode:'fifo',batchSize:12,observeTechniques:true,limits:{pages:1,calls:1,seconds:120},identity:{provider:'mock',antispoof:identity},readPage:async()=>({candidates:[c],pages:[{url:c.url,readiness:{settled:true},navigation:{links:[]}}],collection_issues:[],technique_observations:[observeTechniques(c)]}),createJudge:()=>({calls:[],decide:async()=>{calls++;return structuredClone(ds);}})};
  assert.equal((await run(options)).status,'completed');await run(options);assert.equal(calls,1);await assert.rejects(()=>run({...options,identity:{provider:'mock',antispoof:{...identity,version:'changed'}}}),/Cannot resume changed/);
  const summary={real_cpu_predictions:pred.length,parity:true,positive_annotation:true,persist_resume:true,identity_refusal:true,api:0,submission_25min:false};fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(summary,null,2));console.log(summary);
 }finally{service.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
