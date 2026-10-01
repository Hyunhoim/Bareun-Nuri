const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {combine,atomic}=require('../src/core/scan.cjs');
const read=p=>JSON.parse(fs.readFileSync(p));
const metric=(tp,fp,fn)=>({tp,fp,fn,precision:tp+fp?tp/(tp+fp):0,recall:tp+fn?tp/(tp+fn):0,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):0});
function score(root,id,mode){
 const state=read(path.join(root,id+'-'+mode,'checkpoint.json')).state;assert.equal(state.reason,'page_budget');assert.equal(state.work.length,state.decisions.length);assert(!state.inflight);
 const gold=read(path.join(root,id+'-gold.json')),merged=combine(state),seen=new Set();
 const rows=gold.map(g=>{const c=merged.candidates.find(n=>n.url===g.page&&n.location===g.location),d=c&&merged.decisions.find(d=>d.node_id===c.node_id);if(c)seen.add(c.node_id);return {...g,node_id:c?.node_id,pred:!!d?.is_violation&&!d.needs_review,tech:d?.techniques||[],visited:state.pages.some(p=>p.url===g.page)};});
 const extra=merged.decisions.filter(d=>!seen.has(d.node_id)&&d.is_violation&&!d.needs_review);
 const intent=metric(rows.filter(r=>r.is_ad&&r.pred).length,rows.filter(r=>!r.is_ad&&r.pred).length,rows.filter(r=>r.is_ad&&!r.pred).length);
 let tp=0,fp=0,fn=0;for(const r of rows){const p=r.pred?r.tech:[];tp+=p.filter(t=>r.techniques.includes(t)).length;fp+=p.filter(t=>!r.techniques.includes(t)).length;fn+=r.techniques.filter(t=>!p.includes(t)).length;}
 const result={id,mode,intent,final:metric(tp,fp,fn),conservative:metric(tp,fp+extra.reduce((n,d)=>n+d.techniques.length,0),fn),extras:extra,
  reached:rows.filter(r=>r.is_ad&&r.visited).length,deep:rows.filter(r=>r.is_ad&&r.category==='deep'&&r.pred).length,frames:rows.filter(r=>r.is_ad&&r.category==='frame'&&r.pred).length,
  calls:state.calls,tokens:state.call_records.reduce((n,c)=>n+c.usage.total_tokens,0),seconds:state.elapsed_sec,review:state.decisions.filter(d=>d.needs_review).length,rows};
 atomic(path.join(root,id+'-'+mode),'score.json',result);return result;
}
function main(root){
 const scores=['mixed-0','mixed-1'].flatMap(id=>['fifo','bandit','bandit-path'].map(mode=>score(root,id,mode))),aggregate={};
 for(const mode of ['fifo','bandit','bandit-path']){const ss=scores.filter(s=>s.mode===mode);aggregate[mode]={};for(const key of ['intent','final','conservative'])aggregate[mode][key]=metric(...['tp','fp','fn'].map(k=>ss.reduce((n,s)=>n+s[key][k],0)));for(const key of ['calls','tokens','seconds','review','reached','deep','frames'])aggregate[mode][key]=ss.reduce((n,s)=>n+s[key],0);}
 const comparisons=[];
 for(const [base,variant]of [['fifo','bandit'],['fifo','bandit-path'],['bandit','bandit-path']]){
  const pairs=['mixed-0','mixed-1'].map(id=>({a:scores.find(s=>s.id===id&&s.mode===base),b:scores.find(s=>s.id===id&&s.mode===variant)}));
  const lost=p=>p.a.rows.filter(r=>r.is_ad&&r.pred).flatMap(r=>{const x=p.b.rows.find(x=>x.page===r.page&&x.location===r.location);return !x.pred?[{page:r.page,location:r.location,kind:'intent'}]:r.techniques.filter(t=>r.tech.includes(t)&&!x.tech.includes(t)).map(t=>({page:r.page,location:r.location,kind:t}));});
  const a=aggregate[base],b=aggregate[variant];const gates={nondecrease:pairs.every(p=>['intent','final','conservative'].every(k=>p.b[k].f1>=p.a[k].f1)),precision:pairs.every(p=>['intent','final','conservative'].every(k=>p.b[k].precision>=p.a[k].precision-.02)),fp:pairs.every(p=>['intent','final','conservative'].every(k=>p.b[k].fp<=p.a[k].fp+1)),retained:pairs.every(p=>!lost(p).length),gain:b.final.f1-a.final.f1>=.02&&b.conservative.f1-a.conservative.f1>=.02,cost:b.tokens<=a.tokens*1.15&&b.seconds<=a.seconds*1.15};
  comparisons.push({base,variant,gates,pass:Object.values(gates).every(Boolean),lost:pairs.map(p=>({site:p.a.id,rows:lost(p)}))});
 }
 const result={scores:scores.map(s=>({...s,rows:undefined})),aggregate,comparisons};atomic(root,'comparison.json',result);console.log(JSON.stringify(result,null,2));
}
if(require.main===module)main(process.argv[2]||'.runtime/scope-trial-v1');module.exports={score,metric};
