// Stage-5 offline scheduler. No labels, destination content, or LLM responses enter this module.
const assert=require('node:assert/strict');
const {canonical,inScope}=require('../src/core/collect.cjs');

function priority(link){
  const url=new URL(link.url);
  const text=/게시판|게시글|댓글|문의|의견|참여|\b(?:forum|community|discussion|comment|post)s?\b/i.test(link.text||'');
  const route=/(?:^|\/)(?:board|bbs|forum|posts?|articles?|comments?|repl(?:y|ies)|community)(?:\/|\.|$)/i.test(url.pathname)||
    [...url.searchParams.keys()].some(k=>/^(board|bbs)$/i.test(k));
  return 2*Number(text)+Number(route)+Number(link.content_scope===true);
}

function replay(graph,mode){
  assert(['fifo','priority'].includes(mode));
  const entry=new URL(graph.entry_url),pages=new Map();
  assert(inScope(entry.href,entry,graph.scope),'Invalid scope');
  for(const page of graph.pages){
    const key=canonical(page.url);assert(!pages.has(key),'Duplicate graph page');pages.set(key,page);
  }
  const pending=new Map([[canonical(entry.href),{score:0,discovered_at:0}]]),visited=new Set(),order=[];
  let discoveries=1;
  while(pending.size){
    // ponytail: O(V^2) replay for the 101-page diagnostic; use a heap only if larger graphs need it.
    const oldest=mode==='fifo'||(order.length+1)%4===0;
    const [url,item]=[...pending].sort((a,b)=>(oldest?0:b[1].score-a[1].score)||a[1].discovered_at-b[1].discovered_at)[0];
    const page=pages.get(url);assert(page,'Missing reachable page: '+url);
    pending.delete(url);visited.add(url);
    order.push({url,score:item.score,selection:oldest?'oldest':'priority'});
    // Only links of the page just visited become visible here.
    for(const link of page.links){
      if(!inScope(link.url,entry,graph.scope))continue;
      const key=canonical(link.url);if(visited.has(key))continue;
      const score=mode==='priority'?priority(link):0;
      if(pending.has(key))pending.get(key).score=Math.max(pending.get(key).score,score);
      else pending.set(key,{score,discovered_at:discoveries++});
    }
  }
  return order;
}
module.exports={priority,replay};
