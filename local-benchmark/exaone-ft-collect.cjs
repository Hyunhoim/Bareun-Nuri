const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs');
const {contract}=require('../agent/src/core/judgment.cjs');
const {context}=require('./klue-context.cjs');
async function main(){
 const root='.runtime/exaone-ft-v1',dir='local-benchmark/exaone-ft-data-v3';
 assert(!fs.existsSync(root+'/collected.json'),'Preserve collected evidence');
 const rows=JSON.parse(fs.readFileSync(dir+'/dataset.json')),allowed=new Set(rows.map(r=>'/'+r.id+'.html'));
 const server=http.createServer((req,res)=>{if(!allowed.has(req.url)){res.writeHead(404);return res.end();}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(dir+'/site'+req.url));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const collector=await createCollector({channel:'msedge'}),out=[],missing=[],start=Date.now();
 try{for(const [i,r]of rows.entries()){
  const snapshot=await collector.collect(origin+'/'+r.id+'.html',{maxPages:1,maxNodes:1000,followLinks:false,observeTechniques:true,signal:AbortSignal.timeout(30000)});
  const candidates=snapshot.candidates.filter(c=>/#target$/.test(c.selector));
  if(candidates.length!==1){missing.push({id:r.id,reason:'target_not_unique',selectors:snapshot.candidates.map(c=>c.selector)});continue;}
  const c=candidates[0],e=contract().initialEvidence(c);
  assert.equal(c.raw_text.replace(/\s+/g,' ').trim(),r.raw_target.replace(/\s+/g,' ').trim());
  out.push({id:r.id,group:r.group_id,family:r.leakage_family||null,category:r.category,origin:r.origin_version,label:r.suggested_label,weight:r.recommended_group_weight||.1,input:{target:e.normalized_text,context:context(c,e)},raw:c.raw_text,candidate:c});
  if((i+1)%20===0)console.log(JSON.stringify({collected:out.length,visited:i+1,total:rows.length,seconds:(Date.now()-start)/1000}));
 }}finally{await collector.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 fs.writeFileSync(root+'/collected.json',JSON.stringify({rows:out,missing,seconds:(Date.now()-start)/1000},null,2));console.log('COLLECTED',out.length,'MISSING',missing.length);
}
main().catch(e=>{console.error(e);process.exitCode=1});
