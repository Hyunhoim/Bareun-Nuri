const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {simulate,inspectPage,inspectXML}=require('./navigation.cjs'),{canonical}=require('../src/core/collect.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
const root=process.argv[2]||'.runtime/navigation-trial';
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
async function main(){
 fs.mkdirSync(root);const sourceFiles=['docs/navigation-experiments-plan.md','agent/experiments/navigation.cjs','agent/experiments/navigation-run.cjs','agent/experiments/navigation.test.cjs','agent/experiments/priority.cjs','agent/src/core/collect.cjs','test-set-v4/build.cjs',
 ...['test-set-v3','test-set-v4'].flatMap(dir=>fs.readdirSync(dir,{recursive:true}).map(f=>path.join(dir,f)).filter(f=>fs.statSync(f).isFile()))];
 const manifest={created_at:new Date().toISOString(),files:Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(f))]))};
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
 const catalog=read('test-set-v4/private/catalog.json').map(s=>({...s,root:'test-set-v4'})),gold=read('test-set-v4/private/labels.json');
 const legacyGold=read('test-set-v3/private/labels.json'),routes=read('test-set-v3/private/routes.json');
 for(const split of ['dev','confirmation']){
  const id='legacy-'+split,entry='http://127.0.0.1:8787/'+split+'/';
  catalog.push({id,split:'legacy',root:'test-set-v3',entry,scope:'/'+split+'/',resources:{},files:Object.fromEntries(Object.entries(routes).filter(([url])=>url.startsWith('/'+split+'/')||url==='/'+split).map(([url,file])=>[new URL(url,entry).href,file]))});
  gold[id]={cases:legacyGold[split].cases.map(c=>({...c,page:new URL(c.page,entry).href})),pages:legacyGold[split].pages.map(p=>({...p,url:new URL(p.url,entry).href}))};
 }
 const browser=await chromium.launch({headless:true,channel:'msedge'}),snapshots=[];let parseMs=0;
 try{
  const tab=await browser.newPage();await tab.route('**/*',route=>route.abort());
  for(const site of catalog){
   const pages={},resources={},t0=performance.now();
   for(const [url,file]of Object.entries(site.files)){
    const html=fs.readFileSync(path.join(site.root,'public',file),'utf8');
    await tab.setContent('<base href="'+url+'">'+html,{waitUntil:'domcontentloaded'});
    const data=await tab.evaluate(inspectPage),fingerprint=sha(data.body);delete data.body;
    pages[canonical(url)]={...data,fingerprint,status:200,bytes:Buffer.byteLength(html)};
    const labels=gold[site.id].cases.filter(c=>canonical(c.page)===canonical(url));
    for(const c of labels){const raw=await tab.locator(c.selector).textContent();assert.equal(raw,c.text,'Gold location/raw mismatch');}
   }
   for(const [condition,files]of Object.entries(site.resources)){
    resources[condition]={};
    for(const [url,file]of Object.entries(files)){
     const body=fs.readFileSync(path.join(site.root,'public',file),'utf8'),p={status:200,bytes:Buffer.byteLength(body)};
     if(url.endsWith('.xml')){try{p.xml=await tab.evaluate(inspectXML,body);}catch(e){p.error=e.message;}}else p.body=body;
     resources[condition][canonical(url)]=p;
    }
   }
   const parse_ms=performance.now()-t0;parseMs+=parse_ms;
   const snapshot={id:site.id,split:site.split,entry:site.entry,scope:site.scope,pages,resources,parse_ms};snapshots.push(snapshot);
   fs.writeFileSync(path.join(root,site.id+'-snapshot.json'),JSON.stringify(snapshot));
   console.log(JSON.stringify({phase:'parsed',site:site.id,pages:Object.keys(pages).length,labels:gold[site.id].cases.length,parse_sec:parse_ms/1000}));
  }
 }finally{await browser.close();}
 const rows=[],orders=[],seeds=[0,11,23,37,51],modes=['fifo','priority','hybrid','bandit'];
 for(const site of snapshots){
  const gs=gold[site.id],positives=gs.cases.filter(c=>c.is_ad),total=positives.length,categories=[...new Set(positives.map(c=>c.category))];
  const lookup=(condition)=>async(url,kind)=>structuredClone(kind==='page'?site.pages[canonical(url)]||{status:404,bytes:9}:site.resources[condition]?.[canonical(url)]||{status:404,bytes:9});
  const variants=modes.map(mode=>({experiment:'policy',mode,condition:'none',sitemap:false}));
  if(site.split!=='legacy')for(const condition of ['none','full','partial','stale'])variants.push({experiment:'sitemap',mode:'fifo+sitemap',condition,sitemap:true});
  const all={};
  for(const seed of seeds)for(const v of variants){
   const result=await simulate({entry:site.entry,scope:site.scope,mode:v.sitemap?'fifo':v.mode,seed,sitemap:v.sitemap,read:lookup(v.condition)});
   const successful=result.visits.filter(x=>x.status===200);assert(result.complete,'Fixture queue did not finish');
   assert.deepEqual([...new Set(successful.map(x=>x.url))].sort(),Object.keys(site.pages).sort(),'Full reachable set changed');
   orders.push({site:site.id,seed,...v,...result});all[seed+':'+v.mode+':'+v.condition]=result;
   const budgets=site.split==='legacy'?[20,40]:[20,50,100];
   for(const budget of budgets){
    const visits=result.visits.filter(x=>x.request<=budget),seen=new Set(visits.filter(x=>x.status===200).map(x=>x.url)),events=result.events.slice(0,budget);
    const reached=positives.filter(c=>seen.has(canonical(c.page))),baseline=all[seed+':fifo:none'];
    const fifoSeen=new Set(baseline.visits.filter(x=>x.request<=budget&&x.status===200).map(x=>x.url));
    rows.push({site:site.id,split:site.split,seed,...v,budget,ads:total,reached:reached.length,recall:reached.length/total,
     first_ad_request:result.visits.find(x=>positives.some(c=>canonical(c.page)===x.url))?.request??null,
     lost:positives.filter(c=>fifoSeen.has(canonical(c.page))&&!seen.has(canonical(c.page))).length,
     gained:positives.filter(c=>!fifoSeen.has(canonical(c.page))&&seen.has(canonical(c.page))).length,
     by_category:Object.fromEntries(categories.map(cat=>[cat,{reached:reached.filter(c=>c.category===cat).length,total:positives.filter(c=>c.category===cat).length}])),
     requests:events.length,pages:seen.size,errors:events.filter(e=>e.status!==200).length,metadata:events.filter(e=>e.kind!=='page').length,
     bytes:events.reduce((n,e)=>n+e.bytes,0),scheduler_ms:visits.reduce((n,x)=>n+x.cpu_ms,0),detail_pages:visits.filter(x=>x.reward).length});
   }
  }
  console.log(JSON.stringify({phase:'replayed',site:site.id,runs:seeds.length*variants.length}));
 }
 fs.writeFileSync(path.join(root,'orders.json'),JSON.stringify(orders));fs.writeFileSync(path.join(root,'metrics.json'),JSON.stringify(rows,null,2));
 const aggregate=[];
 for(const split of ['dev','confirmation','legacy'])for(const mode of ['fifo','priority','hybrid','bandit','fifo+sitemap'])for(const condition of mode==='fifo+sitemap'?['none','full','partial','stale']:['none'])for(const budget of split==='legacy'?[20,40]:[20,50,100]){
  const rs=rows.filter(r=>r.split===split&&r.mode===mode&&r.condition===condition&&r.budget===budget);if(!rs.length)continue;
  const base=rows.filter(r=>r.split===split&&r.mode==='fifo'&&r.budget===budget);
  const sites=[...new Set(rs.map(r=>r.site))],deltas=sites.map(site=>mean(rs.filter(r=>r.site===site).map(r=>r.recall))-mean(base.filter(r=>r.site===site).map(r=>r.recall)));
  aggregate.push({split,mode,condition,budget,n:rs.length,recall:mean(rs.map(r=>r.recall)),delta_pp:100*(mean(rs.map(r=>r.recall))-mean(base.map(r=>r.recall))),worst_site_delta_pp:100*Math.min(...deltas),
   reached:mean(rs.map(r=>r.reached)),lost:mean(rs.map(r=>r.lost)),gained:mean(rs.map(r=>r.gained)),pages:mean(rs.map(r=>r.pages)),metadata:mean(rs.map(r=>r.metadata)),errors:mean(rs.map(r=>r.errors)),
   first_ad:mean(rs.map(r=>r.first_ad_request)),scheduler_ms:mean(rs.map(r=>r.scheduler_ms)),bytes:mean(rs.map(r=>r.bytes)),site_deltas:Object.fromEntries(sites.map((s,i)=>[s,deltas[i]*100]))});
 }
 const gates=[];
 for(const mode of ['hybrid','bandit','fifo+sitemap'])for(const condition of mode==='fifo+sitemap'?['full','partial']:['none']){
  const splits=['dev','confirmation'].map(split=>{const rs=aggregate.filter(r=>r.split===split&&r.mode===mode&&r.condition===condition);
   return {split,pass:rs.find(r=>r.budget===20).delta_pp>=-1e-8&&rs.filter(r=>r.delta_pp>=5-1e-8).length>=2&&rs.every(r=>r.worst_site_delta_pp>=-5-1e-8)};});gates.push({mode,condition,splits,pass:splits.every(s=>s.pass)});
 }
 for(const [file,h]of Object.entries(manifest.files))assert.equal(sha(fs.readFileSync(file)),h,'Frozen source changed '+file);
 const summary={aggregate,gates,runs:orders.length,parse_sec:parseMs/1000,external_llm_calls:0,tokens:0,all_complete_sets_preserved:true};
 fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({gates,runs:orders.length,parse_sec:summary.parse_sec},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
