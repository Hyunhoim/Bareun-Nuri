const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {serve}=require('../test-set-contest-v1/server.cjs'),{createCollector}=require('../agent/src/core/collect.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-context.cjs');
const root='.runtime/klue-contest-v1',data='test-set-contest-v1/data',sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f)),save=(n,x)=>fs.writeFileSync(root+'/'+n+'.json',JSON.stringify(x,null,2));
async function main(){
 assert(!fs.existsSync(root),'Evaluation directory already exists');fs.mkdirSync(root);fs.mkdirSync(root+'/snapshots');
 const manifest=read(data+'/private/manifest.json');for(const [p,h]of Object.entries(manifest.hashes))assert.equal(sha(fs.readFileSync(data+'/'+p)),h,p);
 const freeze={};function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
 for(const f of [...files('agent/src/core'),...files('.runtime/klue-refinement-v1/model'),...files('.runtime/klue-cycle3-v1/frozen8/model'),'local-benchmark/klue-context.cjs','local-benchmark/klue-pilot.py',__filename,'local-benchmark/klue-contest-eval.py','docs/klue-contest-plan.md',data+'/private/manifest.json'])freeze[f]=sha(fs.readFileSync(f));save('frozen',freeze);
 // Address-only index. No class, base reading, or technique is fed into inference.
 const address=read(data+'/private/gold.json').map(({id,url,frame_path,selector})=>({id,url,frame_path,selector}));
 const byPage=Map.groupBy(address,r=>r.url),server=serve(0);await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 let collector;const rows=[],coverage=[],pageStats=[];const start=performance.now();
 try{collector=await createCollector({channel:'msedge'});let i=0;
  for(const [url,targets]of byPage){
   const snap=await collector.collect(origin+url,{maxPages:1,maxNodes:1000,followLinks:false,observeTechniques:true,signal:AbortSignal.timeout(60000)});save('snapshots/'+String(i).padStart(3,'0'),snap);
   const obs=new Map(snap.technique_observations.map(o=>[o.node_id,o]));
   for(const target of targets){const cs=snap.candidates.filter(c=>c.selector===target.selector&&(target.frame_path?c.frame_urls.some(u=>new URL(u).pathname===target.frame_path):c.frame_urls.length===0));assert(cs.length<=1,'Ambiguous location');
    if(!cs.length){coverage.push({...target,collected:false});continue;}const c=cs[0],e=contract().initialEvidence(c),o=obs.get(c.node_id);
    rows.push({id:target.id,input:{target:e.normalized_text,context:context(c,e)}});coverage.push({...target,collected:true,node_id:c.node_id,raw_text:c.raw_text,location:c.location,observations:o.observations,unresolved:o.unresolved,context_truncated:c.context_evidence?.truncated||false});
   }
   pageStats.push({url,candidates:snap.candidates.length,issues:snap.collection_issues,seconds:snap.collection_elapsed_sec});i++;
   if(i%25===0)console.log(JSON.stringify({pages:i,total:250,collected:rows.length,seconds:(performance.now()-start)/1000}));assert(performance.now()-start<3600000,'Collection safety cap');
  }
 }finally{if(collector)await collector.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 save('inputs',rows);save('coverage',coverage);save('collection',{origin,pages:pageStats,targets:address.length,collected:rows.length,missing:address.length-rows.length,seconds:(performance.now()-start)/1000});
 save('input-hashes',Object.fromEntries(['inputs','coverage','collection'].map(n=>[n+'.json',sha(fs.readFileSync(root+'/'+n+'.json'))])));
 console.log(JSON.stringify({complete:true,collected:rows.length,missing:address.length-rows.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
