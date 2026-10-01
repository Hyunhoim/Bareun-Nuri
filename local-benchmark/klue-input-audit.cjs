const fs=require('node:fs'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {createCollector}=require('../agent/src/core/collect.cjs'),{contract}=require('../agent/src/core/judgment.cjs');
const {context:old}=require('./klue-context.cjs'),{context:fixed}=require('./klue-scoped-context.cjs');
const root='.runtime/klue-input-audit-v2',read=p=>JSON.parse(fs.readFileSync(p)),save=(n,v)=>fs.writeFileSync(root+'/'+n+'.json',JSON.stringify(v,null,2));
async function main(){
 assert(!fs.existsSync(root));fs.mkdirSync(root);const source='.runtime/klue-contest-v1',gold=read('test-set-contest-v1/data/private/gold.json'),cov=new Map(read(source+'/coverage.json').map(r=>[r.id,r])),input=new Map(read(source+'/inputs.json').map(r=>[r.id,r]));
 const nodes=new Map();for(const f of fs.readdirSync(source+'/snapshots'))for(const c of read(source+'/snapshots/'+f).candidates)nodes.set(c.node_id,c);
 const rows=[],audit=[];for(const g of gold){const c=nodes.get(cov.get(g.id).node_id),e=contract().initialEvidence(c),before=old(c,e),after=fixed(c,e);assert.equal(c.raw_text,g.raw_text);assert.deepEqual(input.get(g.id).input,{target:e.normalized_text,context:before});
  rows.push({id:g.id,input:{target:e.normalized_text,context:after}});audit.push({id:g.id,changed:before!==after,context_before:before,context_after:after,scope:c.context_evidence.scope,truncated:c.context_evidence.truncated,target_quoted:c.context_evidence.target_quoted,raw_preserved:true,object_corruption:before.includes('[object Object]')});}
 save('corrected-inputs',rows);save('input-audit',audit);
 // New mechanical boundary probes; sentinels test provenance, not advertising classifications.
 const snippets=[],own='해당 작성자의 설명 OWN_SCOPE_SENTINEL',foreign='별개 게시자의 설명 OTHER_SCOPE_SENTINEL',target='선택한 글의 내용 TARGET_SENTINEL';
 for(const tag of ['p','div','li','article']){
  snippets.push({name:tag+'-separate-comment',expectOwn:false,html:`<main><${tag} role="comment" id="target">${target}</${tag}><${tag} role="comment">${foreign}</${tag}></main>`});
  // v1 incorrectly treated sibling article/li elements as one scope. Use an explicit shared comment owner.
  snippets.push({name:tag+'-own-comment',expectOwn:true,html:`<main><${tag} role="comment"><p>${own}</p><p id="target">${target}</p></${tag}><${tag} role="comment">${foreign}</${tag}></main>`});
 }
 const server=http.createServer((req,res)=>{const i=Number(req.url.slice(1));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html><head><title>문맥 검사</title></head><body>'+snippets[i].html+'</body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));let collector;const probes=[];
 try{collector=await createCollector({channel:'msedge'});for(let i=0;i<snippets.length;i++){const snap=await collector.collect('http://127.0.0.1:'+server.address().port+'/'+i,{maxPages:1,followLinks:false,maxNodes:1000}),c=snap.candidates.find(c=>c.selector.endsWith('#target'));assert(c,snippets[i].name);const e=contract().initialEvidence(c),a=old(c,e),b=fixed(c,e);const row={name:snippets[i].name,expectOwn:snippets[i].expectOwn,old:a,fixed:b,oldForeign:a.includes('OTHER_SCOPE_SENTINEL'),fixedForeign:b.includes('OTHER_SCOPE_SENTINEL'),fixedOwn:b.includes('OWN_SCOPE_SENTINEL'),candidate:c};probes.push(row);}
 }finally{if(collector)await collector.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 save('boundary-probes',probes);
 const summary={targets:audit.length,raw_preserved:audit.filter(r=>r.raw_preserved).length,object_corruption:audit.filter(r=>r.object_corruption).length,truncated:audit.filter(r=>r.truncated).length,quoted_targets:audit.filter(r=>r.target_quoted).length,changed_context:audit.filter(r=>r.changed).length,probes:probes.length,old_foreign_leaks:probes.filter(r=>r.oldForeign).length,fixed_foreign_leaks:probes.filter(r=>r.fixedForeign).length,own_preserved:probes.filter(r=>r.expectOwn&&r.fixedOwn).length,own_expected:probes.filter(r=>r.expectOwn).length};save('summary',summary);console.log(JSON.stringify(summary));
 assert.equal(summary.fixed_foreign_leaks,0);assert.equal(summary.own_preserved,summary.own_expected);
 save('hashes',Object.fromEntries(['corrected-inputs','input-audit','boundary-probes','summary'].map(n=>[n+'.json',crypto.createHash('sha256').update(fs.readFileSync(root+'/'+n+'.json')).digest('hex')])));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
