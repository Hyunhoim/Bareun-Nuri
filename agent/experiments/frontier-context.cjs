// Experimental link-level ridge predictor. No target-page or gold access.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const baseline=require('../src/core/frontier.cjs');
const D=55,ALPHA=.5;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),mv=(a,x)=>a.map(row=>dot(row,x));
function features(link){
 const c=link.context||{},text=String(link.text||'');
 const x=[1,Number(!!link.content_scope),Number(!!c.parent_detail),Math.min(text.length/100,1),Math.min((c.nearby||'').length/400,1),Math.min((c.siblings||0)/20,1),Math.min((c.outlinks||0)/100,1),...Array(48).fill(0)];
 for(const [channel,value] of [['a',text],['n',c.nearby||''],['h',c.heading||'']]){
  const chars=Array.from(value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').slice(0,400));
  const tokens=new Set(chars.slice(0,-1).map((v,i)=>channel+v+chars[i+1]));
  for(const token of tokens){let h=2166136261;for(const ch of token)h=Math.imul(h^ch.codePointAt(0),16777619)>>>0;x[7+h%48]+=(h&256)?1:-1;}
 }
 const length=Math.sqrt(dot(x,x));return x.map(v=>v/length);
}
const initial=()=>({inverse:Array.from({length:D},(_,i)=>Array.from({length:D},(_,j)=>Number(i===j))),b:Array(D).fill(0),n:0});
function predict(model,x){const ax=mv(model.inverse,x);return {mean:dot(ax,model.b),uncertainty:Math.sqrt(Math.max(0,dot(x,ax)))};}
function update(model,x,reward){
 const ax=mv(model.inverse,x),denom=1+dot(x,ax);
 for(let i=0;i<D;i++){model.b[i]+=reward*x[i];for(let j=0;j<D;j++)model.inverse[i][j]-=ax[i]*ax[j]/denom;}
 model.n++;
}
function scheduler(id){
 assert(['context-bandit','best-first'].includes(id));const alpha=id==='context-bandit'?ALPHA:0;
 return {id,choose(state){
  const model=state.context_model??=initial(),n=state.attempts.length+1;
  // ponytail: score every pending URL; benchmark before adding a priority index at large scale.
  const values=state.pending.map(link=>{const p=predict(model,features(link));return {...p,score:p.mean+alpha*p.uncertainty};});
  let index=0;if(n%5!==0)for(let i=1;i<values.length;i++)if(values[i].score>values[index].score+1e-12)index=i;
  (state.policy_trace??=[]).push({attempt:n,url:state.pending[index].url,fifo:n%5===0,...values[index]});return index;
 },feedback(state,next,profile,newLinks){
  const fingerprint=profile?.fingerprint||crypto.createHash('sha256').update(profile?.body||'').digest('hex');
  const reward=profile?.detail&&!(state.bodies||[]).includes(fingerprint)?1:0;
  update(state.context_model??=initial(),features(next),reward);
  baseline.feedback(state,next,profile,newLinks);
 }};
}
// Runs inside the browser on the already visited source document only.
function inspectContext(){
 const main=document.querySelector('main')||document.body;
 const heading=main.querySelector('h1,h2,[role="heading"]')?.textContent.trim().slice(0,200)||'';
 const links=[...document.querySelectorAll('a[href]')];
 return links.map(a=>{const block=a.closest('li,tr,p,dd,article,section,nav')||a.parentElement;
  return {url:a.href,text:a.textContent.trim(),context:{heading,nearby:(block?.textContent||'').trim().replace(/\s+/g,' ').slice(0,400),siblings:block?.querySelectorAll('a[href]').length||0,outlinks:links.length}};
 });
}
module.exports={D,features,initial,predict,update,scheduler,inspectContext};
