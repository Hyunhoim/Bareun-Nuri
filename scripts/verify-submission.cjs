// Offline submission check: never reads a real key or calls a model API.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process'),http=require('node:http');
const {setTimeout:delay}=require('node:timers/promises'),{parseEnv}=require('node:util');
const source=path.resolve(__dirname,'..'),args=process.argv.slice(2);
const option=args.indexOf('--run');
assert(option<0||args[option+1],'--run requires a directory');
const run=path.resolve(option>=0?args[option+1]:fs.existsSync(path.join(source,'../01_실행'))?path.join(source,'../01_실행'):path.join(source,'Bareun-Nuri 제출/01_실행'));
const checkSource=args.includes('--source'),app=checkSource?source:path.join(run,'app');
const exists=p=>assert(fs.existsSync(p),'Missing: '+p);
const sha=p=>require('node:crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function syntax(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())syntax(p);else if(p.endsWith('.cjs'))execFileSync(process.execPath,['--check',p],{stdio:'pipe',windowsHide:true});}}
function outputContract(){
 const {outputResult}=require(path.join(app,'agent/src/core/output.cjs'));
 const raw='ㅋㅏㅈㅣㄴㅗ 원문';
 const node={node_id:'n1',url:'https://example.go.kr/board/1',location:'p:nth-of-type(1)',raw_text:raw};
 const snapshot={entry_url:'https://example.go.kr/',candidates:[node]};
 const decision={node_id:'n1',is_violation:true,needs_review:false,reason:'계약 검증',techniques:['JAMO','HOMOGLYPH']};
 const result=outputResult(snapshot,[decision],new Date().toISOString(),1,'luna').result;
 assert.deepEqual(Object.keys(result),['meta','findings']);assert.equal(result.meta.topic,'TOPIC');
 assert.equal(result.findings.length,2);assert.equal(new Set(result.findings.map(x=>x.id)).size,2);
 for(const f of result.findings){assert.deepEqual(Object.keys(f),['id','url','is_violation','location','evidence_text','technique']);assert.equal(f.evidence_text,raw);assert.equal(f.is_violation,true);}
 assert.equal(outputResult(snapshot,[{...decision,is_violation:false,techniques:[]}],new Date().toISOString(),1,'luna').result.findings.length,0);
 const bytes=Buffer.from(JSON.stringify(result),'utf8');assert.notEqual(bytes.subarray(0,3).toString('hex'),'efbbbf');
}
async function smoke(out){
 for(const file of ['바른누리_실행기.exe','runtime/node/node.exe','runtime/java/bin/java.exe','runtime/python/python.exe','app/backend/public-ad-backend.jar','app/backend/scripts/env-key.cjs','config/.env'])exists(path.join(run,file));
 const env=parseEnv(fs.readFileSync(path.join(run,'config/.env'),'utf8'));
 assert(!env.OPENAI_API_KEY&&!env.CLOVASTUDIO_API_KEY,'Submission key must be empty');
 const assets=path.join(app,'agent/models/kcelectra-antispoof-v1'),manifest=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json')));
 assert.equal(manifest.device,'cpu');for(const [f,h] of Object.entries(manifest.files))assert.equal(sha(path.join(assets,f)),h,'Model hash: '+f);
 const python=path.join(run,'runtime/python/python.exe');
 const reply=execFileSync(python,['-X','utf8',path.join(app,'agent/antispoof/infer.py'),assets],{input:JSON.stringify({id:7,rows:[{id:'r1',token:'ㅋㅏㅈㅣㄴㅗ',input:{target:'[표기]ㅋㅏㅈㅣㄴㅗ[/표기]',context:'온라인 카지노 가입 안내'}}]})+'\n',windowsHide:true,timeout:90000,env:{...process.env,PYTHONNOUSERSITE:'1',PYTHONHOME:'',PYTHONPATH:'',HF_HUB_OFFLINE:'1'}});
 const inference=JSON.parse(reply);assert.equal(inference.id,7);assert.equal(inference.rows.length,1);assert.equal(inference.rows[0].labels.length,2);
 process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(run,'runtime/chromium');
 const {chromium}=require(path.join(app,'agent/node_modules/playwright'));
 const fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><title>오프라인 검증</title><article><p id="raw" style="opacity:0">ㅋㅏㅈㅣㄴㅗ 가입 안내</p><p>도서관 이용 안내</p></article>');});
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
 let browser,collector,server;
 const log=fs.openSync(path.join(out,'backend.log'),'a');
 try{
  collector=await require(path.join(app,'agent/src/core/collect.cjs')).createCollector({channel:'chromium'});
  const snapshot=await collector.collect('http://127.0.0.1:'+fixture.address().port+'/',{followLinks:false,maxPages:1,maxNodes:100,observeTechniques:true,allowLongText:true,allowEmpty:true});
  assert(snapshot.candidates.some(c=>c.raw_text.includes('ㅋㅏㅈㅣㄴㅗ')),'Collected original text');await collector.close();collector=null;
  const keyFile=path.join(out,'empty.env');fs.writeFileSync(keyFile,'OPENAI_API_KEY=\n');
  server=spawn(path.join(run,'runtime/java/bin/java.exe'),['-Dfile.encoding=UTF-8','-jar',path.join(app,'backend/public-ad-backend.jar'),'--server.port=0','--app.development-settings=false'],{cwd:app,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,APP_ROOT:app,APP_STORAGE:path.join(out,'jobs'),APP_ENV_FILE:keyFile,NODE_EXECUTABLE:path.join(run,'runtime/node/node.exe'),ANTISPOOF_PYTHON:python,PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH,BROWSER_CHANNEL:'chromium',OPENAI_API_KEY:'',CLOVASTUDIO_API_KEY:''}});
  let base;for(let n=0;n<120;n++){const text=fs.readFileSync(path.join(out,'backend.log'),'utf8'),match=text.match(/Tomcat started on port (\d+)/);if(match){base='http://127.0.0.1:'+match[1];break;}assert(server.exitCode===null,'Backend failed');await delay(500);}assert(base,'Backend startup timeout');
  const call=async(p,body)=>{const response=await fetch(base+'/api'+p,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Local-Client':'public-ad-ui'},body:body===undefined?undefined:JSON.stringify(body)});assert(response.ok,p+': '+response.status);return response.json();};
  assert.equal((await call('/health')).status,'ok');assert.equal((await call('/settings/luna-key')).configured,false);
  browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#scan-url').waitFor();await page.locator('aside').getByRole('button',{name:'API 키 관리',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  const job=await call('/jobs',{url:'http://127.0.0.1:'+fixture.address().port+'/',provider:'luna',maxPages:200,maxNodes:0,maxCalls:600,timeoutSeconds:1500});
  let failed;for(let n=0;n<100;n++){const value=await call('/jobs/'+job.id);if(value.status==='failed'){failed=value;break;}await delay(200);}assert(failed,'Missing-key failure not reported');assert.match(failed.error,/OPENAI_API_KEY/);assert.equal(failed.calls,0);
  await page.reload();await page.getByRole('button',{name:'다시 검사하기',exact:true}).waitFor();await page.screenshot({path:path.join(out,'missing-key.png'),fullPage:true});assert.deepEqual(errors,[]);
  return {modelFiles:Object.keys(manifest.files).length,cpuLabels:inference.rows[0].labels,collected:snapshot.candidates.length,backend:true,ui:true,missingKey:true,paidApiCalls:0};
 }finally{await collector?.close();await browser?.close();fixture.close();if(server){server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));}fs.closeSync(log);}
}
(async()=>{
 exists(path.join(app,'agent/src/worker.cjs'));syntax(path.join(app,'agent/src'));syntax(path.join(app,'backend/scripts'));outputContract();
 let report={passed:true,source:checkSource,syntax:true,jsonContract:true,paidApiCalls:0};
 if(args.includes('--smoke')){assert(!checkSource,'Use --smoke separately');const out=path.join(source,'.runtime','submission-check-'+Date.now());fs.mkdirSync(out,{recursive:true});report={...report,...await smoke(out),output:out};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
