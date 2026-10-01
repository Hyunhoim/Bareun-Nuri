// Recollect one known training source per campaign; not new independent ads.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-scoped-context.cjs');
const R='.runtime/semantic-real-recapture-v1',TRAIN='local-benchmark/synthetic-extension-v2/combined-train-candidates.jsonl';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),save=(f,x)=>fs.writeFileSync(R+'/'+f,JSON.stringify(x,null,2));
async function main(){
 assert(!fs.existsSync(R));const families=new Map();for(const r of fs.readFileSync(TRAIN,'utf8').trim().split('\n').map(JSON.parse))if(r.augmentation==='none'&&r.origin==='real_web_excerpt'&&r.label===1&&!families.has(r.family_id))families.set(r.family_id,r.source_url);assert.equal(families.size,7);
 fs.mkdirSync(R);const hashes=Object.fromEntries([__filename,TRAIN,'agent/src/core/collect.cjs','agent/src/core/judgment.cjs','local-benchmark/klue-scoped-context.cjs'].map(f=>[f,sha(fs.readFileSync(f))]));save('manifest.json',{purpose:'known_training_source_input_alignment_not_independent_data',sources:[...families],hashes,api_calls:0});
 const collector=await createCollector({channel:'msedge'}),log=[],rows=[];
 try{for(const [page,[family_id,url]]of [...families].entries()){
  const start=Date.now();try{
   for(const [f,h]of Object.entries(hashes))assert.equal(sha(fs.readFileSync(f)),h);
   const s=await collector.collect(url,{entryUrl:url,scope:'/',maxPages:1,maxNodes:10000,followLinks:false,recordNavigation:true,allowLongText:true,allowEmpty:true,observeTechniques:true,signal:AbortSignal.timeout(60000)});
   const file=`snapshot-${page}.json`;save(file,s);log.push({family_id,url,file,sha256:sha(fs.readFileSync(R+'/'+file)),seconds:(Date.now()-start)/1000,candidates:s.candidates.length,issues:s.collection_issues});
   for(const c of s.candidates){const ev=contract().initialEvidence(c);rows.push({id:sha(url+'\n'+c.location).slice(0,24),page,family_id,url:c.url,selector:c.selector,location:c.location,node_id:c.node_id,raw:c.raw_text,input:{target:ev.normalized_text,context:context(c,ev)},collection_truncated:!!c.context_evidence?.truncated,snapshot:file});}
  }catch(err){log.push({family_id,url,seconds:(Date.now()-start)/1000,error:err.message});}
  save('capture.json',log);save('inputs.json',rows);console.log(JSON.stringify(log.at(-1)));
 }}finally{await collector.close();}
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);save('captured.json',{pages:log.length,snapshot_files:log.filter(r=>r.file).length,rows:rows.length,inputs_sha256:sha(fs.readFileSync(R+'/inputs.json'))});
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
