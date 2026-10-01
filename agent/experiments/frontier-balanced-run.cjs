const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{canonical,inScope}=require('../src/core/collect.cjs'),{inspectPage}=require('../src/core/frontier.cjs');
const {inspectContext}=require('./frontier-context.cjs'),{walk}=require('./frontier-balanced.cjs'),{walk:oldWalk}=require('./frontier-corridor-run.cjs');
const {atomic}=require('../src/core/scan.cjs'),{serve}=require('../../test-set-v5/server.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const rootDefault='.runtime/frontier-balanced-v1',modes=['fifo','context-bandit','depth-fifo','template-fifo'];
const seeds=[0,11,23,37,51,67,79,97,109,127,149,163,181,199,211,229,251,269,283,307],budgets=[20,50,100];
const mean=a=>a.reduce((s,n)=>s+n,0)/a.length;
const stats=a=>({n:a.length,mean:mean(a),sd:Math.sqrt(mean(a.map(x=>(x-mean(a))**2))),min:Math.min(...a),max:Math.max(...a)});
function verify(manifest){for(const [f,h]of Object.entries(manifest))assert.equal(sha(f),h,'Frozen file changed: '+f);}
async function prepare(root=rootDefault){
 assert(!fs.existsSync(root),'Use a fresh output directory');fs.mkdirSync(root,{recursive:true});
 const catalog=read('test-set-v5/private/catalog.json'),labels=read('test-set-v5/private/labels.json');
 const files=[__filename,'agent/experiments/frontier-balanced.cjs','agent/experiments/frontier-balanced.test.cjs','agent/experiments/frontier-context.cjs','agent/experiments/frontier-corridor-run.cjs','agent/experiments/frontier-corridor.cjs','agent/experiments/navigation.cjs','agent/experiments/navigation-path.cjs','agent/src/core/frontier.cjs','agent/src/core/scan.cjs','agent/src/core/collect.cjs','docs/frontier-balanced-plan.md','test-set-v5/build.cjs','test-set-v5/server.cjs','test-set-v5/private/catalog.json','test-set-v5/private/labels.json','test-set-v5/public/site.css','.runtime/balanced-source-structure.json',...catalog.flatMap(s=>Object.values(s.files).map(f=>'test-set-v5/public/'+f))];
 const manifest=Object.fromEntries(files.map(f=>[f,sha(f)]));atomic(root,'source-manifest.json',manifest);
 const validation=[],started=performance.now(),browser=await chromium.launch({headless:true,channel:'msedge'});
 try{const page=await browser.newPage({viewport:{width:1380,height:1000}});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  for(const site of catalog){
   const server=serve(site);await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});const pages={},siteStart=performance.now();let checked=0;
   try{
    for(const [route,file]of Object.entries(site.files)){
     const url=site.origin+route,response=await page.goto(url,{waitUntil:'load',timeout:10000});assert.equal(response.status(),200);
     const targets=labels[site.id].cases.filter(c=>c.page===url);
     const actual=await page.evaluate(cs=>cs.map(c=>{const doc=c.frame?document.querySelector(c.frame)?.contentDocument:document;const es=doc?.querySelectorAll(c.selector);return {count:es?.length,text:es?.[0]?.textContent,style:es?.[0]?doc.defaultView.getComputedStyle(es[0]).color:null}}),targets);
     targets.forEach((c,i)=>{assert.equal(actual[i].count,1,c.selector);assert.equal(actual[i].text,c.text,url+' '+c.selector);checked++;});
     const profile=await page.evaluate(inspectPage),context=await page.evaluate(inspectContext);assert.equal(profile.links.length,context.length);
     profile.links=profile.links.map((l,i)=>{assert.equal(l.url,context[i].url);return {...l,context:{...context[i].context,parent_detail:profile.detail}}});
     profile.fingerprint=crypto.createHash('sha256').update(profile.body).digest('hex');pages[canonical(url)]={status:200,profile};
     if(route==='/'&&site.id==='dev-a')await page.screenshot({path:path.join(root,'homepage.png'),fullPage:true});
     if(site.id==='dev-a'&&route.includes('board=opinion')&&route.includes('page=1'))await page.screenshot({path:path.join(root,'board.png'),fullPage:true});
    }
    for(const route of ['/private/labels.json','/build.cjs','/../private/labels.json','/%2e%2e%2fprivate/labels.json'])assert.equal((await page.request.get(site.origin+route)).status(),404);
   }finally{await new Promise(resolve=>server.close(resolve));}
   // Independent shortest-distance check against actual DOM links, not generator intent.
   const depth={[canonical(site.entry)]:0},queue=[canonical(site.entry)];let links=0,duplicates=0,external=0;
   for(let i=0;i<queue.length;i++){const p=pages[queue[i]],seen=new Set();assert(p);for(const l of p.profile.links){links++;if(!inScope(l.url,new URL(site.entry),'/')){external++;continue;}const u=canonical(l.url);assert(pages[u],'Missing linked page '+u);if(seen.has(u))duplicates++;seen.add(u);if(depth[u]===undefined){depth[u]=depth[queue[i]]+1;queue.push(u);}}}
   assert.equal(queue.length,site.pages);for(const c of labels[site.id].cases)assert.equal(c.depth,depth[canonical(c.page)],'Generator depth differs from DOM');
   const ads=labels[site.id].cases.filter(c=>c.is_ad),meta=labels[site.id].page_meta;
   const row={id:site.id,split:site.split,pages:site.pages,validated_locations:checked,ads:ads.length,normal:checked-ads.length,non_detail_ads:ads.filter(c=>!pages[canonical(c.page)].profile.detail).length,detail_normal_pages:meta.filter(m=>pages[canonical(m.url)].profile.detail&&!ads.some(c=>c.page===m.url)).length,deep_normal_pages:meta.filter(m=>m.dead&&m.depth>=5).length,max_depth:Math.max(...Object.values(depth)),links,duplicate_links:duplicates,external_links:external,browser_prepare_ms:performance.now()-siteStart};
   assert(row.non_detail_ads>0&&row.detail_normal_pages>0&&row.deep_normal_pages>0);
   validation.push(row);atomic(root,site.id+'.json',{id:site.id,split:site.split,entry:site.entry,pages});manifest[path.join(root,site.id+'.json')]=sha(path.join(root,site.id+'.json'));console.log(JSON.stringify(row));
  }
 }finally{await browser.close();}
 verify(manifest);atomic(root,'manifest.json',manifest);atomic(root,'catalog.json',catalog.map(({files,...s})=>s));atomic(root,'validation.json',{sites:validation,total_ms:performance.now()-started,api_calls:0});
}
function categories(c){return ['scenario:'+c.scenario,'section:'+c.section,'surface:'+c.surface,'technique:'+c.technique,...(c.depth<=2?['depth:shallow']:c.depth>=5?['depth:deep']:['depth:middle']),...(c.frame?['surface:iframe']:[])];}
async function run(root=rootDefault){
 assert(!fs.existsSync(path.join(root,'summary.json')),'Completed experiment is immutable; use a fresh output directory');
 const manifest=read(path.join(root,'manifest.json'));verify(manifest);const catalog=read(path.join(root,'catalog.json'));
 const oldFetch=global.fetch;global.fetch=()=>{throw Error('Network forbidden in offline comparison');};
 const rows=[],runs=[],integrity={full_set:0,dedup:0,resume:0,prefix:0,baseline_parity:0};const start=performance.now();
 try{for(const site of catalog){
  const snapshot=read(path.join(root,site.id+'.json')),packets=snapshot.pages,options={entry:site.entry,readPage:async u=>{assert(packets[u],'Requested an undiscovered/missing address');return structuredClone(packets[u]);}};
  const results=[];
  for(const seed of seeds)for(const mode of modes){
   const s=await walk({...options,mode,seed});assert.deepEqual([...s.visited].sort(),Object.keys(packets).sort());integrity.full_set++;assert.equal(new Set(s.visited).size,s.visited.length);integrity.dedup++;
   const cut=await walk({...options,mode,seed,limit:50}),resume=await walk({...options,mode,seed,state:JSON.parse(JSON.stringify(cut))});assert.deepEqual(resume.visited,s.visited);assert.deepEqual(resume.discovered,s.discovered);assert.deepEqual(resume.pending,s.pending);integrity.resume++;
   for(const limit of [20,100]){const prefix=await walk({...options,mode,seed,limit});assert.deepEqual(prefix.visited,s.visited.slice(0,limit));integrity.prefix++;}assert.deepEqual(cut.visited,s.visited.slice(0,50));integrity.prefix++;
   if(seed===0&&['fifo','context-bandit'].includes(mode)){assert.deepEqual(s.visited,(await oldWalk({...options,mode,seed})).visited);integrity.baseline_parity++;}
   results.push({site:site.id,split:site.split,seed,mode,visited:s.visited,discovered:s.discovered,cpu_ms:s.elapsed_ms});
  }
  // Labels are loaded only after every policy has completed this site's traversal.
  const gold=read('test-set-v5/private/labels.json')[site.id],ads=gold.cases.filter(c=>c.is_ad),positive=u=>ads.some(c=>canonical(c.page)===u);
  for(const r of results){const {seed,mode}=r,fifo=results.find(x=>x.seed===r.seed&&x.mode==='fifo');
   for(const budget of budgets){const seen=new Set(r.visited.slice(0,budget)),base=new Set(fifo.visited.slice(0,budget)),has=c=>seen.has(canonical(c.page));
    const reached=ads.filter(has),lost=ads.filter(c=>base.has(canonical(c.page))&&!has(c)),gained=ads.filter(c=>has(c)&&!base.has(canonical(c.page))),groups={};
    for(const c of ads)for(const key of categories(c)){const g=groups[key]??={total:0,reached:0,lost:0};g.total++;g.reached+=Number(has(c));g.lost+=Number(base.has(canonical(c.page))&&!has(c));}
    const id=c=>({page:c.page,selector:c.selector,frame:c.frame,scenario:c.scenario,surface:c.surface,section:c.section,depth:c.depth});
    rows.push({site:site.id,split:site.split,seed,mode,budget,total:ads.length,reached:reached.length,recall:reached.length/ads.length,lost:lost.map(id),gained:gained.map(id),groups,
     waiting:ads.filter(c=>!has(c)&&r.discovered[canonical(c.page)]<=budget).length,undiscovered:ads.filter(c=>!(r.discovered[canonical(c.page)]<=budget)).length,
     dead_branch_visits:gold.page_meta.filter(p=>p.dead&&seen.has(canonical(p.url))).length,
     first_ad:r.visited.findIndex(positive)+1,first_deep_ad:r.visited.findIndex(u=>ads.some(c=>c.depth>=5&&canonical(c.page)===u))+1,cpu_full_ms:r.cpu_ms});
    const row=rows.at(-1);assert.equal(row.reached+row.waiting+row.undiscovered,ads.length);
   }
  }
  runs.push(...results);atomic(root,site.id+'-runs.json',results);atomic(root,'rows.partial.json',rows);
  const main=rows.filter(r=>r.site===site.id&&r.budget===50);console.log(JSON.stringify({completed:site.id,results:modes.map(mode=>{const a=main.filter(r=>r.mode===mode);return {mode,...stats(a.map(r=>r.recall)),lost_runs:a.filter(r=>r.lost.length).length,lost_sum:a.reduce((s,r)=>s+r.lost.length,0)}})}));
 }}finally{global.fetch=oldFetch;}
 const aggregate=[];for(const split of ['dev','confirmation','all'])for(const mode of modes)for(const budget of budgets){const rs=rows.filter(r=>(split==='all'||r.split===split)&&r.mode===mode&&r.budget===budget);aggregate.push({split,mode,budget,...stats(rs.map(r=>r.recall)),lost_runs:rs.filter(r=>r.lost.length).length,lost_sum:rs.reduce((s,r)=>s+r.lost.length,0),lost_max:Math.max(...rs.map(r=>r.lost.length)),waiting:mean(rs.map(r=>r.waiting)),undiscovered:mean(rs.map(r=>r.undiscovered)),dead_branch_visits:mean(rs.map(r=>r.dead_branch_visits))});}
 const perSite=[];for(const site of catalog)for(const mode of modes)for(const budget of budgets){const rs=rows.filter(r=>r.site===site.id&&r.mode===mode&&r.budget===budget),base=rows.filter(r=>r.site===site.id&&r.mode==='fifo'&&r.budget===budget);perSite.push({site:site.id,split:site.split,mode,budget,...stats(rs.map(r=>r.recall)),delta:mean(rs.map(r=>r.recall))-mean(base.map(r=>r.recall)),worst_delta:Math.min(...rs.map(r=>r.recall))-Math.min(...base.map(r=>r.recall)),paired_min_delta:Math.min(...rs.map(r=>r.recall-base.find(b=>b.seed===r.seed).recall)),lost_runs:rs.filter(r=>r.lost.length).length,lost_sum:rs.reduce((s,r)=>s+r.lost.length,0),first_ad:stats(rs.map(r=>r.first_ad)),first_deep:stats(rs.map(r=>r.first_deep_ad))});}
 const grouped=[];for(const mode of modes)for(const budget of budgets)for(const group of [...new Set(rows.flatMap(r=>Object.keys(r.groups)))]){const rs=rows.filter(r=>r.mode===mode&&r.budget===budget&&r.groups[group]),sum=k=>rs.reduce((s,r)=>s+r.groups[group][k],0);grouped.push({mode,budget,group,total:sum('total'),reached:sum('reached'),recall:sum('reached')/sum('total'),lost:sum('lost')});}
 const gates=modes.filter(m=>m!=='fifo').map(mode=>{
  const detail=perSite.filter(r=>r.mode===mode),main=rows.filter(r=>r.mode===mode&&r.budget===50),gain=split=>aggregate.find(r=>r.split===split&&r.mode===mode&&r.budget===50).mean-aggregate.find(r=>r.split===split&&r.mode==='fifo'&&r.budget===50).mean;
  const deepNondecrease=catalog.every(site=>{const ds=m=>rows.filter(r=>r.site===site.id&&r.mode===m&&r.budget===50).map(r=>r.groups['depth:deep'].reached);return mean(ds(mode))>=mean(ds('fifo'));});
  const checks={site_mean:detail.every(r=>r.delta>=-1e-12),retained:main.every(r=>r.lost.length===0),effect:gain('dev')>=.05-1e-12&&gain('confirmation')>=.05-1e-12,worst_case:detail.filter(r=>r.budget===50).every(r=>r.worst_delta>=-1e-12),deep:deepNondecrease,integrity:integrity.full_set===640&&integrity.resume===640&&integrity.prefix===1920&&integrity.baseline_parity===16};return {mode,checks,dev_gain:gain('dev'),confirmation_gain:gain('confirmation'),pass:Object.values(checks).every(Boolean)};
 });
 verify(manifest);const summary={at:new Date().toISOString(),runs:runs.length,integrity,aggregate,perSite,grouped,gates,adoption:gates.some(g=>g.pass)?'candidate_requires_live_pipeline_validation':'retain_fifo',elapsed_ms:performance.now()-start,api_calls:0,tokens:0};
 atomic(root,'rows.json',rows);atomic(root,'summary.json',summary);console.log(JSON.stringify({runs:runs.length,integrity,gates,adoption:summary.adoption,elapsed_ms:summary.elapsed_ms},null,2));
}
if(require.main===module)(process.argv[2]==='prepare'?prepare(process.argv[3]):process.argv[2]==='run'?run(process.argv[3]):Promise.reject(Error('Use prepare or run'))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={prepare,run,stats};
