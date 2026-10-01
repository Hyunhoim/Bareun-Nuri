const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-scoped-context.cjs');
const out='.runtime/filter-mixed-v1',sha=s=>crypto.createHash('sha256').update(s).digest('hex'),esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const seeds=fs.readFileSync('local-benchmark/filter-mixed-seeds.tsv','utf8').trim().split(/\r?\n/).slice(1).map(l=>{const [split,group_id,normal,offer,quotation,uncertain]=l.split('\t');assert(uncertain);return{split,group_id,normal,offer,quotation,uncertain};});
async function main(){
 assert(!fs.existsSync(out));fs.mkdirSync(out);fs.mkdirSync(out+'/snapshots');fs.mkdirSync(out+'/html');
 const pages=[],meta=[];
 for(const [i,s]of seeds.entries()){
  const parts=[];
  for(const mode of ['plain','JAMO','TRANSPARENT','OFFSCREEN'])for(const [kind,text,label]of [['normal',s.normal,0],['mixed',i%2?s.offer+' '+s.normal:s.normal+' '+s.offer,1],['quotation',s.quotation,0],['uncertain',s.uncertain,1]]){
   const id='m'+sha(s.group_id+mode+kind).slice(0,16),raw=mode==='JAMO'?text.normalize('NFD'):text;
   const style=mode==='TRANSPARENT'?'opacity:0':mode==='OFFSCREEN'?'position:absolute;left:-14000px':'';
   const tag=['article','section','div'][i%3];parts.push(`<${tag} role="comment"><p id="${id}" style="${style}">${esc(raw)}</p></${tag}>`);
   meta.push({id,split:s.split,group_id:s.group_id,mode,kind,label,semantic_intent:kind==='mixed'?'ad':kind==='uncertain'?'uncertain':'benign',raw});
  }
  pages.push(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${['시설 의견','시민 답글','이용 문의'][i%3]}</title><nav>시민 안내</nav><main>${parts.join('\n')}</main></html>`);fs.writeFileSync(out+'/html/'+i+'.html',pages[i]);
 }
 const server=http.createServer((req,res)=>{const i=Number(req.url.slice(1));if(!Number.isInteger(i)||!pages[i]){res.writeHead(404);return res.end();}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(pages[i]);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let collector;const rows=[];
 try{collector=await createCollector({channel:'msedge'});for(let i=0;i<pages.length;i++){
  const snap=await collector.collect(`http://127.0.0.1:${server.address().port}/${i}`,{maxPages:1,followLinks:false,maxNodes:10000,allowLongText:true,signal:AbortSignal.timeout(30000)});fs.writeFileSync(out+'/snapshots/'+i+'.json',JSON.stringify(snap));
  for(const m of meta.filter(m=>m.group_id===seeds[i].group_id)){
   const cs=snap.candidates.filter(c=>c.selector.endsWith('#'+m.id));assert.equal(cs.length,1);const c=cs[0];assert.equal(c.raw_text,m.raw);const e=contract().initialEvidence(c);
   const input={target:e.normalized_text,context:context(c,e)};assert(!input.context.includes(seeds[i].offer),'Foreign offer leaked');
   rows.push({...m,input,location:c.location,url:c.url,collection_truncated:c.context_evidence?.truncated||false});
  }
  if(i%10===0)console.log(JSON.stringify({pages:i+1,rows:rows.length}));
 }}finally{if(collector)await collector.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 const summary={};for(const split of ['train','validation','confirm']){
  const rs=rows.filter(r=>r.split===split),unique=new Map();for(const r of rs){const key=JSON.stringify(r.input);if(unique.has(key))assert.equal(unique.get(key).label,r.label);else unique.set(key,r);}
  const u=[...unique.values()];fs.writeFileSync(out+'/'+split+'.json',JSON.stringify(u,null,2));summary[split]={views:rs.length,unique:u.length,groups:new Set(rs.map(r=>r.group_id)).size};
 }
 fs.writeFileSync(out+'/raw-views.json',JSON.stringify(rows,null,2));fs.writeFileSync(out+'/audit.json',JSON.stringify({summary,source_sha256:sha(fs.readFileSync('local-benchmark/filter-mixed-seeds.tsv')),human_reviewed:false,synthetic:true},null,2));console.log(JSON.stringify(summary));
}
main().catch(e=>{console.error(e);process.exitCode=1});
