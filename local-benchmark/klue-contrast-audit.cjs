const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-scoped-context.cjs');
const root='.runtime/klue-contrast-v1',source='local-benchmark/klue-contrast-data.json',groups=JSON.parse(fs.readFileSync(source));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function main(){
 assert(!fs.existsSync(root),'Use a new version; never overwrite an audited dataset');fs.mkdirSync(root,{recursive:true});
 assert.equal(new Set(groups.map(g=>g.group)).size,groups.length);assert.equal(new Set(groups.map(g=>g.target)).size,groups.length);
 const cases=[];
 for(const g of groups)for(const variant of ['ad','victim','quote','legitimate','missing','foreign_ad','foreign_victim'])for(let layout=0;layout<2;layout++){
  const id='n'+sha(g.group+'|'+variant+'|'+layout).slice(0,14),owned=g[variant]||'',foreign=variant==='foreign_ad'?g.ad:variant==='foreign_victim'?g.victim:'',label={ad:0,victim:2,quote:1,legitimate:2}[variant]??3;
  const target='<p id="'+id+'">'+esc(g.target)+'</p>',ctx=owned?'<p>'+esc(owned)+'</p>':'',body=layout?'<div role="comment">'+target+ctx+'</div>':'<article>'+ctx+target+'</article>',sibling=foreign?'<article><p>'+esc(foreign)+'</p></article>':'';
  cases.push({id,group:g.group,split:g.split,variant,layout,label,target:g.target,owned,foreign,html:'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>시민 참여 게시판</title></head><body><main>'+body+sibling+'</main></body></html>'});
 }
 const server=http.createServer((req,res)=>{const c=cases[Number(req.url.slice(1))];res.writeHead(c?200:404,{'Content-Type':'text/html; charset=utf-8'});res.end(c?.html||'');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let collector;const rows=[],evidence=[],checks=[];
 try{collector=await createCollector({channel:'msedge'});for(let i=0;i<cases.length;i++){
  const c=cases[i],snap=await collector.collect('http://127.0.0.1:'+server.address().port+'/'+i,{followLinks:false,maxPages:1,maxNodes:1000}),node=snap.candidates.find(n=>n.selector==='p#'+c.id);assert(node,c.id);assert.equal(node.raw_text,c.target);
  const e=contract().initialEvidence(node),input={target:e.normalized_text,context:context(node,e)};
  assert(!c.owned||input.context.includes(c.owned),'Owned context lost: '+c.id);assert(!c.foreign||!input.context.includes(c.foreign),'Foreign context leaked: '+c.id);
  rows.push({id:c.id,group:c.group,split:c.split,label:c.label,input});evidence.push(node);checks.push({id:c.id,variant:c.variant,layout:c.layout,owned_preserved:!c.owned||input.context.includes(c.owned),foreign_excluded:!c.foreign||!input.context.includes(c.foreign)});
  if(i%28===0)console.log('collected '+i+'/'+cases.length);
 }}finally{if(collector)await collector.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 // Same text without owned context must have identical input regardless of a foreign author's words.
 for(const g of groups)for(let layout=0;layout<2;layout++){
  const get=v=>rows.find(r=>r.id===cases.find(c=>c.group===g.group&&c.layout===layout&&c.variant===v).id).input;
  assert.deepEqual(get('missing'),get('foreign_ad'));assert.deepEqual(get('missing'),get('foreign_victim'));
 }
 const prior=JSON.parse(fs.readFileSync('test-set-contest-v1/data/private/gold.json')),old=new Set(prior.map(r=>r.base_text.normalize('NFKC')));assert(groups.every(g=>!old.has(g.target.normalize('NFKC'))));
 const review=cases.map(c=>({id:c.id,group:c.group,variant:c.variant,layout:c.layout,proposed_label:c.label,review_status:'agent_reviewed_provisional',human_reviewed:false,target:c.target,owned_evidence:c.owned,excluded_foreign_context:c.foreign,decision_basis:c.label===3?'대상만으로 서비스 종류와 불법광고 여부를 확정할 수 없다. 다른 작성자 문맥은 근거가 아니다.':c.variant==='ad'?'본인 모집 행위와 대상 서비스의 성격이 같은 소유 범위에 명시됨.':c.variant==='victim'?'피해자가 전달받은 권유를 증거로 제시하며 상담·중단·신고를 요청함.':c.variant==='quote'?'교육 과제에서 권유 문구를 분석 대상으로 인용함.':'구체적인 정상 서비스와 거래 목적이 같은 소유 범위에 명시됨.'}));
 for(const [name,value]of Object.entries({rows,evidence,checks,review,cases}))fs.writeFileSync(root+'/'+name+'.json',JSON.stringify(value,null,2));
 const summary={groups:groups.length,inputs:rows.length,train_groups:groups.filter(g=>g.split==='train').length,development_groups:groups.filter(g=>g.split==='development').length,variants_per_group:7,layouts:2,independent_final:false,training_ready:false,human_reviewed:false,owned_context_checks:cases.filter(c=>c.owned).length,foreign_context_checks:cases.filter(c=>c.foreign).length,missing_foreign_equivalence_checks:groups.length*2*2,raw_preserved:rows.length,prior_exact_target_overlap:0,source_sha256:sha(fs.readFileSync(source)),hashes:Object.fromEntries(['rows','evidence','checks','review','cases'].map(n=>[n+'.json',sha(fs.readFileSync(root+'/'+n+'.json'))]))};
 fs.writeFileSync(root+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}
main().catch(e=>{console.error(e);process.exitCode=1});
