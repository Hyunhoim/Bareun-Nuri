const fs=require('node:fs'),assert=require('node:assert/strict');
const {simulate}=require('./navigation.cjs');
const {canonical}=require('../src/core/collect.cjs');
const read=p=>JSON.parse(fs.readFileSync(p));
function stressGraphs(){
 // Structural safety fixtures, not a new ad-accuracy holdout. Destinations reveal no labels.
 return [2,7,15].map((width,index)=>{
  const entry='http://stress.test/',pages={};
  const add=(url,links,detail=false)=>{pages[url]={status:200,detail,fingerprint:url,links:links.map(to=>({url:to,text:'안내',group:'nav',content_scope:false}))};};
  const first=Array.from({length:width},(_,i)=>entry+'b'+i+'-0');add(entry,first);
  for(let i=0;i<width;i++){
   const length=2+(i*3+index)%9;
   for(let d=0;d<length;d++){
    const url=entry+'b'+i+'-'+d,links=[entry];
    if(d+1<length)links.push(entry+'b'+i+'-'+(d+1));
    if(d>0)links.push(entry+'b'+i+'-'+(d-1));
    if(index===2&&d===1)links.push(first[(i+1)%width]);
    if(index===1&&d===1)for(let k=0;k<4;k++){const leaf=url+'-dead'+k;add(leaf,[entry],true);links.push(leaf);}
    links.push('http://outside.test/no');add(url,links,d===length-1);
   }
  }return {entry,pages,width};
 });
}
async function main(){
 const {simulatePath}=require('./navigation-path.cjs'),root=process.argv[2]||'.runtime/navigation-path-offline-v1';assert(!fs.existsSync(root));
 const orders=read('.runtime/navigation-trial-v1/orders.json').filter(r=>r.experiment==='policy'&&!r.site.startsWith('legacy'));
 const gold=read('test-set-v4/private/labels.json'),rows=[],pathOrders=[];let oldChecks=0,prefixChecks=0,stressChecks=0;
 for(const id of [...new Set(orders.map(r=>r.site))]){
  const s=read('.runtime/navigation-trial-v1/'+id+'-snapshot.json'),lookup=async u=>structuredClone(s.pages[u]);
  for(const r of orders.filter(r=>r.site===id)){
   const actual=await simulate({entry:s.entry,scope:s.scope,mode:r.mode,seed:r.seed,read:lookup});
   assert.deepEqual(actual.visits.map(({cpu_ms,...v})=>v),r.visits.map(({cpu_ms,...v})=>v));oldChecks++;
  }
  for(const seed of [0,11,23,37,51]){
   const disabled=await simulatePath({entry:s.entry,scope:s.scope,mode:'bandit',seed,read:lookup,continuePath:false});
   const expected=orders.find(r=>r.site===id&&r.seed===seed&&r.mode==='bandit');
   assert.deepEqual(disabled.visits.map(({cpu_ms,...v})=>v),expected.visits.map(({cpu_ms,...v})=>v));
   const r=await simulatePath({entry:s.entry,scope:s.scope,mode:'bandit',seed,read:lookup});
   assert(r.complete);assert.deepEqual(r.visits.map(v=>v.url).sort(),Object.keys(s.pages).sort());
   for(const v of r.visits){if(v.request%5===0)assert.equal(v.choice,'fifo');if(v.choice.startsWith('path-'))assert([1,2,3].includes(v.request%10));}
   const old=orders.find(r=>r.site===id&&r.seed===seed&&r.mode==='bandit');pathOrders.push({site:id,seed,...r});
   for(const budget of [20,50,100]){
    const short=await simulatePath({entry:s.entry,scope:s.scope,mode:'bandit',seed,read:lookup,maxRequests:budget});assert.deepEqual(short.events,r.events.slice(0,budget));prefixChecks++;
    const ads=gold[id].cases.filter(c=>c.is_ad),deep=ads.filter(c=>c.category==='deep_user'),seen=new Set(r.visits.filter(v=>v.request<=budget).map(v=>v.url)),was=new Set(old.visits.filter(v=>v.request<=budget).map(v=>v.url));
    const count=(cs,set)=>cs.filter(c=>set.has(canonical(c.page))).length;
    rows.push({site:id,split:s.split,seed,budget,ads:ads.length,deep:deep.length,baseline:count(ads,was),path:count(ads,seen),baseline_deep:count(deep,was),path_deep:count(deep,seen),lost:ads.filter(c=>was.has(canonical(c.page))&&!seen.has(canonical(c.page))).length});
   }
  }
 }
 for(const g of stressGraphs())for(const seed of [0,11,23,37,51]){
  const allowed=new Set([g.entry]),lookup=async u=>{assert(allowed.has(u),'Undiscovered page access');const p=g.pages[u];assert(p);for(const l of p.links)if(g.pages[l.url])allowed.add(l.url);return structuredClone(p);};
  const r=await simulatePath({entry:g.entry,mode:'bandit',seed,read:lookup});assert(r.complete);assert.deepEqual(r.visits.map(v=>v.url).sort(),Object.keys(g.pages).sort());stressChecks++;
 }
 const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length,summary=[];
 for(const split of ['dev','confirmation'])for(const budget of [20,50,100]){
  const rs=rows.filter(r=>r.split===split&&r.budget===budget),sites=[...new Set(rs.map(r=>r.site))];
  summary.push({split,budget,baseline:mean(rs.map(r=>r.baseline/r.ads)),path:mean(rs.map(r=>r.path/r.ads)),delta_pp:100*mean(rs.map(r=>(r.path-r.baseline)/r.ads)),
   baseline_deep:mean(rs.map(r=>r.baseline_deep/r.deep)),path_deep:mean(rs.map(r=>r.path_deep/r.deep)),deep_delta_pp:100*mean(rs.map(r=>(r.path_deep-r.baseline_deep)/r.deep)),
   worst_site_delta_pp:Math.min(...sites.map(s=>100*mean(rs.filter(r=>r.site===s).map(r=>(r.path-r.baseline)/r.ads)))),lost:mean(rs.map(r=>r.lost))});
 }
 const fifties=summary.filter(r=>r.budget===50),gate=fifties.every(r=>r.deep_delta_pp>=0)&&fifties.some(r=>r.deep_delta_pp>=5)&&summary.every(r=>r.worst_site_delta_pp>=-5-1e-8);
 fs.mkdirSync(root);for(const [name,value]of Object.entries({orders:pathOrders,rows,summary:{summary,gate,oldChecks,prefixChecks,stressChecks}}))fs.writeFileSync(root+'/'+name+'.json',JSON.stringify(value,null,2));
 console.log(JSON.stringify({summary,gate,oldChecks,prefixChecks,stressChecks},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
