const http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {collect,createCollector}=require('../src/core/collect.cjs');
const {run,materialize}=require('../src/core/bounded-scan.cjs'),{createSession}=require('../src/core/llm.cjs');
const {spawn}=require('node:child_process');
const shell=body=>'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>수집 진단</title></head><body>'+body+'</body></html>';
const listen=s=>new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r);});
const base=s=>'http://127.0.0.1:'+s.address().port;
async function fixture(){
 const external=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(req.url.endsWith('.css')?'#blocked{opacity:0}':shell('<p id="external">별도 출처 프레임 의견</p><iframe srcdoc="<p id=nested>중첩 문장</p>"></iframe>'));});
 await listen(external);
 const bodies={
  '/text':'<article><h1 id="title">시민 의견 제목</h1><strong id="author">의견 작성자</strong><p id="split">문장을 <span>나누어도</span> <em>보존합니다.</em></p><p id="long">'+'긴 문장의 문맥 보존을 확인합니다. '.repeat(900)+'</p></article><aside role="comment"><p id="outside">본문 밖 댓글</p></aside><blockquote id="quote">이용을 권유하지 않는 예방 인용입니다.</blockquote>',
  '/style':'<link rel="stylesheet" href="/site.css"><div class="transparent"><span id="transparent">조상 투명도 문장</span></div><p class="offscreen" id="offscreen">음수 위치 문장</p><p id="jamo">ㅅㅏㅅㅓㄹ ㅋㅏㅈㅣㄴㅗ</p><p id="homoglyph">ＣＡＳＩＮＯ</p><img width="30" height="40" src="/image.svg"><div style="height:1800px"></div><p id="below">스크롤 아래 정상 문장</p>',
  '/dynamic':'<main aria-busy="true"><p>의견을 불러옵니다.</p></main><script>setTimeout(()=>{document.querySelector("main").innerHTML="<p id=delayed>늦게 온 댓글</p><iframe src=/frame-delayed></iframe>";document.querySelector("main").removeAttribute("aria-busy")},1400)</script>',
  '/frames':'<h1>프레임 안내</h1><iframe src="'+base(external)+'/frame"></iframe><iframe src="/frame-local"></iframe>',
  '/state-set':'<p id="write">저장 상태 설정</p><script>localStorage.setItem("marker","leaked");document.cookie="marker=leaked;path=/"</script>',
  '/state-read':'<p id="isolation"></p><script>document.querySelector("p").textContent=(localStorage.getItem("marker")||document.cookie)?"leaked":"isolated"</script>',
  '/limits':'<p id="passive">수동 상호작용을 하지 않는 페이지</p><button onclick="document.body.insertAdjacentHTML(\'beforeend\',\'<p id=click-only>클릭 댓글</p>\')">더보기</button><script>setTimeout(()=>document.body.insertAdjacentHTML("beforeend","<p id=too-late>늦은 댓글</p>"),6000)</script>',
  '/blocked':'<link rel="stylesheet" href="'+base(external)+'/external.css"><p id="blocked">외부 CSS 차단 진단</p><script>fetch("/post",{method:"POST"}).catch(()=>{})</script>',
  '/busy':'<main aria-busy="true"><p>끝나지 않은 로딩</p></main>',
  '/walk':'<h1>작업 연결 검사</h1><a href="/state-set">저장 설정</a><a href="/state-read">독립 상태 확인</a>',
  '/frame-local':'<p id="local">동일 출처 프레임</p>',
  '/frame-delayed':'<main aria-busy="true"></main><script>setTimeout(()=>{document.querySelector("main").innerHTML="<p id=frame-delayed>프레임의 지연 댓글</p>";document.querySelector("main").removeAttribute("aria-busy")},500)</script>'
 };
 const server=http.createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/text'});res.end();return;}
  if(req.url==='/site.css'){res.setHeader('Content-Type','text/css');res.end('.transparent{opacity:0}.offscreen{position:absolute;left:-9999px}');return;}
  if(req.url==='/image.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"/>');return;}
  const body=bodies[req.url];res.writeHead(body?200:404,{'Content-Type':'text/html; charset=utf-8'});res.end(body?shell(body):'missing');
 });
 await listen(server);
 return {entry:base(server)+'/text',urls:Object.keys(bodies).slice(0,8).map(p=>base(server)+p),origin:base(server),
  close:async()=>{for(const s of [server,external]){s.closeAllConnections();await new Promise(r=>s.close(r));}}};
}
const options={scope:'/',followLinks:false,recordNavigation:true,allowLongText:true,allowEmpty:true,maxPages:1,maxNodes:10000};
// Exclude only nondeterministic timing metadata; all detector/navigation evidence is compared.
function evidence(s){return JSON.parse(JSON.stringify({pages:s.pages.map(p=>({...p,readiness:{...p.readiness,wait_ms:undefined}})),
 candidates:s.candidates,technique_observations:s.technique_observations,blocked_requests:s.blocked_requests,
 collection_issues:[...s.collection_issues].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))}));}
function checkFixture(snapshots){
 const candidates=snapshots.flatMap(s=>s.candidates),ids=['title','author','split','long','outside','quote','transparent','offscreen','jamo','homoglyph','below','delayed','frame-delayed','external','nested','local','write','isolation','passive','blocked'];
 for(const id of ids)assert(candidates.some(c=>c.selector.endsWith('#'+id)),id);
 const node=id=>candidates.find(c=>c.selector.endsWith('#'+id));
 assert.equal(node('split').raw_text,'문장을 나누어도 보존합니다.');assert(node('long').raw_text.length>12000);
 assert.equal(node('isolation').raw_text,'isolated');assert.equal(node('nested').frame_urls.length,2);
 for(const [id,tech] of [['transparent','TRANSPARENT'],['offscreen','OFFSCREEN'],['jamo','JAMO'],['homoglyph','HOMOGLYPH']])assert(node(id).signals.includes(tech),id);
 assert(!node('below').signals.includes('OFFSCREEN'));assert(!node('blocked').signals.includes('TRANSPARENT'));
 assert(!candidates.some(c=>/p#(click-only|too-late)$/.test(c.selector)));
 assert(snapshots.at(-1).collection_issues.some(i=>i.reason==='request_boundary_or_method'));
 return {expected_collected:ids.length,missing:0,known_uncollected:['click-only','too-late'],blocked_external_css:true};
}
async function workerCheck(site,root){
 const worker=path.resolve(__dirname,'../src/worker.cjs'),normal=path.join(root,'worker'),recovery=path.join(root,'worker-recovery');
 fs.mkdirSync(root,{recursive:true});
 const hook=path.join(root,'crash-hook.cjs');
 // Fault injection stays in the test process preload, never in production options.
 fs.writeFileSync(hook,`const {chromium}=require(${JSON.stringify(require.resolve('playwright'))});
const launch=chromium.launch.bind(chromium);chromium.launch=async(...args)=>{const browser=await launch(...args),open=browser.newContext.bind(browser);let count=0;
browser.newContext=async(...args)=>{if(++count===2)await browser.close();return open(...args);};return browser;};`);
 function execute(dir,crash=false){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[...(crash?['--require',hook]:[]),worker],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error='';
  const timer=setTimeout(()=>{child.kill();reject(Error('worker check timed out'));},60000);
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('exit',code=>{clearTimeout(timer);try{assert.equal(error,'');const done=output.trim().split('\n').map(l=>JSON.parse(l)).find(e=>e.type==='done');assert(done,output);resolve({code,done});}catch(e){reject(e);}});
  child.stdin.write(JSON.stringify({url:site.origin+'/walk',provider:'mock',jobDir:dir,envFile:path.join(root,'absent.env'),maxPages:10,maxNodes:10000,maxCalls:10,timeoutSeconds:60})+'\n');
 });}
 const full=await execute(normal);assert.equal(full.done.status,'completed');assert.equal(full.done.pages,3);
 const events=fs.readFileSync(path.join(normal,'collection-timing.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(events.filter(e=>e.kind==='browser_launch').length,1);assert.equal(events.filter(e=>e.kind==='browser_close').length,1);
 assert.equal(events.filter(e=>e.kind==='page_collection'&&e.success).length,3);
 const crash=await execute(recovery,true);assert.equal(crash.done.status,'partial');assert.match(crash.done.reason,/Browser disconnected/);
 const interrupted=JSON.parse(fs.readFileSync(path.join(recovery,'checkpoint.json'))).state;assert.equal(interrupted.attempts.length,1);assert.equal(interrupted.pending.length,2);
 const resumed=await execute(recovery);assert.equal(resumed.done.status,'completed');assert.equal(resumed.done.pages,3);
 const a=JSON.parse(fs.readFileSync(path.join(normal,'checkpoint.json'))).state,b=JSON.parse(fs.readFileSync(path.join(recovery,'checkpoint.json'))).state;
 const complete=materialize(normal,a),restored=materialize(recovery,b);
 assert.deepEqual(complete.candidates,restored.candidates);assert.deepEqual(complete.decisions,restored.decisions);assert.equal(b.attempts.length,3);
 assert(complete.candidates.some(c=>c.raw_text==='isolated'));
 return ['worker one-process telemetry','worker context isolation','browser disconnect preserves pending','new-process resume equivalence'];
}
async function main(){
 const site=await fixture(),events=[],reader=await createCollector({onTiming:e=>events.push(e)});
 const dir=path.resolve(__dirname,'../../.runtime/collector-lifecycle-'+Date.now());
 try{
  console.log('Lifecycle: initial evidence');
  const a=await collect(site.entry,options),b=await reader.collect(site.entry,options);assert.deepEqual(evidence(a),evidence(b));
  console.log('Lifecycle: failure and cancellation');
  await assert.rejects(()=>reader.collect(site.origin+'/missing',options),/404/);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('test cancellation')),200);
  try{await assert.rejects(()=>reader.collect(site.origin+'/busy',{...options,signal:controller.signal}));assert(controller.signal.aborted);}finally{clearTimeout(timer);}
  assert.deepEqual(evidence(await reader.collect(site.entry,options)),evidence(a),'recovery after failure/cancellation');
  const already=new AbortController();already.abort(Error('already aborted'));
  await assert.rejects(()=>reader.collect(site.entry,{...options,signal:already.signal}),/already aborted/);
  const busy=await reader.collect(site.origin+'/busy',{...options,readiness:{minimumMs:100,quietMs:50,maximumMs:300}});assert.equal(busy.pages[0].readiness.settled,false);
  const redirected=await reader.collect(site.origin+'/redirect',options);assert.equal(redirected.pages[0].url,site.entry);
  console.log('Lifecycle: optional technique observations');
  const observed=await collect(site.origin+'/style',{...options,observeTechniques:true});
  assert.deepEqual(evidence(await reader.collect(site.origin+'/style',{...options,observeTechniques:true})),evidence(observed));
  assert(reader.isConnected());
  console.log('Lifecycle: checkpoint resume');
  const reads=[],makeJudge=o=>createSession({provider:'mock',maxCalls:o.maxCalls},{signal:o.signal});
  const args={dir,entry:site.entry,scope:'/',identity:{provider:'mock',revision:'collector-reuse'},limits:{pages:1,calls:100,seconds:120},
   readPage:async(url,signal)=>{reads.push(url);const s=await reader.collect(url,{...options,signal});if(url===site.entry)s.pages[0].navigation.links.push({url:site.origin+'/state-read',text:'next'});return s;},createJudge:makeJudge};
  const first=await run(args);assert.equal(first.reason,'page_budget');const decisions=structuredClone(materialize(dir,first).decisions);
  const second=await run({...args,limits:{...args.limits,pages:2}});assert.equal(second.status,'completed');assert.equal(reads.length,2);assert.deepEqual(materialize(dir,second).decisions.slice(0,decisions.length),decisions);
  assert.equal(events.filter(e=>e.kind==='browser_launch').length,1);assert(events.some(e=>e.kind==='page_collection'&&!e.success));
  assert(events.filter(e=>e.kind==='page_collection').every(e=>e.total_ms>=0));
  console.log(JSON.stringify({pass:true,checks:['evidence parity','404 recovery','cancel recovery','pre-abort','readiness timeout','redirect','checkpoint resume','one process'],dir}));
 }finally{await reader.close();await site.close();}
 assert.equal(events.filter(e=>e.kind==='browser_close').length,1);
 assert(!reader.isConnected());
 await assert.rejects(()=>reader.collect(site.entry,options),/closed/);
 console.log('Lifecycle: operational worker and injected disconnect');
 // New local server for independent operational worker runs after lifecycle tests finish.
 const operational=await fixture();try{console.log(JSON.stringify({pass:true,checks:await workerCheck(operational,dir)}));}finally{await operational.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture,evidence,checkFixture,options};
