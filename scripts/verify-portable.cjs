const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {parseEnv}=require('node:util');const {setTimeout:delay}=require('node:timers/promises');
const root=path.resolve(process.env.PORTABLE_ROOT||'Bareun-Nuri 제출/01_실행'),out=path.resolve('.runtime/portable-luna-verification-v1');
fs.mkdirSync(out,{recursive:true});
// Explicit --live authorizes at most six real Luna requests; otherwise only mock flow runs.
(async()=>{
 const live=process.argv.includes('--live');let base;
 for(let i=0;i<120;i++){try{base=JSON.parse(fs.readFileSync(path.join(root,'state/launcher.json'))).url;if((await fetch(base+'/api/health')).ok)break;}catch{}await delay(500);}
 assert(base,'Launch the packaged EXE first');
 const call=async(p,body)=>{const r=await fetch(base+'/api'+p,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Local-Client':'public-ad-ui'},body:body===undefined?undefined:JSON.stringify(body)});assert(r.ok,p+': '+r.status);return r.json();};
 assert.equal((await call('/settings/luna-key')).configured,false,'Submission must start without a key');
 process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'runtime/chromium');
 const {chromium}=require(path.join(root,'app/agent/node_modules/playwright'));
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><head><title>시민 게시판</title></head><body><article><h1>이용 안내</h1><p>도서관은 오전 9시에 문을 엽니다.</p><p style="opacity:0">온라인 카지노 신규 가입하세요. 첫 입금 보너스를 드립니다.</p><p style="position:absolute;left:-2000px">불법 토토 사이트 회원 모집, 지금 가입하고 배팅하세요.</p></article></body></html>');});
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
 let job;
 try {
  await page.goto(base);await page.locator('#scan-url').waitFor();
  await page.locator('aside').getByRole('button',{name:'API 키 관리',exact:true}).click();
  await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  if(live){const key=parseEnv(fs.readFileSync('agent/.env','utf8')).OPENAI_API_KEY;assert(key);await call('/settings/luna-key',{key});}
  const start=Date.now();job=await call('/jobs',{url:'http://127.0.0.1:'+fixture.address().port+'/',provider:live?'luna':'mock',maxPages:200,maxNodes:0,maxCalls:600,timeoutSeconds:1500});
  for(let i=0;i<240;i++){job=await call('/jobs/'+job.id);if(['completed','completed_with_warnings','partial','failed','cancelled','interrupted'].includes(job.status))break;await delay(1000);}
  assert.notEqual(job.status,'failed',job.error);assert(job.result,'No saved result');assert(job.processed>0);assert(job.calls>0&&job.calls<=6);
  if(live){assert(job.result.findings.length>0,'No evidence from live judgment');
    const dir=path.join(root,'state/jobs',job.id,'artifacts');
    const files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.json'))files.push(p);}};walk(dir);
    assert(files.some(p=>{const s=fs.readFileSync(p,'utf8');return s.includes('"antispoof"')&&s.includes('"predictions"')&&!s.includes('antispoof_start_failed');}),'No AntiSpoof execution evidence');
  }
  await page.reload();await page.locator('#scan-url').waitFor();await page.screenshot({path:path.join(out,live?'live.png':'mock.png'),fullPage:true});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,live?'live-result.json':'mock-result.json'),JSON.stringify({passed:true,elapsedSeconds:(Date.now()-start)/1000,jobId:job.id,status:job.status,pages:job.pages,candidates:job.candidates,processed:job.processed,calls:job.calls,findings:job.result.findings,errors},null,2));
  console.log(JSON.stringify({passed:true,live,status:job.status,processed:job.processed,calls:job.calls,findings:job.result.findings.length}));
 } finally {if(live){for(let i=0;i<30;i++){try{await call('/settings/luna-key/delete',{});break;}catch{await delay(500);}}}await browser.close();fixture.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
