// Isolated Bandit experiment; unchanged navigation.cjs remains the historical baseline.
const assert=require('node:assert/strict');
const {canonical,inScope}=require('../src/core/collect.cjs');
const {priority}=require('./priority.cjs');
const {shuffle,hash}=require('./navigation.cjs');
async function simulatePath({entry,scope='/',mode='bandit',read,seed=0,maxRequests=10000,continuePath=true}){
 assert.equal(mode,'bandit');assert(Number.isInteger(maxRequests)&&maxRequests>0);
 const base=new URL(entry),pending=new Map(),visited=new Set(),arms=new Map(),bodies=new Set(),events=[],visits=[],steps=[];
 let serial=0,active=false,children=[];
 function add(link,parent){
  if(!inScope(link.url,base,scope))return;const url=canonical(link.url);if(visited.has(url))return;
  if(pending.has(url)){pending.get(url).score=Math.max(pending.get(url).score,priority(link));return;}
  pending.set(url,{url,score:priority(link),area:!parent||parent.url===canonical(entry)?url:parent.area,
   group:link.group||'unknown',content_scope:!!link.content_scope,serial:serial++});
 }
 add({url:entry},null);
 while(pending.size&&events.length<maxRequests){
  const start=performance.now(),list=[...pending.values()],number=visits.length+1,slot=number%10;
  const ucb=p=>{const a=arms.get(p.group);return !a?.n?Infinity:a.sum/a.n+Math.sqrt(2*Math.log(visits.length+2)/a.n);};
  let next=number%5===0?list[0]:list.reduce((a,b)=>ucb(b)>ucb(a)?b:a),choice=number%5===0?'fifo':'ucb';
  if(continuePath&&slot===1){
   const candidate=list.find(p=>!p.content_scope);active=!!candidate;
   if(candidate){next=candidate;choice='path-start';}
  }else if(continuePath&&active&&(slot===2||slot===3)){
   const candidate=children.map(u=>pending.get(u)).find(Boolean);active=!!candidate;
   if(candidate){next=candidate;choice='path-follow';}
  }else active=false;
  const cpu_ms=performance.now()-start;pending.delete(next.url);visited.add(next.url);
  const p=await read(next.url,'page');assert(p&&Number.isInteger(p.status));
  events.push({url:next.url,kind:'page',status:p.status,bytes:p.bytes||0});
  const reward=p.status===200&&p.detail&&!bodies.has(p.fingerprint)?1:0;
  if(p.status===200)bodies.add(p.fingerprint);
  const arm=arms.get(next.group)||{n:0,sum:0};arm.n++;arm.sum+=reward;arms.set(next.group,arm);
  visits.push({url:next.url,status:p.status,request:events.length,choice,area:next.area,group:next.group,reward,cpu_ms});
  steps.push({request:events.length,pending:pending.size});
  const previous=new Set(pending.keys());
  if(p.status===200)for(const l of seed?shuffle(p.links,seed^hash(next.url)):p.links)add(l,next);
  children=p.status===200&&!p.detail?[...pending.keys()].filter(u=>!previous.has(u)):[];
 }
 return {events,visits,pending:pending.size,complete:!pending.size,arms:[...arms],steps};
}
module.exports={simulatePath};
