// Experimental continuation of observed single-successor paths; no gold/URL heuristics.
const assert=require('node:assert/strict');
const {canonical}=require('../src/core/collect.cjs');
const baseline=require('../src/core/frontier.cjs'),context=require('./frontier-context.cjs');
function scheduler(baseMode='context-bandit'){
 assert(['bandit','context-bandit'].includes(baseMode));
 const base=baseMode==='bandit'?baseline:context.scheduler(baseMode);
 return {id:baseMode+'-corridor',choose(state){
  const proposed=base.choose(state,baseMode),n=state.attempts.length+1;
  const available=new Set(state.pending.map(p=>p.url));
  state.corridors=(state.corridors||[]).filter(c=>available.has(c.url));
  const selected=n%5===4&&state.corridors.length?state.pending.findIndex(p=>p.url===state.corridors[0].url):proposed;
  const resumed=n%5===4&&state.corridors.length>0;
  state.corridor_selection=resumed?state.pending[selected].url:null;
  (state.corridor_trace??=[]).push({attempt:n,url:state.pending[selected].url,proposal:state.pending[proposed].url,kind:resumed?'corridor':n%5===0?'fifo':'bandit'});
  if(resumed&&baseMode==='context-bandit'){
   const last=state.policy_trace.at(-1);Object.assign(last,{proposal_url:last.url,url:state.pending[selected].url,selection:'corridor'});
   delete last.mean;delete last.uncertainty;delete last.score;
  }
  return selected;
 },feedback(state,next,profile,newLinks){
  base.feedback(state,next,profile,newLinks);
  const queue=state.corridors??=[],index=queue.findIndex(c=>c.url===next.url);
  const prior=index<0?null:queue.splice(index,1)[0];
  const available=new Set(state.pending.map(p=>p.url));
  const successors=[];
  for(const link of profile?.links||[]){let url;try{url=canonical(link.url);}catch{continue;}if(available.has(url)&&!successors.includes(url))successors.push(url);}
  if(successors.length===1){
   const url=successors[0];
   if(!queue.some(c=>c.url===url)){
    const turns=(prior?.turns||0)+Number(state.corridor_selection===next.url);
    const candidate={url,parent:next.url,started_at:prior?.started_at??state.attempts.length,turns:turns>=4?0:turns};
    // ponytail: rotate after four probe turns; global crawl budgets bound endless URL chains.
    if(prior&&turns<4)queue.splice(Math.min(index,queue.length),0,candidate);else queue.push(candidate);
   }
  }
  state.corridor_selection=null;
 }};
}
module.exports={scheduler};
