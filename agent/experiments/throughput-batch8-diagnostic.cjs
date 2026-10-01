// Offline full-workload batching only; not an execution-time or semantic accuracy test.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {splitCandidate,digest}=require('../src/core/scan.cjs');
const {contract}=require('../src/core/judgment.cjs');
const {fitBatch,estimateBatch}=require('../src/core/request-budget.cjs');
const read=f=>JSON.parse(fs.readFileSync(f));
async function main(){
 const root='.runtime/scale-large-live-v1',out='.runtime/throughput-batch8-v1';assert(!fs.existsSync(out));
 const files=fs.readdirSync(root+'/snapshots').filter(f=>f.endsWith('.json')).sort(),pages=files.map(f=>read(root+'/snapshots/'+f));
 const originals=files.map(f=>read('.runtime/jamo-context-live-c-v1/snapshots/'+f));
 assert.equal(pages.length,20);assert.deepEqual(pages.map(p=>p.candidates),originals.map(p=>p.candidates));
 const sourceBefore=digest(pages),originalCandidatesHash=digest(originals.map(p=>p.candidates));
 const config={...read(root+'/manifest.json').settings,maxTokens:512,tokensPerMinute:52000},judge=contract();
 const raw=pages.flatMap(p=>p.candidates),workPages=pages.map(p=>p.candidates.flatMap(splitCandidate)),work=workPages.flat();
 assert.equal(raw.length,3543);assert.equal(new Set(work.map(c=>c.node_id)).size,work.length);
 const evidenceHash=digest(work.map(c=>judge.initialEvidence(c))),long=[];
 for(const c of raw.filter(c=>c.raw_text.length>12000)){
  const parts=splitCandidate(c);assert.equal(parts[0].source_start,0);assert.equal(parts.at(-1).source_end,c.raw_text.length);
  for(let i=0;i<parts.length;i++){
   const part=parts[i];assert.equal(part.raw_text,c.raw_text.slice(part.source_start,part.source_end));
   assert.equal(part.source_node_id,c.node_id);if(i)assert.equal(parts[i-1].source_end-part.source_start,400);
  }
  long.push({node_id:c.node_id,chars:c.raw_text.length,parts:parts.map(p=>({id:p.node_id,start:p.source_start,end:p.source_end}))});
 }
 const results=[];
 for(const maximum of [4,8]){
  const rows=[],observed=[],perPage=[];let shrunk=0;
  for(let pi=0;pi<workPages.length;pi++){
   const items=workPages[pi],first=rows.length;
   for(let offset=0;offset<items.length;){
    const proposed=items.slice(offset,offset+maximum),batch=await fitBatch(proposed,config,judge,maximum);
    assert(batch.length>0&&batch.length<=maximum&&batch.every((c,i)=>c===proposed[i]));
    const estimate=await estimateBatch(batch,config,judge);assert(estimate<=52000);
    if(batch.length<proposed.length)shrunk++;
    for(const c of batch){assert.deepEqual(judge.initialEvidence(c),judge.initialEvidence(items[offset++]));observed.push(c);}
    rows.push({page:pi+1,offset:offset-batch.length,count:batch.length,estimated_reserved_tokens:estimate,ids:batch.map(c=>c.node_id)});
   }
   perPage.push({page:pi+1,raw:pages[pi].candidates.length,work:items.length,calls:rows.length-first});
  }
  assert.deepEqual(observed.map(c=>c.node_id),work.map(c=>c.node_id));assert.equal(digest(observed.map(c=>judge.initialEvidence(c))),evidenceHash);
  results.push({maximum,calls:rows.length,reserved_tokens:rows.reduce((s,r)=>s+r.estimated_reserved_tokens,0),output_reservations:rows.length*512,max_request_estimate:Math.max(...rows.map(r=>r.estimated_reserved_tokens)),shrunk_batches:shrunk,batch_histogram:rows.reduce((m,r)=>(m[r.count]=(m[r.count]||0)+1,m),{}),per_page:perPage,rows});
 }
 assert.equal(digest(pages),sourceBefore,'Source/observation data changed');
 const output={api_calls:0,scope:'Page-local complete workload partition; not actual SRPT order/time/accuracy',pages:pages.length,raw_candidates:raw.length,work_items:work.length,source_candidates_hash:digest(pages.map(p=>p.candidates)),original_candidates_hash:originalCandidatesHash,source_snapshot_hash:sourceBefore,model_evidence_hash:evidenceHash,long_candidates:long,settings:{maxCompletionTokens:512,tokensPerMinute:52000,reasoning:'none'},results};
 fs.mkdirSync(out);fs.writeFileSync(out+'/audit.json',JSON.stringify(output,null,2));console.log(JSON.stringify({...output,long_candidates:long.map(x=>({node_id:x.node_id,chars:x.chars,parts:x.parts.length})),results:results.map(({rows,per_page,...r})=>r)}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
