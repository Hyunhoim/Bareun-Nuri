// Isolated post-check experiment; uses the packaged CPU model, never changes production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {queries,createAntiSpoof,mergeObservation}=require('../agent/src/core/antispoof.cjs');
const {observeTechniques,integrateObservations}=require('../agent/src/core/techniques.cjs');
const {run}=require('../agent/src/core/bounded-scan.cjs');
const root=path.resolve(__dirname,'..');
function pureJamo(text){const s=text.replace(/[\s\u200b\u200c\u200d]/gu,'');return !!s&&/^[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff\uffa0-\uffdc]+$/u.test(s);}
function guard(candidate,decision){
 const out=structuredClone(decision),a=out.antispoof;if(!a||!out.is_violation||out.needs_review)return out;
 for(const o of a.observations){if(o.technique!=='HOMOGLYPH')continue;
  o.evidence=o.evidence.filter(e=>{
   assert.equal(candidate.raw_text.slice(e.start,e.end),e.text,'Proof offset mismatch');
   if(!pureJamo(e.text))return true;
   a.unresolved.push({...e,reason:'pure_jamo_without_independent_h_evidence'});return false;
  });
 }
 a.observations=a.observations.filter(o=>o.evidence.length);
 // Original model probabilities/labels remain available for audit.
 a.evidence_policy='pure-jamo-h-review-v1';return out;
}
async function main(){
 const dir=path.join(root,'.runtime/antispoof-evidence-integration-'+Date.now());fs.mkdirSync(dir);
 const pins=JSON.parse(fs.readFileSync(path.join(root,'.runtime/antispoof-scope-v1/operating-before.json')));
 const raw=['ㅎㅏㄱㄱㅛ c0ral','😀 c0ral ㅎㅏㄱㄱㅛ','학교 c0ral','ㅎ ㅏ ㄱ ㄱ ㅛ c0ral','ㅎㅏㄱㄱㅛ ｃoral','ㅎㅏㄱㄱㅛc0ral','ㅁl소','정상 안내'];
 const cs=raw.map((raw_text,i)=>({node_id:'n'+i,url:'https://example.test/',location:'#n'+i,raw_text,page_title:'안내',context_evidence:{units:[],truncated:false}}));
 cs.push({...cs[0],node_id:'normal'});
 const ds=cs.map(c=>({node_id:c.node_id,is_violation:c.node_id!=='normal',needs_review:false,techniques:[],reason:'controlled intent; not live HCX'}));
 const service=createAntiSpoof();let before;
 const start=performance.now();try{before=await service.annotate(cs,ds);}finally{service.close();}
 const inferenceMs=performance.now()-start;
 assert(!before.at(-1).antispoof);
 for(const c of cs)for(const q of queries(c))assert.equal(c.raw_text.slice(q.start,q.end),q.token);
 const t=performance.now(),after=before.map((d,i)=>guard(cs[i],d)),guardMs=performance.now()-t;
 const obs=cs.map(c=>observeTechniques(c)),snapshot={candidates:cs};
 const finalBefore=integrateObservations(snapshot,before,obs),finalAfter=integrateObservations(snapshot,after,obs);
 for(let i=0;i<cs.length;i++){
  assert.equal(after[i].is_violation,before[i].is_violation);
  assert.deepEqual(after[i].antispoof?.predictions,before[i].antispoof?.predictions);
  assert.deepEqual(after[i].antispoof?.observations.filter(o=>o.technique==='JAMO'),before[i].antispoof?.observations.filter(o=>o.technique==='JAMO'));
  const merged=mergeObservation(obs[i],after[i]);
  for(const o of obs[i].observations)for(const e of o.evidence)assert(merged.observations.some(x=>x.technique===o.technique&&x.evidence.some(v=>JSON.stringify(v)===JSON.stringify(e))));
 }
 assert(after[0].antispoof.unresolved.some(e=>e.reason==='pure_jamo_without_independent_h_evidence'));
 // Synthetic response contract: a separate valid H span must survive the guard.
 const contract=structuredClone(before[0]);contract.antispoof.observations=[{technique:'HOMOGLYPH',evidence:[]}];
 // Use actual UTF-16 offsets.
 contract.antispoof.observations[0].evidence=queries(cs[0]).map(q=>({start:q.start,end:q.end,text:q.token}));
 assert.deepEqual(guard(cs[0],contract).antispoof.observations[0].evidence.map(e=>e.text),['c0ral']);
 for(const s of ['ㅎㅏㄱc0ral','ㅁl소','학교',''])assert(!pureJamo(s));
 let calls=0;const scanDir=path.join(dir,'resume');
 const options={dir:scanDir,entry:cs[0].url,scope:'/',mode:'fifo',batchSize:12,observeTechniques:true,identity:{provider:'controlled-replay',policy:'pure-jamo-h-review-v1'},limits:{pages:1,calls:1,seconds:120},readPage:async()=>({candidates:cs,pages:[{url:cs[0].url,readiness:{settled:true},navigation:{links:[]}}],collection_issues:[],technique_observations:obs}),createJudge:()=>({calls:[],decide:async(batch)=>{calls++;return structuredClone(after.filter(d=>batch.some(c=>c.node_id===d.node_id)));}})};
 const first=await run(options);assert.equal(first.status,'completed');const count=calls;
 await run(options);assert.equal(calls,count);await assert.rejects(()=>run({...options,identity:{...options.identity,policy:'different'}}),/Cannot resume changed/);
 for(const [file,hash]of Object.entries(pins))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,file))).digest('hex'),hash);
 const summary={cases:cs.length,queries:before.flatMap(d=>d.antispoof?.predictions||[]).length,inferenceMs,guardMs,demoted:after.flatMap(d=>d.antispoof?.unresolved||[]).filter(x=>x.reason==='pure_jamo_without_independent_h_evidence').length,finalBefore:finalBefore.decisions.map(d=>d.techniques),finalAfter:finalAfter.decisions.map(d=>d.techniques),code_preserved:true,raw_predictions_preserved:true,intent_preserved:true,resume_no_reinference:true,production_files_unchanged:Object.keys(pins).length,api_calls:0,controlled_fixture:true,submission_25min:false};
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({summary,candidates:cs,before,after,finalBefore,finalAfter},null,2));console.log(JSON.stringify({dir,...summary}));
}
module.exports={guard,pureJamo};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});


