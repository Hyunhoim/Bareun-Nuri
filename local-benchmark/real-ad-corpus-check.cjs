// Reuse the production collector on local synthetic DOM only; no model/API calls.
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs');
const {contract}=require('../agent/src/core/judgment.cjs');
const {context}=require('./klue-scoped-context.cjs');
async function main(){
 const root='local-benchmark/real-ad-corpus-v1',rows=JSON.parse(fs.readFileSync(root+'/fixtures.json'));
 const allowed=new Map(rows.map(r=>['/'+r.id+'.html',r]));
 const server=http.createServer((req,res)=>{
  const r=allowed.get(req.url);if(!r){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(root+'/'+r.file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let collector;const out=[],start=Date.now();
 try{
  collector=await createCollector({channel:'msedge'});
  for(const r of rows){
   const snapshot=await collector.collect('http://127.0.0.1:'+server.address().port+'/'+r.id+'.html',{maxPages:1,maxNodes:1000,followLinks:false,observeTechniques:true,signal:AbortSignal.timeout(30000)});
   const candidates=snapshot.candidates.filter(c=>/#target$/.test(c.selector));assert.equal(candidates.length,1,r.id);
   const c=candidates[0],e=contract().initialEvidence(c);
   assert.equal(c.raw_text.replace(/\s+/g,' ').trim(),r.target.replace(/\s+/g,' ').trim());
   assert(c.signals.includes(r.technique),'Expected observation missing: '+r.id+' '+r.technique);
   const scoped=context(c,e);assert(!scoped.includes(r.independent_neighbor),'Independent neighbour leaked into owned context');
   out.push({id:r.id,parent_id:r.parent_id,label:r.label,expected_technique:r.technique,origin:r.origin,input:{target:e.normalized_text,context:scoped},candidate:c});
   if(out.length%8===0)console.log('CHECKED',out.length,'/',rows.length);
  }
 }finally{if(collector)await collector.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 const result={passed:true,count:out.length,seconds:(Date.now()-start)/1000,scope:'synthetic DOM target extraction, four technique signals and neighbour isolation; no live-site parity or semantic accuracy claim',rows:out};
 fs.writeFileSync(root+'/collector-check.json',JSON.stringify(result,null,2));console.log('PASS',out.length,'fixture targets and context isolation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
