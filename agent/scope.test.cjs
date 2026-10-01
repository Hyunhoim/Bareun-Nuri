const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {collect,canonical}=require('./src/core/collect.cjs'),{run}=require('./src/core/scan.cjs');
const {createSession}=require('./src/core/llm.cjs'),{frameAccess}=require('./src/core/frame-access.cjs');
const {simulate}=require('./experiments/navigation.cjs'),{simulatePath}=require('./experiments/navigation-path.cjs');
const {choose,feedback}=require('./src/core/frontier.cjs');
const project=path.resolve(__dirname,'..'),root=path.join(project,'.runtime/scope-check-'+Date.now());fs.mkdirSync(root,{recursive:true});
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r)),origin=s=>'http://127.0.0.1:'+s.address().port;
const shell=b=>'<!doctype html><html><head><title>구조 검사</title></head><body>'+b+'</body></html>';
const frame=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(shell('<p id="external">외부 프레임의 의견</p><iframe srcdoc="<p id=nested>중첩 의견</p>"></iframe><a href="/elsewhere">외부 사이트 이동</a>'));});
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type','text/html; charset=utf-8');
 if(req.url==='/start/list/')res.end(shell('<h1>공공 안내</h1><a href="/different/view?id=1">상세</a><a href="/different/view?id=2">다음 글</a><a href="'+origin(frame)+'/outside">외부 링크</a><iframe src="'+origin(frame)+'/embed"></iframe><iframe src="/widget"></iframe>'));
 else if(req.url==='/widget')res.end(shell('<p id="same">다른 경로 프레임</p>'));
 else if(req.url==='/edge/')res.end(shell('<p>오류와 정상 페이지를 함께 확인합니다.</p><a href="/missing">찾을 수 없는 글</a><a href="/redirect">이동</a><a href="/target/">동일 글</a><iframe src="/denied"></iframe>'));
 else if(req.url==='/redirect'){res.writeHead(302,{Location:'/target/'});res.end();}
 else if(req.url==='/target/')res.end(shell('<p>이동 후 확인한 본문</p>'));
 else if(req.url==='/denied'){res.statusCode=403;res.end('Access denied');}
 else if(req.url.startsWith('/different/view'))res.end(shell('<article><p>시민을 위한 안내 본문</p></article><aside role="comment"><p id="comment">본문 밖 이용자 의견 '+req.url.slice(-1)+'</p></aside><a href="/start/list/#top">되돌아가기</a>'));
 else{res.statusCode=404;res.end('missing');}
});
async function main(){
 await listen(frame);await listen(server);const entry=origin(server)+'/start/list/';
 try{
  const s=await collect(entry,{maxPages:10,maxNodes:200,recordNavigation:true});fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify(s));
  assert.equal(s.pages.length,3);assert.equal(s.collection_issues.length,0,JSON.stringify(s.collection_issues));
  for(const id of ['external','nested','same','comment'])assert(s.candidates.some(c=>c.selector.endsWith('#'+id)),id);
  const nested=s.candidates.find(c=>c.selector==='p#nested');assert.equal(nested.url,entry);assert.equal(nested.frame_urls.length,2);assert.equal(nested.location.split(' >>> ').length,3);
  assert.equal(s.candidates.filter(c=>c.selector==='p#comment').length,2);
  assert(!s.pages.some(p=>p.url.startsWith(origin(frame))));
  const access=frameAccess(new URL('https://example.org/'));assert.equal(await access('http://127.0.0.1/a'),false);assert.equal(await access('http://169.254.169.254/'),false);assert.equal(await access('file:///tmp/a'),false);
  const reads=[];const options={entry,scope:'/',identity:{provider:'mock',revision:1},limits:{pages:1,calls:20,seconds:90},
   readPage:async(url,signal)=>{reads.push(url);return collect(url,{entryUrl:entry,scope:'/',followLinks:false,recordNavigation:true,allowEmpty:true,maxPages:1,maxNodes:200,signal});},
   createJudge:o=>createSession({provider:'mock',maxCalls:o.maxCalls},{signal:o.signal})};
  const dir=path.join(root,'resume');let state=await run({...options,dir});assert.equal(state.status,'partial');assert.equal(state.reason,'page_budget');assert(state.decisions.length>0);assert.equal(state.pending.length,2);assert.equal(state.excluded.length,2);
  const old=state.decisions.map(x=>x.node_id);state=await run({...options,dir,limits:{...options.limits,pages:10}});assert.equal(state.status,'completed');assert.equal(reads.length,3);assert.equal(new Set(state.decisions.map(x=>x.node_id)).size,state.decisions.length);assert(old.every(id=>state.decisions.some(x=>x.node_id===id)));
  const failed=await run({...options,dir:path.join(root,'failure'),entry:origin(server)+'/missing',limits:{...options.limits,pages:10}});assert.equal(failed.status,'failed');assert.equal(failed.issues.length,1);
  const calls=await run({...options,dir:path.join(root,'calls'),limits:{...options.limits,pages:10,calls:1},readPage:async(...args)=>{const p=await options.readPage(...args);p.candidates.push(...Array.from({length:20},(_,i)=>({...p.candidates[0],node_id:'extra'+i})));return p;}});assert.equal(calls.status,'partial');assert.equal(calls.reason,'call_budget');assert(calls.work.length>calls.decisions.length);
  const nodes=await run({...options,dir:path.join(root,'nodes'),limits:{...options.limits,pages:10,nodes:1}});assert.equal(nodes.status,'partial');assert.equal(nodes.reason,'candidate_budget');assert.equal(nodes.decisions.length,0);
  const timeout=await run({...options,dir:path.join(root,'time'),limits:{...options.limits,seconds:.01}});assert.equal(timeout.status,'partial');assert.match(timeout.reason,/time_budget/);
  const edge=await run({...options,entry:origin(server)+'/edge/',dir:path.join(root,'edge'),limits:{...options.limits,pages:4}});
  assert.equal(edge.status,'partial');assert.equal(edge.reason,'collection_gaps');assert.equal(edge.pages.length,2);assert.equal(edge.attempts.length,3);assert(edge.issues.some(x=>x.reason==='http_403'));
  const coverage=JSON.parse(fs.readFileSync(path.join(root,'edge/coverage.json')));assert.equal(coverage.visited.length,2);assert(!coverage.visited.some(u=>u.endsWith('/missing')));
  let sent=0;const uncertain={...options,dir:path.join(root,'uncertain'),createJudge:()=>{const calls=[];return {calls,decide:async()=>{sent++;calls.push({usage:null});throw Error('Unknown network outcome');}};}};
  let failedCall=await run(uncertain);assert(failedCall.inflight);failedCall=await run(uncertain);assert.equal(sent,1);assert.match(failedCall.reason,/automatic retry refused/);
  // Historical policy parity on observed graphs; no gold enters selection.
  let parity=0;
  for(const id of ['dev-101','confirmation-201'])for(const mode of ['fifo','bandit','bandit-path']){
   const data=JSON.parse(fs.readFileSync(path.join(project,'.runtime/navigation-live-v2',id+'-evidence.json'))),profiles=data.pages;
   const expected=await (mode==='bandit-path'?simulatePath:simulate)({entry:data.entry,scope:data.scope,mode:mode==='fifo'?'fifo':'bandit',maxRequests:50,read:async u=>profiles[u]});
   const q={pending:[{url:canonical(data.entry),group:'unknown',content_scope:false}],visited:[]};
   while(q.pending.length&&q.visited.length<50){const i=choose(q,mode),next=q.pending.splice(i,1)[0],p=profiles[next.url];q.visited.push(next.url);const links=[];
    for(const l of p.links){const url=canonical(l.url);if(!q.visited.includes(url)&&!q.pending.some(x=>x.url===url)){q.pending.push({...l,url});links.push(url);}}
    feedback(q,next,p,links);
   }assert.deepEqual(q.visited,expected.visits.map(v=>v.url));parity++;
  }
  console.log(JSON.stringify({pass:true,policy_parity:parity,checks:['cross-path','query-preservation','external/nested/srcdoc frames','comments','cycle','boundary','partial result','resume','calls','nodes','time','page failure'],root}));
 }finally{for(const s of [server,frame]){s.closeAllConnections();await new Promise(r=>s.close(r));}}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
