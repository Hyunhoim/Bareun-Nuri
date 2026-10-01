// The historical UCB and bounded-path rules, now shared by the scan runner.
const crypto=require('node:crypto');
function inspectPage(){
 const main=document.querySelector('main')||document.body;
 const paragraphs=[...main.querySelectorAll('p,blockquote,[role="comment"]')].filter(e=>!e.closest('nav,header,footer'));
 return {detail:paragraphs.some(e=>e.textContent.trim().length>=40)&&(paragraphs.length>=2||!!main.querySelector('article,[role="article"],[role="comment"],time')),
  body:paragraphs.map(e=>e.textContent.trim()).filter(Boolean).join('\n'),
  links:[...document.querySelectorAll('a[href]')].map(a=>{const tags=[];
   for(let e=a;e&&tags.length<5;e=e.parentElement)tags.unshift(e.tagName.toLowerCase()+(e.getAttribute('role')?'['+e.getAttribute('role')+']':''));
   const content_scope=!!a.closest('article,[role="article"],[role="comment"],tbody');
   return {url:a.href,text:a.textContent.trim(),content_scope,group:tags.join('>')+'|'+Number(content_scope)};})};
}
function choose(state,mode){
 const list=state.pending,count=state.attempts?.length??state.visited.length,n=count+1,slot=n%10;
 const ucb=p=>{const a=state.arms?.[p.group||'unknown'];return !a?.n?Infinity:a.sum/a.n+Math.sqrt(2*Math.log(count+2)/a.n);};
 let next=mode==='fifo'||n%5===0?list[0]:list.reduce((a,b)=>ucb(b)>ucb(a)?b:a);
 if(mode==='bandit-path'&&slot===1){next=list.find(p=>!p.content_scope)||next;state.pathActive=!next.content_scope;}
 else if(mode==='bandit-path'&&state.pathActive&&(slot===2||slot===3)){
  const child=(state.pathChildren||[]).map(u=>list.find(p=>p.url===u)).find(Boolean);state.pathActive=!!child;if(child)next=child;
 }else state.pathActive=false;
 return list.indexOf(next);
}
function feedback(state,next,profile,newLinks){
 state.arms??={};state.bodies??=[];
 const fingerprint=profile?.fingerprint||crypto.createHash('sha256').update(profile?.body||'').digest('hex');
 const reward=profile?.detail&&!state.bodies.includes(fingerprint)?1:0;
 if(profile)state.bodies.push(fingerprint);
 const a=state.arms[next.group||'unknown']??={n:0,sum:0};a.n++;a.sum+=reward;
 state.pathChildren=profile&&!profile.detail?newLinks:[];
}
module.exports={inspectPage,choose,feedback};
