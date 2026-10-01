const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{collect,canonical,inScope}=require('../src/core/collect.cjs');
const {inspectPage}=require('../src/core/frontier.cjs'),{inspectContext}=require('./frontier-context.cjs');
const {walk,template}=require('./frontier-balanced.cjs');
const {hash,save,read,ROOT,modes}=require('./real-replica.cjs');
const seeds=[0,11,23,37,51],placements=[401,809],budgets=[10,20];
const mean=a=>a.reduce((s,n)=>s+n,0)/a.length,stats=a=>({mean:mean(a),min:Math.min(...a),max:Math.max(...a),sd:Math.sqrt(mean(a.map(x=>(x-mean(a))**2)))});
const localize=(url,origin)=>{const u=new URL(url),base=new URL(origin);u.protocol=base.protocol;u.hostname=base.hostname;u.port=base.port;return u.href;};
function distances(pages,entry){const ds={[canonical(entry)]:0},queue=[canonical(entry)];for(let i=0;i<queue.length;i++)for(const l of pages[queue[i]]?.packet?.profile?.links||[]){
 if(!inScope(l.url,new URL(entry),'/'))continue;const u=canonical(l.url);if(ds[u]===undefined){ds[u]=ds[queue[i]]+1;queue.push(u);}}return ds;}
function selectLabels(pages,entries,seed){
 const urls=Object.keys(pages).filter(u=>pages[u].status===200),depths=entries.map(e=>distances(pages,e.url)),depth=u=>Math.min(...depths.map(d=>d[u]??Infinity));
 const rank=a=>[...a].sort((a,b)=>hash(seed+'|'+a).localeCompare(hash(seed+'|'+b))),chosen=new Map(),groups={};
 for(const u of urls)(groups[template(u)]??=[]).push(u);
 const largest=Object.entries(groups).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]))[0]?.[1]||[];
 function pick(name,pool,quota=6){for(const u of rank(pool)){if(chosen.size>=24)break;if(chosen.has(u))continue;chosen.set(u,name);if([...chosen.values()].filter(v=>v===name).length===quota)break;}}
 pick('concentrated',largest);const remaining=()=>urls.filter(u=>!chosen.has(u));
 const max=Math.max(...remaining().map(depth).filter(Number.isFinite));pick('deep',remaining().filter(u=>depth(u)>=Math.max(3,max-1)&&Number.isFinite(depth(u))));
 pick('shallow',remaining().filter(u=>depth(u)<=2));
 // One per URL template first, then remaining URLs; no policy order is consulted.
 const dispersed=[],used=new Set();for(const u of rank(remaining()))if(!used.has(template(u))){used.add(template(u));dispersed.push(u);}
 pick('dispersed',dispersed);pick('remainder',remaining(),24);
 return urls.map(u=>{const index=parseInt(hash(u).slice(0,8),16),surface=['title','body','comment'][index%3],technique=['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'][index%4];
  const is_ad=chosen.has(u),base=is_ad?'사설 카지노 신규 회원을 모집합니다. 지금 가입하고 입금하면 추가 보너스를 지급합니다. 문의는 example.invalid에서 확인하세요.':'시민 의견을 듣고 있습니다. 행사 일정과 이용 안내를 확인하고 담당 부서에 개선 의견을 제출할 수 있습니다.';
  const text=technique==='JAMO'?base.normalize('NFD'):technique==='HOMOGLYPH'?(is_ad?'CASINО ':'안내 ＮＯＴＩＣＥ ')+base:base;
  return {url:u,selector:'#r'+hash(u).slice(0,20),is_ad,surface,technique,text,scenario:chosen.get(u)||'control',depth:depth(u),depth_by_entry:Object.fromEntries(entries.map((e,i)=>[e.id,depths[i][u]??null]))};});
}
function inject(slot){
 const container=document.querySelector('main,[role="main"],#contents,#content,#container')||document.body;
 const e=document.createElement(slot.surface==='title'?'h2':'p');e.id=slot.selector.slice(1);
 e.style.cssText='display:block;position:relative;color:rgb(0,0,0);background-color:rgb(255,255,255);opacity:1;visibility:visible;font-size:16px;line-height:24px;white-space:normal;';
 if(slot.technique==='TRANSPARENT')e.style.color='rgba(0,0,0,0)';
 if(slot.technique==='OFFSCREEN'){e.style.position='absolute';e.style.left='-10000px';e.style.width='600px';}
 const chars=Array.from(slot.text),cut=Math.floor(chars.length/3);for(const text of [chars.slice(0,cut).join(''),chars.slice(cut,cut*2).join(''),chars.slice(cut*2).join('')]){const s=document.createElement('span');s.textContent=text;e.append(s);}
 if(slot.surface==='comment'){const wrapper=document.createElement('div');wrapper.setAttribute('role','comment');wrapper.append(e);container.append(wrapper);}else container.append(e);
 return {selector:slot.selector,text:e.textContent,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y},color:getComputedStyle(e).color};
}
function serve(root,capture,institution,port,folder){
 const source=new URL(capture.entries.find(e=>e.institution===institution).url).origin,origin='http://127.0.0.1:'+port;
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-src 'none'; base-uri 'none'");
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  let key;try{key=canonical(source+req.url);}catch{res.writeHead(400);res.end();return;}
  const row=capture.pages[key];if(!row){res.writeHead(410);res.end('<p>저장 범위 밖: 실제 원격 페이지의 상태는 알 수 없습니다.</p>');return;}
  if(row.status!==200){res.writeHead(502);res.end('<p>원격 수집 실패 기록</p>');return;}
  const file=path.join(root,folder||'dom',row.id+'.html');if(!fs.existsSync(file)){res.writeHead(503);res.end();return;}
  res.end(fs.readFileSync(file,'utf8').replaceAll('href="'+source+'/','href="'+origin+'/'));
 });server.listen(port,'127.0.0.1');return server;
}
async function listening(server){if(server.listening)return;await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});}
async function prepare(root=ROOT){
 assert(!fs.existsSync(path.join(root,'replica-manifest.json')),'Prepared replicas are immutable');const capture=read(path.join(root,'capture.json'));
 const browser=await chromium.launch({headless:true,channel:'msedge'}),validation=[],catalog=[];
 const policyFiles=['agent/experiments/real-replica-eval.cjs','agent/experiments/real-replica.cjs','agent/experiments/frontier-balanced.cjs','agent/experiments/frontier-context.cjs','agent/src/core/frontier.cjs','agent/src/core/collect.cjs','docs/real-replica-plan.md'];
 save(root,'prepare-source-manifest.json',Object.fromEntries(policyFiles.map(f=>[f,hash(fs.readFileSync(f,'utf8'))])));
 try{for(const [ix,institution]of ['busan','daejeon'].entries()){
  const entries=capture.entries.filter(e=>e.institution===institution),source=new URL(entries[0].url).origin,origin='http://127.0.0.1:'+(19110+ix),pages=Object.fromEntries(Object.entries(capture.pages).filter(([u])=>new URL(u).origin===source));
  const server=serve(root,capture,institution,19110+ix);await listening(server);
  try{for(const placement of placements){
   const id=institution+'-'+placement,labels=selectLabels(pages,entries,placement),packets={},folder='replicas/'+id;
   fs.mkdirSync(path.join(root,folder),{recursive:true});
   for(const row of Object.values(pages)){
    const url=localize(row.url,origin);if(row.status!==200){packets[url]={status:502,profile:null};continue;}
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await ctx.newPage();
    try{await page.goto(url,{waitUntil:'load',timeout:10000});const before=await page.evaluate(inspectPage),slot=labels.find(l=>l.url===row.url),actual=await page.evaluate(inject,slot);
     assert.equal(actual.text,slot.text);const profile=await page.evaluate(inspectPage),context=await page.evaluate(inspectContext);
     assert.deepEqual(profile.links.map(l=>l.url),before.links.map(l=>l.url),'Injection must not change graph');
     assert.deepEqual(profile.links.map(l=>l.url),row.packet.profile.links.map(l=>inScope(l.url,new URL(source),'/')?localize(l.url,origin):l.url),'Snapshot must preserve links');
     profile.links=profile.links.map((l,i)=>({...l,context:{...context[i].context,parent_detail:profile.detail}}));profile.fingerprint=hash(profile.body);
     packets[url]={status:200,profile};fs.writeFileSync(path.join(root,folder,row.id+'.html'),await page.content());
     validation.push({id,url,selector:slot.selector,original_detail:row.packet.profile.detail,replica_detail:profile.detail,actual});
     if(row.url===canonical(entries[0].url)&&placement===401)await page.screenshot({path:path.join(root,institution+'-replica.png'),fullPage:true});
    }finally{await ctx.close();}
   }
   // Add terminal boundary packets, never imaginary successful pages or free visits.
   for(const p of Object.values(packets))for(const l of p.profile?.links||[])if(inScope(l.url,new URL(origin),'/')){const u=canonical(l.url);packets[u]??={status:410,profile:null,boundary:true};}
   const localLabels=labels.map(l=>({...l,original_url:l.url,url:localize(l.url,origin)}));
   save(root,'replicas/'+id+'.json',{id,institution,placement,origin,source,entries:entries.map(e=>({...e,original_url:e.url,url:localize(e.url,origin)})),pages:packets,labels:localLabels});
   catalog.push({id,institution,placement,origin,source,entries:entries.map(e=>({...e,url:localize(e.url,origin)})),html:Object.values(pages).filter(p=>p.status===200).length,ads:labels.filter(l=>l.is_ad).length,normal_controls:labels.filter(l=>!l.is_ad).length,boundaries:Object.values(packets).filter(p=>p.boundary).length});
   console.log(JSON.stringify({prepared:id,...catalog.at(-1),entries:undefined}));
  }}finally{await new Promise(r=>server.close(r));}
 }}finally{await browser.close();}
 save(root,'replica-validation.json',validation);save(root,'replica-catalog.json',catalog);
 const manifest={...read(path.join(root,'prepare-source-manifest.json'))};for(const f of ['capture.json','replica-catalog.json','replica-validation.json',...catalog.map(s=>'replicas/'+s.id+'.json')])manifest[path.join(root,f)]=hash(fs.readFileSync(path.join(root,f),'utf8'));
 for(const d of catalog)for(const f of fs.readdirSync(path.join(root,'replicas',d.id)))manifest[path.join(root,'replicas',d.id,f)]=hash(fs.readFileSync(path.join(root,'replicas',d.id,f),'utf8'));
 save(root,'replica-manifest.json',manifest);
}
function verify(root){for(const [file,digest]of Object.entries(read(path.join(root,'replica-manifest.json'))))assert.equal(hash(fs.readFileSync(file,'utf8')),digest,'Frozen file drift '+file);}
async function verifyCollection(root=ROOT){
 verify(root);const capture=read(path.join(root,'capture.json')),catalog=read(path.join(root,'replica-catalog.json')),checks=[],browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const site of catalog){const d=read(path.join(root,'replicas/'+site.id+'.json')),port=Number(new URL(site.origin).port),server=serve(root,capture,site.institution,port,'replicas/'+site.id);await listening(server);
  try{const selected=[...d.labels.filter(l=>l.is_ad),...d.labels.filter(l=>!l.is_ad).sort((a,b)=>hash(a.url).localeCompare(hash(b.url))).slice(0,8)];
   for(const l of selected){const start=performance.now();let check;try{const s=await collect(l.url,{browser,entryUrl:site.origin,followLinks:false,maxPages:1,maxNodes:20000,allowLongText:true,allowEmpty:true,recordNavigation:true}),c=s.candidates.find(c=>c.selector.endsWith(l.selector));
    check={site:site.id,url:l.url,selector:l.selector,is_ad:l.is_ad,technique:l.technique,surface:l.surface,found:!!c,text_equal:c?.raw_text===l.text,signal:c?.signals.includes(l.technique)||false,signals:c?.signals||[],readiness:s.pages[0].readiness,candidates:s.candidates.length,elapsed_ms:performance.now()-start};
   }catch(e){check={site:site.id,url:l.url,selector:l.selector,is_ad:l.is_ad,error:String(e.message),elapsed_ms:performance.now()-start};}
   checks.push(check);save(root,'collector-checks.partial.json',checks);
  }
  console.log(JSON.stringify({collector_checked:site.id,count:selected.length,missing:checks.filter(c=>c.site===site.id&&!c.found).length,mismatch:checks.filter(c=>c.site===site.id&&(!c.text_equal||!c.signal)).length}));
  }finally{await new Promise(r=>server.close(r));}
 }}finally{await browser.close();}
 verify(root);save(root,'collector-checks.json',{checks,pass:checks.every(c=>c.found&&c.text_equal&&c.signal),api_calls:0});
}
async function evaluate(root=ROOT){
 assert(!fs.existsSync(path.join(root,'summary.json')),'Use immutable results');verify(root);
 const catalog=read(path.join(root,'replica-catalog.json')),capture=read(path.join(root,'capture.json')),rows=[],runs=[],integrity={full_set:0,dedup:0,resume:0,prefix:0};
 const start=performance.now();
 for(const site of catalog){const data=read(path.join(root,'replicas/'+site.id+'.json')),ads=data.labels.filter(l=>l.is_ad),cache=data.pages;
  for(const entry of data.entries){if(!cache[canonical(entry.url)]||cache[canonical(entry.url)].status!==200){rows.push({site:site.id,entry:entry.id,invalid:'entry collection failed'});continue;}
   const ds=distances(Object.fromEntries(Object.entries(cache).map(([u,p])=>[u,{packet:p}])),entry.url),expected=Object.keys(ds).sort(),reachableAds=ads.filter(l=>ds[l.url]!==undefined);
   for(const boundary of ['charged','closed'])for(const seed of seeds){const result={};
    for(const mode of modes){const readPage=async u=>{assert(cache[u],'Missing recorded boundary '+u);const p=structuredClone(cache[u]);if(boundary==='closed'&&p.profile)p.profile.links=p.profile.links.filter(l=>!inScope(l.url,new URL(entry.url),'/')||cache[canonical(l.url)]?.status===200);return p;};
     // Full graph traversal may include thousands of explicit terminal boundary URLs.
     const full=await walk({entry:entry.url,mode,seed,readPage,limit:seed===0?100000:20});assert.equal(new Set(full.visited).size,full.visited.length);integrity.dedup++;
     if(seed===0){assert(!full.pending.length);if(boundary==='charged'){assert.deepEqual([...full.visited].sort(),expected);integrity.full_set++;}}
     const cut=await walk({entry:entry.url,mode,seed,readPage,limit:10}),resume=await walk({entry:entry.url,mode,seed,readPage,state:JSON.parse(JSON.stringify(cut)),limit:20});assert.deepEqual(resume.visited,full.visited.slice(0,20));integrity.resume++;
     for(const n of budgets){const prefix=n===10?cut:resume;assert.deepEqual(prefix.visited,full.visited.slice(0,n));integrity.prefix++;}
     result[mode]=full;runs.push({site:site.id,entry:entry.id,boundary,seed,mode,visited:full.visited,discovered:full.discovered});
    }
    for(const mode of modes){const s=result[mode],base=result.fifo;for(const budget of budgets){const seen=new Set(s.visited.slice(0,budget)),baseSeen=new Set(base.visited.slice(0,budget));
     const reached=ads.filter(l=>seen.has(l.url)),lost=ads.filter(l=>baseSeen.has(l.url)&&!seen.has(l.url)),groups={};
     for(const l of ads)for(const key of ['scenario:'+l.scenario,'surface:'+l.surface,'depth:'+(ds[l.url]===undefined?'unreachable':ds[l.url]<=2?'shallow':ds[l.url]>=5?'deep':'middle')]){const g=groups[key]??={total:0,reached:0,lost:0};g.total++;g.reached+=Number(seen.has(l.url));g.lost+=Number(baseSeen.has(l.url)&&!seen.has(l.url));}
     let accumulated=0,times=[];for(const u of s.visited){if(cache[u].boundary)break;const original=canonical(localize(u,site.source)),measured=capture.pages[original]?.elapsed_ms;if(measured===undefined)break;accumulated+=measured;times.push({url:u,ms:accumulated});}
     const timeReach=Object.fromEntries([30000,60000].map(ms=>[ms,{valid:accumulated>=ms||(!s.pending.length&&times.length===s.visited.length),observed_ms:accumulated,reached:ads.filter(l=>times.some(t=>t.ms<=ms&&t.url===l.url)).length}]));
     const waiting=ads.filter(l=>!seen.has(l.url)&&s.discovered[l.url]<=budget).length,undiscovered=ads.filter(l=>!(s.discovered[l.url]<=budget)).length;
     assert.equal(reached.length+waiting+undiscovered,ads.length);
     rows.push({site:site.id,institution:site.institution,placement:site.placement,entry:entry.id,boundary,seed,mode,budget,total:ads.length,reachable:reachableAds.length,unreachable:ads.length-reachableAds.length,reached:reached.length,recall:reached.length/ads.length,lost:lost.map(l=>l.selector),lost_urls:lost.map(l=>l.url),gained:ads.filter(l=>seen.has(l.url)&&!baseSeen.has(l.url)).length,waiting,undiscovered,boundary_visits:[...seen].filter(u=>cache[u].boundary).length,failed_visits:[...seen].filter(u=>!cache[u].boundary&&cache[u].status!==200).length,groups,timeReach});
    }}
   }
   console.log(JSON.stringify({compared:site.id,entry:entry.id,reachable:reachableAds.length,total:ads.length}));
  }
  save(root,'rows.partial.json',rows);save(root,'runs.partial.json',runs);
 }
 const valid=rows.filter(r=>!r.invalid),aggregate=[];
 for(const boundary of ['charged','closed'])for(const mode of modes)for(const budget of budgets){const a=valid.filter(r=>r.boundary===boundary&&r.mode===mode&&r.budget===budget);aggregate.push({boundary,mode,budget,n:a.length,...stats(a.map(r=>r.recall)),lost_runs:a.filter(r=>r.lost.length).length,lost_sum:a.reduce((s,r)=>s+r.lost.length,0),mean_boundary:mean(a.map(r=>r.boundary_visits)),waiting:mean(a.map(r=>r.waiting)),undiscovered:mean(a.map(r=>r.undiscovered))});}
 const perCell=[];for(const site of catalog)for(const entry of site.entries)for(const mode of modes)for(const budget of budgets){const a=valid.filter(r=>r.site===site.id&&r.entry===entry.id&&r.mode===mode&&r.budget===budget&&r.boundary==='charged');if(a.length)perCell.push({site:site.id,institution:site.institution,entry:entry.id,mode,budget,...stats(a.map(r=>r.recall)),lost_runs:a.filter(r=>r.lost.length).length});}
 const gates=modes.filter(m=>m!=='fifo').map(mode=>{const a=perCell.filter(r=>r.mode===mode),delta=a.map(r=>({...r,base:perCell.find(b=>b.site===r.site&&b.entry===r.entry&&b.mode==='fifo'&&b.budget===r.budget)}));
  const gains=['busan','daejeon'].map(institution=>({institution,delta:mean(valid.filter(r=>r.institution===institution&&r.mode===mode&&r.budget===20&&r.boundary==='charged').map(r=>r.recall))-mean(valid.filter(r=>r.institution===institution&&r.mode==='fifo'&&r.budget===20&&r.boundary==='charged').map(r=>r.recall))}));
  const checks={cell_mean:delta.every(r=>r.mean>=r.base.mean-1e-12),retained:valid.filter(r=>r.mode===mode&&r.budget===20&&r.boundary==='charged').every(r=>!r.lost.length),institution_gain:gains.every(g=>g.delta>=.05-1e-12),worst:delta.filter(r=>r.budget===20).every(r=>r.min>=r.base.min-1e-12),boundary:valid.filter(r=>[mode,'fifo'].includes(r.mode)&&r.boundary==='charged').every(r=>r.boundary_visits/r.budget<=.1),integrity:rows.every(r=>!r.invalid)};return {mode,checks,gains,pass:Object.values(checks).every(Boolean)};
 });verify(root);save(root,'rows.json',rows);save(root,'runs.json',runs);const summary={aggregate,perCell,gates,integrity,adoption:gates.some(g=>g.pass)?'needs_end_to_end_gate':'retain_fifo',elapsed_ms:performance.now()-start,api_calls:0};save(root,'summary.json',summary);console.log(JSON.stringify(summary.gates));
}
if(require.main===module){const a=process.argv[2],root=process.argv[3]||ROOT;(a==='prepare'?prepare(root):a==='run'?evaluate(root):a==='verify'?verifyCollection(root):Promise.reject(Error('Use prepare, run, or verify'))).catch(e=>{console.error(e);process.exitCode=1});}
module.exports={prepare,evaluate,verifyCollection,serve,listening,selectLabels,inject,distances,localize,verify};
