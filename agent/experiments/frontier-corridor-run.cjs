const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const baseline=require('../src/core/frontier.cjs'),context=require('./frontier-context.cjs'),corridor=require('./frontier-corridor.cjs');
const {canonical,inScope}=require('../src/core/collect.cjs'),{atomic}=require('../src/core/scan.cjs');
const {shuffle,hash}=require('./navigation.cjs'),{simulatePath}=require('./navigation-path.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
function policy(mode){return mode.endsWith('-corridor')?corridor.scheduler(mode.slice(0,-9)):mode==='context-bandit'?context.scheduler(mode):baseline;}
async function walk({entry,scope='/',mode,readPage,seed=0,limit=10000,serialize=false}){
 let state={entry,scope,attempts:[],visited:[],pending:[{url:canonical(entry),group:'unknown',content_scope:false}],records:[],discovered:{[canonical(entry)]:0}};
 const p=policy(mode),base=new URL(entry),started=performance.now();
 while(state.pending.length&&state.attempts.length<limit){
  const first=state.pending[0].url,index=p.choose(state,mode);assert(index>=0&&index<state.pending.length);
  const next=state.pending.splice(index,1)[0];if((state.attempts.length+1)%5===0&&mode!=='fifo')assert.equal(next.url,first,'FIFO floor changed');
  const page=await readPage(next.url),profile=page.status===200?page.profile:null;
  state.attempts.push(next.url);state.visited.push(next.url);state.records.push({url:next.url,status:page.status,request:state.attempts.length});
  const links=page.status===200?(page.links||profile.links):[],ordered=seed?shuffle(links,seed^hash(next.url)):links,added=[];
  for(const link of ordered){
   if(!inScope(link.url,base,scope))continue;const url=canonical(link.url);if(state.visited.includes(url)||state.pending.some(p=>p.url===url))continue;
   const detail=profile.links.find(l=>{try{return canonical(l.url)===url;}catch{return false;}});
   state.pending.push({...link,...detail,url});state.discovered[url]=state.attempts.length;added.push(url);
  }
  p.feedback(state,next,profile,added);
  if(serialize)state=JSON.parse(JSON.stringify(state));
 }
 state.elapsed_ms=performance.now()-started;return state;
}
async function main(out='.runtime/frontier-corridor-v1'){
 assert(!fs.existsSync(out),'Use a fresh output directory');fs.mkdirSync(out);
 const inputRoot='.runtime/navigation-trial-v1',mixedRoot='.runtime/frontier-four-v1';
 const oldIds=['dev-101','dev-102','dev-103','confirmation-201','confirmation-202','confirmation-203'];
 const files=[__filename,'agent/experiments/frontier-corridor.cjs','agent/experiments/frontier-corridor.test.cjs','agent/experiments/frontier-context.cjs','agent/experiments/navigation-path.cjs','agent/experiments/navigation.cjs','agent/src/core/frontier.cjs','agent/src/core/collect.cjs','agent/src/core/scan.cjs','docs/frontier-corridor-plan.md','test-set-v4/private/labels.json',path.join(inputRoot,'orders.json'),...oldIds.map(id=>path.join(inputRoot,id+'-snapshot.json')),...['mixed-0','mixed-1'].flatMap(id=>[path.join(mixedRoot,id+'.json'),path.join(mixedRoot,id+'-gold.json')])];
 const manifest=Object.fromEntries(files.map(f=>[f,sha(f)]));atomic(out,'manifest.json',manifest);
 global.fetch=()=>{throw Error('Network disabled for offline comparison');};
 const gold=read('test-set-v4/private/labels.json'),historical=read(path.join(inputRoot,'orders.json'));
 const sites=oldIds.map(id=>{const s=read(path.join(inputRoot,id+'-snapshot.json'));return {id,split:s.split,entry:s.entry,scope:s.scope,pages:Object.fromEntries(Object.entries(s.pages).map(([u,p])=>[u,{status:p.status,profile:p}])),labels:gold[id].cases,budgets:[20,50,100],modes:['fifo','bandit','bandit-path','bandit-corridor']};});
 for(const id of ['mixed-0','mixed-1']){const d=read(path.join(mixedRoot,id+'.json'));sites.push({id,split:'mixed',entry:d.entry,scope:'/',pages:Object.fromEntries(d.snapshot.pages.map(p=>[canonical(p.url),{status:200,profile:p.navigation.profile,links:p.navigation.links}])),labels:read(path.join(mixedRoot,id+'-gold.json')),budgets:[12,18,24],modes:['fifo','bandit','bandit-path','bandit-corridor','context-bandit','context-bandit-corridor']});}
 const rows=[],runs=[];let parity=0,prefix=0;
 for(const site of sites){const {labels,pages,...meta}=site,options={entry:site.entry,scope:site.scope,readPage:async url=>structuredClone(pages[url]||{status:404})};
  for(const seed of [0,11,23,37,51])for(const mode of site.modes){
   const s=await walk({...options,mode,seed});assert.deepEqual([...s.visited].sort(),Object.keys(pages).sort(),'Reachable set changed');
   assert.equal(new Set(s.visited).size,s.visited.length);
   if(site.split!=='mixed'&&['fifo','bandit'].includes(mode)){
    const old=historical.find(r=>r.site===site.id&&r.seed===seed&&r.mode===mode&&r.experiment==='policy');assert.deepEqual(s.visited,old.visits.map(v=>v.url));parity++;
   }
   if(mode==='bandit-path'){
    const old=await simulatePath({entry:site.entry,scope:site.scope,seed,read:async url=>{const p=pages[url];return {...p.profile,status:200,
     fingerprint:p.profile.fingerprint||crypto.createHash('sha256').update(p.profile.body||'').digest('hex'),
     links:(p.links||p.profile.links).map(l=>({...l,...p.profile.links.find(x=>canonical(x.url)===canonical(l.url))}))};}});
    assert.deepEqual(s.visited,old.visits.map(v=>v.url));parity++;
   }
   if(site.split==='mixed'&&seed===0&&['fifo','bandit','context-bandit'].includes(mode)){
    const old=read(path.join(mixedRoot,site.id+'-'+mode,'checkpoint.json')).state;assert.deepEqual(s.visited.slice(0,12),old.pages.map(p=>canonical(p.url)));parity++;
   }
   if(mode.endsWith('-corridor')){
    const probes=s.corridor_trace.filter(v=>v.kind==='corridor');assert(probes.every(v=>v.attempt%5===4));assert(probes.length<=Math.ceil(s.visited.length/5));
    const serial=await walk({...options,mode,seed,serialize:true});assert.deepEqual(s.visited,serial.visited);
   }
   runs.push({site:site.id,split:site.split,mode,seed,order:s.records,trace:s.corridor_trace||[],discovered:s.discovered,elapsed_ms:s.elapsed_ms});
   // Gold is consulted only after the scheduler has finished.
   const ads=labels.filter(g=>g.is_ad),deep=ads.filter(g=>['deep','deep_user'].includes(g.category));
   for(const budget of site.budgets){const visited=new Set(s.records.filter(v=>v.request<=budget&&v.status===200).map(v=>v.url));
    const baseMode=mode.startsWith('context-')?'context-bandit':'bandit';
    const baseRun=runs.find(r=>r.site===site.id&&r.seed===seed&&r.mode===baseMode);
    const baseSeen=new Set((baseRun?.order||[]).filter(v=>v.request<=budget).map(v=>v.url));
    const reached=ads.filter(g=>visited.has(canonical(g.page))),deepReached=deep.filter(g=>visited.has(canonical(g.page)));
    rows.push({site:site.id,split:site.split,mode,seed,budget,total:ads.length,reached:reached.length,deep:deepReached.length,deep_total:deep.length,
     lost:ads.filter(g=>baseSeen.has(canonical(g.page))&&!visited.has(canonical(g.page))).map(g=>({page:g.page,location:g.location||g.selector,category:g.category})),
     waiting:ads.filter(g=>!visited.has(canonical(g.page))&&s.discovered[canonical(g.page)]<=budget).length,
     undiscovered:ads.filter(g=>!(s.discovered[canonical(g.page)]<=budget)).length,
     first_deep:s.records.find(v=>deep.some(g=>canonical(g.page)===v.url))?.request??null});
    if(mode.endsWith('-corridor')){const short=await walk({...options,mode,seed,limit:budget});assert.deepEqual(short.visited,s.visited.slice(0,budget));prefix++;}
   }
  }
  console.log(JSON.stringify({completed:site.id,runs:runs.length}));
 }
 const aggregate=[];
 for(const split of ['dev','confirmation','mixed'])for(const mode of [...new Set(rows.filter(r=>r.split===split).map(r=>r.mode))])for(const budget of [...new Set(rows.filter(r=>r.split===split).map(r=>r.budget))]){
  const rs=rows.filter(r=>r.split===split&&r.mode===mode&&r.budget===budget);aggregate.push({split,mode,budget,n:rs.length,reached:mean(rs.map(r=>r.reached)),recall:mean(rs.map(r=>r.reached/r.total)),deep:mean(rs.map(r=>r.deep)),deep_recall:mean(rs.map(r=>r.deep/r.deep_total)),lost:mean(rs.map(r=>r.lost.length)),waiting:mean(rs.map(r=>r.waiting)),undiscovered:mean(rs.map(r=>r.undiscovered)),first_deep:mean(rs.map(r=>r.first_deep))});
 }
 const oldGate=['dev','confirmation'].map(split=>{
  const delta=aggregate.find(r=>r.split===split&&r.mode==='bandit-corridor'&&r.budget===50).deep_recall-aggregate.find(r=>r.split===split&&r.mode==='bandit'&&r.budget===50).deep_recall;
  const siteDeltas=sites.filter(s=>s.split===split).flatMap(s=>s.budgets.map(b=>mean(rows.filter(r=>r.site===s.id&&r.budget===b&&r.mode==='bandit-corridor').map(r=>r.reached))-mean(rows.filter(r=>r.site===s.id&&r.budget===b&&r.mode==='bandit').map(r=>r.reached))));
  return {split,deep_gain:delta,deep_pass:delta>=.1,whole_nondecrease:siteDeltas.every(d=>d>=0),retained:rows.filter(r=>r.split===split&&r.mode==='bandit-corridor'&&r.budget===50).every(r=>!r.lost.length)};
 });
 const mr=rows.filter(r=>r.split==='mixed'&&r.mode==='context-bandit-corridor');
 const mixedGate={whole_nondecrease:mr.every(r=>r.reached>=rows.find(b=>b.site===r.site&&b.seed===r.seed&&b.budget===r.budget&&b.mode==='context-bandit').reached),retained:mr.every(r=>!r.lost.length),deep_gain:aggregate.some(r=>r.split==='mixed'&&r.mode==='context-bandit-corridor'&&r.deep>aggregate.find(b=>b.split==='mixed'&&b.mode==='context-bandit'&&b.budget===r.budget).deep)};
 for(const [f,h]of Object.entries(manifest))assert.equal(sha(f),h,'Frozen input changed');
 const summary={runs:runs.length,parity_checks:parity,prefix_checks:prefix,aggregate,oldGate,mixedGate,old_pass:oldGate.every(g=>g.deep_pass&&g.whole_nondecrease&&g.retained),mixed_pass:Object.values(mixedGate).every(Boolean),api_calls:0,tokens:0};
 atomic(out,'runs.json',runs);atomic(out,'rows.json',rows);atomic(out,'summary.json',summary);console.log(JSON.stringify({out,...summary},null,2));
}
if(require.main===module)main(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={walk,policy};
