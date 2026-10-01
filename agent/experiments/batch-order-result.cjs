// Post-completion comparison. Every original chunk must be judged before scoring its parent.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {combine}=require('../src/core/scan.cjs'),{materialize}=require('../src/core/bounded-scan-store.cjs');
const read=f=>JSON.parse(fs.readFileSync(f));
const roots={C:path.resolve('.runtime/jamo-context-live-c-v1'),R:path.resolve('.runtime/batch-order-live-v1')};
const positive=d=>!!d?.is_violation&&!d.needs_review;
function measure(root,labels,n){
 assert(fs.existsSync(path.join(root,'completion.json')),'Do not materialize during timing');
 const state=read(path.join(root,'scan/checkpoint.json')).state,expanded=materialize(path.join(root,'scan'),state),count=Math.min(n,state.batch_history.length),ids=new Set(state.batch_history.slice(0,count).flatMap(b=>b.ids));
 const merged=combine({...expanded,decisions:expanded.decisions.filter(d=>ids.has(d.node_id))}),by=new Map(merged.decisions.map(d=>[d.node_id,d]));
 const rows=labels.map(l=>({...l,judged:by.has(l.node_id),positive:positive(by.get(l.node_id))}));
 const tp=rows.filter(r=>r.is_ad===true&&r.positive).length,fp=rows.filter(r=>r.is_ad===false&&r.positive).length,fn=rows.filter(r=>r.is_ad===true&&!r.positive).length;
 const calls=read(path.join(root,'calls.json')).filter(c=>c.status==='ok').slice(0,count);
 return {calls:count,judged_work:ids.size,judged_originals:merged.decisions.length,controlled_judged:rows.filter(r=>r.judged).length,ads_judged:rows.filter(r=>r.is_ad===true&&r.judged).length,tp,fp,fn,f1:2*tp/(2*tp+fp+fn),positive_ads:rows.filter(r=>r.is_ad===true&&r.positive).map(r=>r.node_id),misses:rows.filter(r=>r.is_ad===true&&!r.positive).map(r=>({id:r.node_id,reason:r.judged?'semantic':'unjudged'})),tokens:calls.reduce((n,c)=>n+c.usage.total_tokens,0),finish_sec:count?(calls.at(-1).finished_at_ms-Date.parse(state.started_at))/1000:null};
}
function main(){const labels=read(path.join(roots.C,'evaluation.json')).controlled64.rows.map(r=>({node_id:r.node_id,is_ad:r.is_ad}));const out={scope:'Observed controlled64; prefixes score judgments only, not contemporaneous collection coverage',prefixes:{}};
 const commonBudget=Math.min(...Object.values(roots).map(root=>read(path.join(root,'scan/checkpoint.json')).state.batch_history.length));out.common_budget=commonBudget;
 for(const n of [...new Set([300,467,commonBudget,Infinity])]){const a=measure(roots.C,labels,n),b=measure(roots.R,labels,n);out.prefixes[String(n)]={C:a,R:b,recovered:b.positive_ads.filter(id=>!a.positive_ads.includes(id)),lost:a.positive_ads.filter(id=>!b.positive_ads.includes(id))};}
 const file=path.join(roots.R,'prefix-comparison.json');assert(!fs.existsSync(file));fs.writeFileSync(file,JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));}
if(require.main===module)main();
