const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{collect,canonical}=require('../src/core/collect.cjs');
const {hash,save,snapshotDOM}=require('./real-replica.cjs');
const {localize,selectLabels,serve,listening,inject}=require('./real-replica-eval.cjs');
async function test(){
 assert.equal(localize('https://source.invalid/a?id=2&kind=B#part','http://127.0.0.1:19190'),'http://127.0.0.1:19190/a?id=2&kind=B#part');
 assert.equal(localize('http://127.0.0.1:19190/a?id=2#part','https://source.invalid'),'https://source.invalid/a?id=2#part');
 assert.equal(localize('http://127.0.0.1:19190//a?id=2','https://source.invalid:8443'),'https://source.invalid:8443//a?id=2');
 const pages={},entries=[{id:'fixture',url:'https://source.invalid/'}];
 for(let i=0;i<40;i++){const url=i?'https://source.invalid/board?id='+i:entries[0].url;pages[url]={status:200,packet:{profile:{links:i?[]:Array.from({length:39},(_,j)=>({url:'https://source.invalid/board?id='+(j+1)}))}}};}
 const a=selectLabels(pages,entries,401),b=selectLabels(pages,entries,809);assert.equal(a.filter(l=>l.is_ad).length,24);assert.equal(b.filter(l=>l.is_ad).length,24);assert.deepEqual(a,selectLabels(pages,entries,401));assert.notDeepEqual(a.filter(l=>l.is_ad).map(l=>l.url),b.filter(l=>l.is_ad).map(l=>l.url));
 const root='.runtime/replica-unit-'+Date.now(),url=entries[0].url,id=hash(url).slice(0,24),capture={entries:[{...entries[0],institution:'fixture'}],pages:{[url]:{status:200,id}}};
 fs.mkdirSync(path.join(root,'dom'),{recursive:true});fs.writeFileSync(path.join(root,'dom',id+'.html'),'<!doctype html><html><head><meta charset="utf-8"><title>검증</title></head><body><main><h1>실제 구조 보존</h1><a href="https://source.invalid/a?id=2#part">자료</a><form action="https://example.invalid"><input value="secret"></form><iframe src="https://example.invalid"></iframe><p onclick="alert(1)">원문</p></main></body></html>');
 const server=serve(root,capture,'fixture',19190);await listening(server);const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage();
 try{await page.goto('http://127.0.0.1:19190');const snap=await page.evaluate(snapshotDOM);assert(!snap.html.includes('onclick='));assert(!snap.html.includes('value="secret"'));assert(!snap.html.includes('src="https://example.invalid"'));
  const labels=['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'].map((technique,i)=>({selector:'#check'+i,surface:i===1?'comment':'body',technique,text:technique==='JAMO'?'사설 카지노 가입 안내'.normalize('NFD'):technique==='HOMOGLYPH'?'CASINО 신규 가입 안내':'투명 또는 화면 밖 광고 테스트 문장'}));
  for(const slot of labels)await page.evaluate(inject,slot);fs.writeFileSync(path.join(root,'dom',id+'.html'),await page.content());
  const result=await collect('http://127.0.0.1:19190',{browser,maxPages:1,maxNodes:1000,followLinks:false});
  for(const l of labels){const c=result.candidates.find(c=>c.selector.endsWith(l.selector));assert(c,'Missing '+l.selector);assert.equal(c.raw_text,l.text);assert(c.signals.includes(l.technique),'Missing signal '+l.technique);}
  assert.equal((await page.request.get('http://127.0.0.1:19190/private/labels.json')).status(),410);
  assert.equal((await page.request.post('http://127.0.0.1:19190/')).status(),405);
  const validation={pass:true,locations:4,signals:4,labels_without_policy_input:true,query_fragment_preserved:true,private_path_blocked:true,api_calls:0};save(root,'result.json',validation);console.log(JSON.stringify({root,...validation}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
if(require.main===module)test().catch(e=>{console.error(e);process.exitCode=1});module.exports={test};
