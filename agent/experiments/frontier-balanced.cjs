// Experimental schedulers; grouping never changes request or deduplication URLs.
const assert=require('node:assert/strict'),baseline=require('../src/core/frontier.cjs'),context=require('./frontier-context.cjs');
const {canonical,inScope}=require('../src/core/collect.cjs'),{shuffle,hash}=require('./navigation.cjs');
function template(value){const u=new URL(value),mask=s=>/^\d+$/.test(s)||/^[a-f\d]{12,}$/i.test(s)||/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(s)?'{id}':s;
 return u.origin+u.pathname.split('/').map(mask).join('/')+'?'+[...u.searchParams].sort(([a,v],[b,w])=>a.localeCompare(b)||v.localeCompare(w)).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(mask(v))).join('&');}
function scheduler(mode){
 if(mode==='fifo')return {id:mode,...baseline};if(mode==='context-bandit')return context.scheduler(mode);
 assert(['depth-fifo','template-fifo'].includes(mode));
 return {id:mode,choose(state){
  if(mode==='depth-fifo'){const ds=[...new Set(state.pending.map(p=>state.depths?.[p.url]??0))].sort((a,b)=>a-b),d=ds.find(d=>d>(state.depth_cursor??-1))??ds[0];return state.pending.findIndex(p=>(state.depths?.[p.url]??0)===d);}
  const available=new Set(state.pending.map(p=>template(p.url))),groups=[...(state.template_groups||[])];for(const key of available)if(!groups.includes(key))groups.push(key);
  const last=groups.indexOf(state.template_cursor);for(let n=1;n<=groups.length;n++){const key=groups[(last+n)%groups.length];if(available.has(key))return state.pending.findIndex(p=>template(p.url)===key);}throw Error('Empty frontier');
 },feedback(state,next,profile,newLinks){
  if(mode==='depth-fifo'){state.depths??={[canonical(state.entry)]:0};const d=state.depths[next.url]??0;state.depth_cursor=d;for(const u of newLinks)state.depths[u]=d+1;}
  else{state.template_groups??=[];for(const p of [next,...state.pending]){const key=template(p.url);if(!state.template_groups.includes(key))state.template_groups.push(key);}state.template_cursor=template(next.url);}
  baseline.feedback(state,next,profile,newLinks);
 }};
}
// Same frontier transition as core scan; readPage exposes only the selected document.
async function walk({entry,mode,readPage,seed=0,limit=10000,state,serialize=false}){
 const p=scheduler(mode),base=new URL(entry),start=performance.now();state=state?structuredClone(state):{entry,scope:'/',mode,seed,attempts:[],visited:[],pending:[{url:canonical(entry),group:'unknown',content_scope:false}],records:[],discovered:{[canonical(entry)]:0}};
 assert.equal(state.mode,mode);assert.equal(state.seed,seed);
 while(state.pending.length&&state.attempts.length<limit){
  const index=p.choose(state,mode);assert(index>=0&&index<state.pending.length);const next=state.pending.splice(index,1)[0],page=await readPage(next.url),profile=page.status===200?page.profile:null;
  state.attempts.push(next.url);state.visited.push(next.url);state.records.push({url:next.url,status:page.status,request:state.attempts.length});
  const links=profile?(page.links||profile.links):[],ordered=seed?shuffle(links,seed^hash(next.url)):links,added=[];
  for(const link of ordered){if(!inScope(link.url,base,'/'))continue;const url=canonical(link.url);if(state.visited.includes(url)||state.pending.some(p=>p.url===url))continue;
   const detail=profile.links.find(l=>canonical(l.url)===url);state.pending.push({...link,...detail,url});state.discovered[url]=state.attempts.length;added.push(url);
  }
  p.feedback(state,next,profile,added);if(serialize)state=JSON.parse(JSON.stringify(state));
 }
 state.elapsed_ms=(state.elapsed_ms||0)+performance.now()-start;return state;
}
module.exports={template,scheduler,walk};
