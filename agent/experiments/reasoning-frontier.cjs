// Reachability only. The unchanged policy sees visited-page observations, never labels.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright'),{atomic}=require('../src/core/scan.cjs'),{canonical}=require('../src/core/collect.cjs');
const {walk}=require('./frontier-corridor-run.cjs'),context=require('./frontier-context.cjs'),{inspectPage}=require('./navigation.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length,rootDefault='.runtime/reasoning-navigation-v2/navigation';
async function prepare(root=rootDefault){
 assert(!fs.existsSync(root),'Use fresh navigation output');fs.mkdirSync(root,{recursive:true});
 const sites=read('test-set-v4/private/catalog.json'),manifest={};
 for(const file of [__filename,'agent/experiments/frontier-context.cjs','agent/experiments/frontier-corridor-run.cjs','agent/experiments/navigation.cjs','agent/src/core/frontier.cjs','agent/src/core/collect.cjs','docs/reasoning-navigation-plan.md','test-set-v4/private/catalog.json','test-set-v4/private/labels.json'])manifest[file]=sha(file);
 const browser=await chromium.launch({headless:true,channel:'msedge'});const prepared=[];let parsed=0;
 try{const page=await browser.newPage();await page.route('**/*',r=>r.abort());
  for(const site of sites){
   const oldFile='.runtime/navigation-trial-v1/'+site.id+'-snapshot.json',old=read(oldFile);manifest[oldFile]=sha(oldFile);const pages={};
   for(const [url,file]of Object.entries(site.files)){
    const input=path.join('test-set-v4/public',file);manifest[input]=sha(input);const html=fs.readFileSync(input,'utf8');
    await page.setContent('<base href="'+url+'">'+html,{waitUntil:'domcontentloaded'});
    const profile=await page.evaluate(inspectPage),links=await page.evaluate(context.inspectContext),saved=old.pages[canonical(url)];
    assert(saved);assert.deepEqual(profile.links,saved.links);assert.equal(profile.detail,saved.detail);assert.equal(crypto.createHash('sha256').update(profile.body).digest('hex'),saved.fingerprint);
    assert.equal(links.length,profile.links.length);const augmented=profile.links.map((l,i)=>{assert.equal(l.url,links[i].url);return {...l,context:{...links[i].context,parent_detail:profile.detail}};});
    pages[canonical(url)]={status:200,profile:{...saved,links:augmented}};parsed++;
   }
   const data={id:site.id,split:site.split,entry:site.entry,scope:site.scope,pages,budgets:[20,50,100]};prepared.push(data);atomic(root,site.id+'.json',data);console.log(JSON.stringify({prepared:site.id,pages:Object.keys(pages).length}));
  }
 }finally{await browser.close();}
 for(const id of ['mixed-0','mixed-1']){const f='.runtime/frontier-four-v1/'+id+'.json',gold='.runtime/frontier-four-v1/'+id+'-gold.json';manifest[f]=sha(f);manifest[gold]=sha(gold);const d=read(f),data={id,split:'mixed',entry:d.entry,scope:'/',pages:Object.fromEntries(d.snapshot.pages.map(p=>[canonical(p.url),{status:200,profile:p.navigation.profile,links:p.navigation.links}])),budgets:[12,18,24]};prepared.push(data);atomic(root,id+'.json',data);}
 atomic(root,'catalog.json',prepared.map(({pages,...s})=>s));for(const s of prepared)manifest[path.join(root,s.id+'.json')]=sha(path.join(root,s.id+'.json'));
 atomic(root,'manifest.json',manifest);console.log(JSON.stringify({sites:prepared.length,html_contexts:parsed}));
}
async function run(root=rootDefault){
 const manifest=read(path.join(root,'manifest.json'));for(const [f,h]of Object.entries(manifest))assert.equal(sha(f),h);
 const catalog=read(path.join(root,'catalog.json')),rows=[],runs=[],bias=[];let parity=0,prefix=0;
 const originalFetch=global.fetch;global.fetch=()=>{throw Error('No network permitted in offline reachability comparison');};
 try{for(const item of catalog){
  const site=read(path.join(root,item.id+'.json')),options={entry:site.entry,scope:site.scope,readPage:async url=>{const p=site.pages[url];assert(p,'Unknown fixture URL');return structuredClone(p);}};
  for(const seed of [0,11,23,37,51])for(const mode of ['fifo','context-bandit']){
   const result=await walk({...options,seed,mode}),serial=await walk({...options,seed,mode,serialize:true});
   assert.deepEqual(result.visited,serial.visited);parity++;assert.equal(new Set(result.visited).size,result.visited.length);assert.deepEqual([...result.visited].sort(),Object.keys(site.pages).sort());
   for(const budget of site.budgets){const short=await walk({...options,seed,mode,limit:budget});assert.deepEqual(short.visited,result.visited.slice(0,budget));prefix++;}
   runs.push({id:site.id,seed,mode,visited:result.visited,discovered:result.discovered,cpu_ms:result.elapsed_ms});
   // Labels are read only after completing this traversal and its parity checks.
   const labels=site.split==='mixed'?read('.runtime/frontier-four-v1/'+site.id+'-gold.json'):read('test-set-v4/private/labels.json')[site.id].cases;
   const ads=labels.filter(g=>g.is_ad),deep=ads.filter(g=>['deep','deep_user'].includes(g.category)),adPages=new Set(ads.map(g=>canonical(g.page)));
   if(seed===0&&mode==='fifo')bias.push({id:site.id,ad_pages:adPages.size,ad_detail:[...adPages].filter(u=>site.pages[u].profile.detail).length,non_ad_pages:Object.keys(site.pages).filter(u=>!adPages.has(u)).length,non_ad_detail:Object.entries(site.pages).filter(([u,p])=>!adPages.has(u)&&p.profile.detail).length});
   for(const budget of site.budgets){const visited=new Set(result.visited.slice(0,budget)),reached=ads.filter(g=>visited.has(canonical(g.page))),base=runs.find(r=>r.id===site.id&&r.seed===seed&&r.mode==='fifo'),baseSeen=new Set(base.visited.slice(0,budget));
    rows.push({id:site.id,split:site.split,seed,mode,budget,total:ads.length,reached:reached.length,recall:reached.length/ads.length,deep:deep.filter(g=>visited.has(canonical(g.page))).length,deep_total:deep.length,lost:ads.filter(g=>baseSeen.has(canonical(g.page))&&!visited.has(canonical(g.page))).map(g=>({page:g.page,location:g.location||g.selector,category:g.category})),waiting:ads.filter(g=>!visited.has(canonical(g.page))&&result.discovered[canonical(g.page)]<=budget).length,undiscovered:ads.filter(g=>!(result.discovered[canonical(g.page)]<=budget)).length,normal_page_fraction:[...visited].filter(u=>!adPages.has(u)).length/visited.size,cpu_full_ms:result.elapsed_ms});
   }
  }
  console.log(JSON.stringify({completed:site.id,runs:runs.length}));
 }}finally{global.fetch=originalFetch;}
 const aggregate=[];for(const split of ['dev','confirmation','mixed'])for(const mode of ['fifo','context-bandit'])for(const budget of [...new Set(rows.filter(r=>r.split===split).map(r=>r.budget))]){const rs=rows.filter(r=>r.split===split&&r.mode===mode&&r.budget===budget);aggregate.push({split,mode,budget,runs:rs.length,recall:mean(rs.map(r=>r.recall)),deep_recall:mean(rs.map(r=>r.deep_total?r.deep/r.deep_total:0)),lost:mean(rs.map(r=>r.lost.length)),waiting:mean(rs.map(r=>r.waiting)),undiscovered:mean(rs.map(r=>r.undiscovered)),normal_page_fraction:mean(rs.map(r=>r.normal_page_fraction)),full_schedule_ms:mean(rs.map(r=>r.cpu_full_ms))});}
 const siteComparisons=catalog.flatMap(s=>s.budgets.map(b=>{const a=rows.filter(r=>r.id===s.id&&r.budget===b&&r.mode==='fifo'),v=rows.filter(r=>r.id===s.id&&r.budget===b&&r.mode==='context-bandit');return {id:s.id,budget:b,delta:mean(v.map(r=>r.recall))-mean(a.map(r=>r.recall)),deep_delta:mean(v.map(r=>r.deep))-mean(a.map(r=>r.deep))};}));
 const gains=['dev','confirmation'].map(split=>({split,gain:aggregate.find(r=>r.split===split&&r.mode==='context-bandit'&&r.budget===50).recall-aggregate.find(r=>r.split===split&&r.mode==='fifo'&&r.budget===50).recall}));
 const gates={coverage:parity===80&&prefix===240,nondecrease:siteComparisons.every(r=>r.delta>=-1e-12),retained:rows.filter(r=>r.mode==='context-bandit'&&r.budget===(r.split==='mixed'?18:50)).every(r=>!r.lost.length),gain:gains.every(r=>r.gain>=.05),deep:siteComparisons.every(r=>r.deep_delta>=-1e-12)};
 for(const [f,h]of Object.entries(manifest))assert.equal(sha(f),h);
 const summary={runs:runs.length,parity_checks:parity,prefix_checks:prefix,aggregate,siteComparisons,gains,bias,gates,pass:Object.values(gates).every(Boolean),api_calls:0};atomic(root,'runs.json',runs);atomic(root,'rows.json',rows);atomic(root,'summary.json',summary);console.log(JSON.stringify({pass:summary.pass,gates,gains,summary:path.join(root,'summary.json')}));
}
if(require.main===module){const [action,root=rootDefault]=process.argv.slice(2);Promise.resolve().then(()=>({prepare,run}[action]||(()=>{throw Error('prepare|run');}))(root)).catch(e=>{console.error(e.stack);process.exitCode=1;});}
