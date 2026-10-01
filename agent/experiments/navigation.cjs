// Experimental online scheduler: receives only the page it requested, never the graph or gold.
const assert=require('node:assert/strict');
const {canonical,inScope}=require('../src/core/collect.cjs');
const {priority}=require('./priority.cjs');
function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function shuffle(xs,seed){const a=[...xs],r=rng(seed);for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
// Executed in a browser. Tags/roles are observable; arbitrary IDs/classes never identify a link group.
function inspectPage(){
 const main=document.querySelector('main')||document.body;
 const paragraphs=[...main.querySelectorAll('p,blockquote,[role="comment"]')].filter(e=>!e.closest('nav,header,footer'));
 const body=paragraphs.map(e=>e.textContent.trim()).filter(Boolean).join('\n');
 const detail=paragraphs.some(e=>e.textContent.trim().length>=40)&&
  (paragraphs.length>=2||!!main.querySelector('article,[role="article"],[role="comment"],time'));
 return {title:document.title,detail,body,links:[...document.querySelectorAll('a[href]')].map(a=>{
  const tags=[];for(let el=a;el&&tags.length<5;el=el.parentElement)tags.unshift(el.tagName.toLowerCase()+(el.getAttribute('role')?'['+el.getAttribute('role')+']':''));
  const content_scope=!!a.closest('article,[role="article"],[role="comment"],tbody');
  return {url:a.href,text:a.textContent.trim(),content_scope,group:tags.join('>')+'|'+Number(content_scope)};
 })};
}
function inspectXML(body){
 if(/<!DOCTYPE|<!ENTITY/i.test(body))throw Error('DTD/entity not supported');
 const doc=new DOMParser().parseFromString(body,'application/xml');
 if(doc.querySelector('parsererror'))throw Error('Invalid sitemap XML');
 const type=doc.documentElement.localName;if(!['sitemapindex','urlset'].includes(type))throw Error('Invalid sitemap root');
 return {type,locations:[...doc.getElementsByTagNameNS('*','loc')].map(n=>n.textContent.trim())};
}
async function simulate({entry,scope='/',mode='fifo',read,seed=0,sitemap=false,maxRequests=10000}){
 assert(['fifo','priority','hybrid','bandit'].includes(mode));assert(!sitemap||mode==='fifo');assert(Number.isInteger(maxRequests)&&maxRequests>0);
 const base=new URL(entry),pending=new Map(),visited=new Set(),areaVisits=new Map(),arms=new Map(),bodies=new Set();
 const events=[],visits=[],steps=[];let serial=0,sitemapTurn=false;
 const add=(link,parent,source='html')=>{
  if(!inScope(link.url,base,scope))return;const key=canonical(link.url);if(visited.has(key))return;
  const score=priority(link),area=!parent||parent.url===canonical(entry)?key:parent.area;
  if(pending.has(key)){const p=pending.get(key);p.score=Math.max(p.score,score);p.sources.add(source);return;}
  pending.set(key,{url:key,score,area,group:link.group||'unknown',content_scope:!!link.content_scope,serial:serial++,sources:new Set([source])});
 };
 add({url:entry},null);
 async function request(url,kind){
  if(events.length>=maxRequests)return null;
  const p=await read(url,kind);assert(p&&Number.isInteger(p.status));
  events.push({url,kind,status:p.status,bytes:p.bytes||0});return p;
 }
 async function maps(){
  const robots=await request(new URL('/robots.txt',base).href,'robots');if(!robots||robots.status!==200||robots.bytes>1024*1024)return;
  const xmlQueue=robots.body.split(/\r?\n/).map(l=>l.match(/^\s*Sitemap:\s*(\S+)\s*$/i)?.[1]).filter(Boolean),seen=new Set();let metadata=1,count=0;
  while(xmlQueue.length&&metadata<4&&count<5000){
   const url=xmlQueue.shift();if(!inScope(url,base,'/')||seen.has(canonical(url)))continue;seen.add(canonical(url));
   const p=await request(url,'xml');if(!p)break;metadata++;
   if(p.status!==200||p.bytes>1024*1024||p.error||!p.xml)continue;
   const locations=seed?shuffle(p.xml.locations,seed^hash(url)):p.xml.locations;
   if(p.xml.type==='sitemapindex')xmlQueue.push(...locations);
   else for(const target of locations){if(count++>=5000)break;add({url:target},null,'sitemap');}
  }
 }
 while(pending.size&&events.length<maxRequests){
  const start=performance.now(),list=[...pending.values()];let next=list[0],choice='fifo';
  if(sitemap&&visits.length){
   const preferred=sitemapTurn?'sitemap':'html';next=list.find(p=>p.sources.has(preferred))||next;sitemapTurn=!sitemapTurn;choice=preferred;
  }else if(mode==='priority'&&(visits.length+1)%4!==0){next=list.reduce((a,b)=>b.score>a.score?b:a);choice='priority';}
  else if(mode==='hybrid'&&(visits.length+1)%5!==0){
   const discover=(visits.length+1)%5===4;
   let pool=list.filter(p=>discover?!p.content_scope:p.score>0);if(!pool.length)pool=list;
   const areas=[...new Set(pool.map(p=>p.area))];
   const area=areas.reduce((a,b)=>(areaVisits.get(b)||0)<(areaVisits.get(a)||0)?b:a);
   const candidates=pool.filter(p=>p.area===area);
   next=discover?candidates[0]:candidates.reduce((a,b)=>b.score>a.score?b:a);choice=discover?'discover-area':'focus-area';
  }else if(mode==='bandit'&&(visits.length+1)%5!==0){
   const score=p=>{const a=arms.get(p.group);return !a?.n?Infinity:a.sum/a.n+Math.sqrt(2*Math.log(visits.length+2)/a.n);};
   next=list.reduce((a,b)=>score(b)>score(a)?b:a);choice='ucb';
  }
  const cpu_ms=performance.now()-start;
  pending.delete(next.url);visited.add(next.url);const p=await request(next.url,'page');if(!p)break;
  const reward=p.status===200&&p.detail&&!bodies.has(p.fingerprint)?1:0;
  if(p.status===200)bodies.add(p.fingerprint);
  const arm=arms.get(next.group)||{n:0,sum:0};arm.n++;arm.sum+=reward;arms.set(next.group,arm);
  areaVisits.set(next.area,(areaVisits.get(next.area)||0)+1);
  visits.push({url:next.url,status:p.status,request:events.length,choice,area:next.area,group:next.group,reward,cpu_ms});
  steps.push({request:events.length,pending:pending.size});
  if(p.status===200){const links=seed?shuffle(p.links,seed^hash(next.url)):p.links;for(const link of links)add(link,next);}
  if(sitemap&&visits.length===1)await maps();
 }
 return {events,visits,pending:pending.size,complete:!pending.size,arms:[...arms],steps};
}
module.exports={simulate,inspectPage,inspectXML,rng,shuffle,hash};
