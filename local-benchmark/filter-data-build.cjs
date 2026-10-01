// Synthetic contrast corpus: render HTML, then use the real collector's evidence.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs');
const {contract}=require('../agent/src/core/judgment.cjs');
const {context}=require('./klue-scoped-context.cjs');
const root='local-benchmark/filter-data-v1',out='.runtime/filter-data-v1',sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const seeds=fs.readFileSync(root+'/seeds.tsv','utf8').trim().split(/\r?\n/).slice(1).map(l=>{const [split,family,target,safe,risky,intent]=l.split('\t');assert(split&&family&&target&&safe&&risky&&['ad','uncertain'].includes(intent));return{split,family,target,safe,risky,intent};});
assert.equal(seeds.length,60);assert.equal(new Set(seeds.map(s=>s.family)).size,60);
const digit=s=>s.replace(/[AOIESTaoiest]/g,c=>({a:'4',o:'0',i:'1',e:'3',s:'5',t:'7'}[c.toLowerCase()]));
async function main(){
 assert(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});fs.mkdirSync(out+'/html');fs.mkdirSync(out+'/snapshots');
 const pages=[],meta=[];
 for(const [i,s]of seeds.entries()){
  const fragments=[],variants=['plain','JAMO','TRANSPARENT','OFFSCREEN',...(/[AOIESTaoiest]/.test(s.target)?['HOMOGLYPH']:[])];
  for(const mode of variants)for(const label of [0,1]){
   const id='f'+sha(s.family+mode+label).slice(0,16),own=label?s.risky:s.safe;
   let target=mode==='JAMO'?s.target.normalize('NFD'):mode==='HOMOGLYPH'?digit(s.target):s.target;
   // Both labels share a layout; some evidence is in the target, some in owned context.
   const inline=i%3===0,targetText=inline?own+' '+target:target;
   const tag=s.split==='train'?'article':s.split==='validation'?'section':'div';
   const style=mode==='TRANSPARENT'?'opacity:0':mode==='OFFSCREEN'?'position:absolute;left:-12000px':'';
   fragments.push(`<${tag} role="comment">${inline?'':`<p>${esc(own)}</p>`}<p id="${id}" style="${style}">${esc(targetText)}</p></${tag}>`);
   meta.push({id,split:s.split,group_id:s.family,site_group:s.split+'-synthetic',mode,label,route:label?'HCX':'EXCLUDE',semantic_intent:label?s.intent:'benign',target_expected:targetText,owned_context:own,inline,rationale:label?(s.intent==='ad'?'거래 또는 이용을 직접 권유하므로 최종 의미 판정을 HCX에 맡김':'목적/거래의 적법성 또는 의도를 확정할 근거가 부족하므로 전달'):'대상과 귀속 문맥을 함께 읽으면 정상 행정·합법 이용·피해 문의·인용임을 확인할 수 있음',human_reviewed:false});
  }
  // No label, technique, split or family markers in the rendered document.
  const html='<!doctype html><html lang="ko"><meta charset="utf-8"><title>시민 소통</title><style>[role=comment]{padding:16px;border-bottom:1px solid #ccc}p{margin:8px}</style><main>'+fragments.join('\n')+'</main></html>';
  pages.push(html);fs.writeFileSync(out+'/html/'+i+'.html',html);
 }
 const server=http.createServer((req,res)=>{const m=/^\/(\d+)$/.exec(req.url);if(!m||!pages[+m[1]]){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(pages[+m[1]]);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let collector;const rows=[],issues=[];
 try{collector=await createCollector({channel:'msedge'});for(let i=0;i<pages.length;i++){
  const snap=await collector.collect(`http://127.0.0.1:${server.address().port}/${i}`,{maxPages:1,followLinks:false,maxNodes:20000,allowLongText:true,signal:AbortSignal.timeout(30000)});
  fs.writeFileSync(out+'/snapshots/'+i+'.json',JSON.stringify(snap));
  for(const m of meta.filter(m=>m.group_id===seeds[i].family)){
   const candidates=snap.candidates.filter(c=>c.selector.endsWith('#'+m.id));assert.equal(candidates.length,1,m.id);const c=candidates[0],e=contract().initialEvidence(c),input={target:e.normalized_text,context:context(c,e)};
   assert.equal(c.raw_text,m.target_expected,m.id);assert((input.target+'\n'+input.context).includes(m.owned_context),m.id+' missing owned evidence');
   const other=m.label?seeds[i].safe:seeds[i].risky;if((input.target+'\n'+input.context).includes(other))issues.push({id:m.id,reason:'opposite_context_leaked'});
   rows.push({...m,input,raw_text:c.raw_text,evidence:{selector:c.selector,location:c.location,own_style:c.own_style,ancestors:c.ancestors,context_evidence:c.context_evidence},snapshot:i+'.json'});
  }
  if(i%10===0)console.log(JSON.stringify({pages:i+1,rows:rows.length}));
 }}finally{if(collector)await collector.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 fs.writeFileSync(out+'/collection-audit.json',JSON.stringify({pages:pages.length,rows:rows.length,issues},null,2));assert.equal(issues.length,0);
 for(const split of ['train','validation','final'])fs.writeFileSync(out+'/'+split+'-records.json',JSON.stringify(rows.filter(r=>r.split===split),null,2));
 fs.writeFileSync(out+'/provenance.json',JSON.stringify({synthetic:true,real_posts_quoted:false,human_reviewed:false,source_seed_sha256:sha(fs.readFileSync(root+'/seeds.tsv')),collector_sha256:sha(fs.readFileSync('agent/src/core/collect.cjs')),model_input:['input.target','input.context'],labels:{0:'EXCLUDE',1:'HCX'},independent_real_holdout:false},null,2));
 console.log(JSON.stringify({complete:true,rows:rows.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
