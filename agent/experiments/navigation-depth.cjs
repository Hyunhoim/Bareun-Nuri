// Diagnostic only: labels and the full graph are used after the scheduler runs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {simulate,shuffle,hash}=require('./navigation.cjs');
const {priority}=require('./priority.cjs');
const {canonical,inScope}=require('../src/core/collect.cjs');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
function graphFor(s){
 const links=Object.fromEntries(Object.entries(s.pages).map(([u,p])=>[u,p.links.filter(l=>inScope(l.url,new URL(s.entry),s.scope)).map(l=>canonical(l.url))]));
 const distance=new Map([[canonical(s.entry),0]]),queue=[canonical(s.entry)];
 for(let i=0;i<queue.length;i++)for(const v of links[queue[i]])if(!distance.has(v)){assert(links[v]);distance.set(v,distance.get(queue[i])+1);queue.push(v);}
 assert.equal(distance.size,Object.keys(s.pages).length,'Unreachable fixture page');
 return {links,distance};
}
function trace(s,run){
 const nodes=new Map([[canonical(s.entry),{url:canonical(s.entry),parent:null,discovered:0,group:'unknown',score:0}]]),pending=new Map(nodes),arms=new Map(),cuts={},steps=[];
 for(const v of run.visits){
  const p=pending.get(v.url);assert(p,'Visited before discovery');assert.equal(p.group,v.group);
  const ucb=x=>{const a=arms.get(x.group);return !a?.n?Infinity:a.sum/a.n+Math.sqrt(2*Math.log(v.request+1)/a.n);};
  if(run.mode==='bandit'){
   const expected=v.request%5===0?[...pending.values()][0]:[...pending.values()].reduce((a,b)=>ucb(b)>ucb(a)?b:a);
   assert.equal(expected.url,v.url,'Independent UCB/tie/FIFO trace mismatch');
  }
  const groups=[...new Set([...pending.values()].map(x=>x.group))].map(group=>({group,pending:[...pending.values()].filter(x=>x.group===group).length,...(arms.get(group)||{n:0,sum:0}),ucb:Number.isFinite(ucb({group}))?ucb({group}):'untried'}));
  steps.push({request:v.request,url:v.url,choice:v.choice,group:v.group,reward:v.reward,groups});
  p.visited=v.request;p.reward=v.reward;pending.delete(v.url);
  const a=arms.get(v.group)||{n:0,sum:0};arms.set(v.group,{n:a.n+1,sum:a.sum+v.reward});
  const links=run.seed?shuffle(s.pages[v.url].links,run.seed^hash(v.url)):s.pages[v.url].links;
  for(const l of links){
   if(!inScope(l.url,new URL(s.entry),s.scope))continue;
   const u=canonical(l.url);if(nodes.get(u)?.visited)continue;
   if(nodes.has(u)){nodes.get(u).score=Math.max(nodes.get(u).score,priority(l));continue;}
   const n={url:u,parent:v.url,discovered:v.request,group:l.group||'unknown',score:priority(l)};nodes.set(u,n);pending.set(u,n);
  }
  if([20,50,100].includes(v.request))cuts[v.request]=[...pending.values()].map(n=>({...n}));
 }
 assert.equal(pending.size,0);
 return {nodes,cuts,steps};
}
function classify(n,b){return n?.visited<=b?'visited':n?.discovered<=b?'waiting':'undiscovered';}
function chain(nodes,u){const result=[];for(let n=nodes.get(u);n;n=nodes.get(n.parent)){assert(result.length<=nodes.size);result.unshift({...n});}return result;}
function summarize(rows){
 const result=[];
 for(const split of ['dev','confirmation'])for(const mode of ['fifo','priority','hybrid','bandit'])for(const budget of [20,50,100]){
  const rs=rows.filter(r=>r.split===split&&r.mode===mode),items=rs.flatMap(r=>r.targets.map(t=>({...t,state:classify(t,budget)})));
  result.push({split,mode,budget,runs:rs.length,deep_ad_observations:items.length,
   visited:items.filter(t=>t.state==='visited').length,waiting:items.filter(t=>t.state==='waiting').length,undiscovered:items.filter(t=>t.state==='undiscovered').length,
   first_deep_ad_request:mean(rs.map(r=>r.first_deep_ad)),first_deep_page_request:mean(rs.map(r=>r.first_deep_page)),
   first_deep_ad_range:[Math.min(...rs.map(r=>r.first_deep_ad)),Math.max(...rs.map(r=>r.first_deep_ad))]});
 }
 return result;
}
async function main(){
 const source=process.argv[2]||'.runtime/navigation-trial-v1',out=process.argv[3]||'.runtime/navigation-depth-v1';
 assert(!fs.existsSync(out),'Choose a new diagnostic output directory');
 const manifest=read(path.join(source,'manifest.json'));
 for(const [p,h]of Object.entries(manifest.files))assert.equal(sha(p),h,'Frozen source changed: '+p);
 const orders=read(path.join(source,'orders.json')).filter(r=>r.experiment==='policy'&&!r.site.startsWith('legacy'));
 const gold=read('test-set-v4/private/labels.json'),rows=[],rewardContrast=[],sites=[];
 const inputFiles=['docs/navigation-depth-diagnostic-plan.md',__filename,path.join(source,'orders.json'),'test-set-v4/private/labels.json'];
 // Prevent accidental paid/network work even if a future diagnostic is modified.
 global.fetch=()=>{throw Error('Network forbidden in depth diagnostic');};
 for(const id of [...new Set(orders.map(r=>r.site))]){
  const snapshotPath=path.join(source,id+'-snapshot.json');inputFiles.push(snapshotPath);
  const s=read(snapshotPath),graph=graphFor(s),positives=gold[id].cases.filter(c=>c.is_ad),deep=positives.filter(c=>c.category==='deep_user');
  const deepPages=new Set(gold[id].pages.filter(p=>p.category==='deep_user').map(p=>canonical(p.url)));
  const histogram={};for(const d of graph.distance.values())histogram[d]=(histogram[d]||0)+1;
  sites.push({id,split:s.split,pages:graph.distance.size,depth_histogram:histogram,deep_ad_depths:deep.map(c=>graph.distance.get(canonical(c.page)))});
  for(const run of orders.filter(r=>r.site===id)){
   const lookup=async url=>structuredClone(s.pages[canonical(url)]);
   const replay=await simulate({entry:s.entry,scope:s.scope,mode:run.mode,seed:run.seed,read:lookup});
   assert.deepEqual(replay.events,run.events,'Frozen run did not reproduce');
   assert.deepEqual(replay.visits.map(({cpu_ms,...v})=>v),run.visits.map(({cpu_ms,...v})=>v));
   const tr=trace(s,run),targets=deep.map(c=>{
    const u=canonical(c.page),n=tr.nodes.get(u),route=chain(tr.nodes,u);
    return {...n,shortest_depth:graph.distance.get(u),chain:route.map(p=>({...p,title:s.pages[p.url].title,depth:graph.distance.get(p.url)})),
     cuts:Object.fromEntries([20,50,100].map(b=>{
      const blocker=route.find(p=>p.visited>b),state=classify(n,b);
      return [b,{state,blocker:blocker?{...blocker,title:s.pages[blocker.url].title,depth:graph.distance.get(blocker.url),queue_wait_at_cut:b-blocker.discovered}:null}];
     }))};
   });
   rows.push({site:id,split:s.split,mode:run.mode,seed:run.seed,first_deep_ad:Math.min(...targets.map(t=>t.visited)),
    first_deep_page:Math.min(...run.visits.filter(v=>deepPages.has(v.url)).map(v=>v.request)),targets,cuts:tr.cuts,steps:tr.steps});
   if(run.mode==='bandit'){
    const zero=await simulate({entry:s.entry,scope:s.scope,mode:'bandit',seed:run.seed,read:async url=>({...await lookup(url),detail:false})});
    assert(zero.visits.every(v=>v.reward===0));assert.deepEqual(zero.visits.map(v=>v.url).sort(),run.visits.map(v=>v.url).sort());
    for(const budget of [20,50,100]){
     const count=(vs,cs)=>cs.filter(c=>vs.some(v=>v.request<=budget&&v.url===canonical(c.page))).length;
     rewardContrast.push({site:id,split:s.split,seed:run.seed,budget,original_deep:count(run.visits,deep),zero_deep:count(zero.visits,deep),
      original_all:count(run.visits,positives),zero_all:count(zero.visits,positives),zero_first_deep:zero.visits.find(v=>deep.some(c=>canonical(c.page)===v.url)).request});
    }
   }
  }
 }
 assert.equal(rows.length,120);assert.equal(rewardContrast.length,90);
 assert.equal(classify({discovered:51,visited:70},50),'undiscovered');assert.equal(classify({discovered:50,visited:70},50),'waiting');assert.equal(classify({discovered:10,visited:50},50),'visited');
 const contrast=[];
 for(const split of ['dev','confirmation'])for(const budget of [20,50,100]){
  const rs=rewardContrast.filter(r=>r.split===split&&r.budget===budget);contrast.push({split,budget,...Object.fromEntries(['original_deep','zero_deep','original_all','zero_all','zero_first_deep'].map(k=>[k,mean(rs.map(r=>r[k]))]))});
 }
 for(const [p,h]of Object.entries(manifest.files))assert.equal(sha(p),h,'Frozen source changed during diagnostic');
 fs.mkdirSync(out);
 const evidence={created_at:new Date().toISOString(),original_manifest_verified:Object.keys(manifest.files).length,files:Object.fromEntries(inputFiles.map(p=>[p,sha(p)])),reproduced_runs:rows.length,reward_zero_runs:30,external_calls:0};
 fs.writeFileSync(path.join(out,'traces.json'),JSON.stringify(rows));fs.writeFileSync(path.join(out,'reward-contrast.json'),JSON.stringify(rewardContrast,null,2));
 const summary={sites,states:summarize(rows),reward_contrast:contrast,audit:evidence};fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify({output:out,states_at_50:summary.states.filter(r=>r.budget===50),reward_contrast:contrast,audit:evidence},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={classify,graphFor,trace};
