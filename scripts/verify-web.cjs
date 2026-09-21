// Starts an isolated backend + fixture. --live adds one small HCX UI run.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const {chromium}=require('../agent/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.runtime','verification-'+Date.now());
fs.mkdirSync(out,{recursive:true});
const java=path.join(root,'.tools/jdk',fs.readdirSync(path.join(root,'.tools/jdk')).find(n=>n.startsWith('jdk-')),'bin/java.exe');
const app='http://127.0.0.1:18766';
const requestHeaders={'Content-Type':'application/json','X-Local-Client':'public-ad-ui'};
const ad='ㅅㅏㅅㅓㄹ ㄱㅕㅇㅁㅏ ㅎㅚㅇㅝㄴ ㅁㅗㅈㅣㅂ, ㅊㅜㅇㅈㅓㄴㅎㅏㅅㅔㅇㅛ.';
const fixture=http.createServer((req,res)=>{
  if(!['/check/','/check/comment','/slow/'].includes(req.url)){res.writeHead(404);res.end();return;}
  const body=req.url==='/check/comment'?'<main><p id="normal">시민 문화강좌 신청은 다음 주까지입니다.</p></main>':
    `<main><h1>시민 게시판</h1><p id="notice">불법 도박 광고를 발견하면 신고해 주세요.</p><p id="ad">${ad}</p><a href="/check/comment">댓글 보기</a></main>`;
  const send=()=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="ko"><head><title>연결 검사</title></head><body>'+body+'</body></html>');};
  if(req.url==='/slow/')setTimeout(send,2000);else send();
});
let backend,browser,context,page;
const checks=[],jobs=[];
async function waitFor(fn,timeout=30000){const until=Date.now()+timeout;while(Date.now()<until){const v=await fn();if(v)return v;await delay(200);}throw Error('Verification timed out');}
async function call(url,body,headers={}){const r=await fetch(app+url,{method:body===undefined?'GET':'POST',headers:{...requestHeaders,...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
async function launch(){
  const log=fs.openSync(path.join(out,'backend.log'),'a');
  backend=spawn(java,['-Dfile.encoding=UTF-8','-jar',path.join(root,'backend/target/public-ad-backend.jar'),'--server.port=18766'],
    {cwd:root,env:{...process.env,APP_ROOT:root,NODE_EXECUTABLE:process.execPath},stdio:['ignore',log,log],windowsHide:true});
  fs.closeSync(log);
  await waitFor(async()=>{try{return (await call('/api/health')).data.app==='public-ad-baseline';}catch{return false;}},60000);
}
async function stop(){if(backend&&!backend.killed){backend.kill();await new Promise(resolve=>backend.once('exit',resolve));}}
async function completed(id){return waitFor(async()=>{const r=await call('/api/jobs/'+id);return ['completed','completed_with_warnings','failed','cancelled'].includes(r.data.status)?r.data:false;},180000);}
async function main(){
  try{await fetch(app+'/api/health');throw Error('Test port 18766 already in use');}catch(e){if(e.message.includes('already'))throw e;}
  await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
  const target=`http://127.0.0.1:${fixture.address().port}/check/`;
  const body={url:target,provider:'mock',maxPages:40,maxNodes:1000,maxCalls:6,timeoutSeconds:120};
  try{
    await launch();checks.push('Spring Boot starts and serves health');
    assert.equal((await call('/api/jobs',{...body,url:'file:///C:/secret'})).status,400);
    assert.equal((await call('/api/jobs',{...body,maxPages:201})).status,400);
    assert.equal((await call('/api/jobs',body,{Origin:'https://outside.invalid'})).status,403);
    assert.equal((await call('/api/jobs',body,{'X-Local-Client':''})).status,403);
    checks.push('Invalid URL/limits and cross-origin mutation rejected');
    browser=await chromium.launch({channel:'msedge',headless:true});context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(app);await page.getByText('● 백엔드 연결됨').waitFor();
    await page.getByLabel('시작 URL').fill(target);
    const started=page.waitForResponse(r=>r.url()===app+'/api/jobs'&&r.request().method()==='POST');
    await page.getByRole('button',{name:'검사 시작',exact:true}).click();const mock=await(await started).json();jobs.push(mock.id);
    const mockDone=await completed(mock.id);assert(mockDone.status.startsWith('completed'));assert.equal(mockDone.pages,2);assert.equal(mockDone.calls,1);
    await page.getByRole('link',{name:'result.json 내려받기'}).waitFor();
    const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'result.json 내려받기'}).click();
    const download=await downloadPromise;await download.saveAs(path.join(out,'mock-result.json'));
    assert(JSON.parse(fs.readFileSync(path.join(out,'mock-result.json'))).meta.tool_version.includes('MOCK'));
    await page.screenshot({path:path.join(out,'desktop-mock.png'),fullPage:true});
    checks.push('React → Spring Boot → Node → progress → result download (mock)');
    await delay(300);
    const cancelJob=await call('/api/jobs',{...body,url:target.replace('/check/','/slow/')});assert.equal(cancelJob.status,202);jobs.push(cancelJob.data.id);
    assert.equal((await call('/api/jobs',body)).status,409);
    assert.equal((await call(`/api/jobs/${cancelJob.data.id}/cancel`,{})).status,200);
    assert.equal((await completed(cancelJob.data.id)).status,'cancelled');
    assert.equal((await call(`/api/jobs/${cancelJob.data.id}/result`)).status,409);
    checks.push('Concurrent scan rejected; cancellation ends job without a false result');
    await delay(300);
    const limited=await call('/api/jobs',{...body,maxPages:1});assert.equal(limited.status,202);jobs.push(limited.data.id);
    const limitDone=await completed(limited.data.id);assert.equal(limitDone.status,'failed');assert.match(limitDone.error,/Page limit/);assert.equal(limitDone.calls,0);
    assert.equal((await call(`/api/jobs/${limited.data.id}/result`)).status,409);
    checks.push('Collection limit failure is visible and does not produce result.json');
    let live;
    if(process.argv.includes('--live')){
      await delay(300);await page.reload();await page.getByText('● 백엔드 연결됨').waitFor();
      await page.getByLabel('시작 URL').fill(target);await page.getByLabel('판정 모드').selectOption('hcx');
      const pending=page.waitForResponse(r=>r.url()===app+'/api/jobs'&&r.request().method()==='POST');
      await page.getByRole('button',{name:'검사 시작',exact:true}).click();const accepted=await(await pending).json();jobs.push(accepted.id);
      live=await completed(accepted.id);assert(live.status.startsWith('completed'),live.error);assert(live.calls>0&&live.calls<=2);
      assert(live.result.findings.some(f=>f.technique==='JAMO'&&f.evidence_text===ad));
      await page.getByRole('link',{name:'result.json 내려받기'}).waitFor();
      await page.screenshot({path:path.join(out,'desktop-hcx.png'),fullPage:true});
      checks.push('Actual HCX-007 from web: one small batch, original JAMO evidence preserved');
    }
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
    checks.push('Desktop/mobile rendering and no browser script errors');
    await stop();await launch();assert((await call('/api/jobs')).data.some(j=>j.id===mock.id));
    assert.equal((await call(`/api/jobs/${mock.id}/result`)).status,200);
    checks.push('Completed history and result survive backend restart');
    const report={verifiedAt:new Date().toISOString(),checks,jobs,liveApiCalled:Boolean(live),
      live:live?{id:live.id,status:live.status,pages:live.pages,candidates:live.candidates,calls:live.calls,tokens:live.totalTokens,elapsedSec:live.elapsedSec,findings:live.result.findings.length}:null};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,output:out},null,2));
  }finally{await browser?.close();await stop();fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
