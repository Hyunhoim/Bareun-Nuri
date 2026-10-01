const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),vm=require('node:vm');
const assert=require('node:assert/strict'),{createRequire}=require('node:module');
const {collect}=require('../src/core/collect.cjs'),{run}=require('./progressive.cjs'),{createSession}=require('../src/core/llm.cjs');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'agent/src/core/collect.cjs');
const frozen=path.join(root,'.runtime/progressive-baseline/collect.cjs');
const baseline=fs.existsSync(frozen)?vm.runInNewContext(fs.readFileSync(frozen,'utf8')+'\nmodule.exports.collect;',
 {require:createRequire(source),module:{exports:{}},performance,URL}):collect;
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type','text/html; charset=utf-8');
 const long=req.url==='/fixture/long';
 res.end('<!doctype html><html><head><title>Structure</title></head><body><main><h1>시민 의견</h1><p>시민 누구나 글을 작성할 수 있습니다.</p>'+
 (long?'<p id="long">'+'긴 본문 확인 문장입니다. '.repeat(900)+'</p>':Array.from({length:12},(_,i)=>'<p id="p'+i+'">도서관 운영 안내 '+i+'</p>').join(''))+
 (req.url==='/fixture/'?'<table><tbody><tr><td><a href="/fixture/next">다음 게시글</a></td></tr></tbody></table>':'')+'</main></body></html>');
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const entry='http://127.0.0.1:'+server.address().port+'/fixture/';
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'progressive-browser-'));
 try{
  const original=await baseline(entry,{maxPages:2,maxNodes:100});
  const state=await run({dir:tmp,entry,scope:'/fixture/',mode:'fifo',limits:{pages:2,calls:10,seconds:120},identity:{provider:'mock'},
   readPage:(url,signal)=>collect(url,{scope:'/fixture/',followLinks:false,recordNavigation:true,maxPages:1,maxNodes:100,signal}),
   createJudge:o=>createSession({provider:'mock',maxCalls:o.maxCalls,maxTokens:3072},{signal:o.signal})});
  assert.equal(state.status,'completed');assert.deepEqual(state.candidates,JSON.parse(JSON.stringify(original.candidates)));
  assert.equal(state.pages.length,2);assert(state.pages[0].navigation.links.some(l=>l.content_scope));
  await assert.rejects(()=>collect(entry+'long',{followLinks:false,maxPages:1,maxNodes:100}),/12000/);
  const allowed=await collect(entry+'long',{followLinks:false,allowLongText:true,maxPages:1,maxNodes:100});assert(allowed.candidates.some(c=>c.raw_text.length>12000));
  console.log('PASS: real-browser original collector candidate equivalence, navigation sidecar, default long-text rejection and opt-in long-text capture');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));assert.equal(path.dirname(tmp),os.tmpdir());assert(path.basename(tmp).startsWith('progressive-browser-'));fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
