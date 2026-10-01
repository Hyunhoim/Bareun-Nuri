const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {combine,digest}=require('./progressive.cjs'),{canonical}=require('../src/core/collect.cjs');
function score(dir,labelsFile,split){
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'checkpoint.json')));assert.equal(digest(saved.state),saved.sha256);
 const state=saved.state,merged=combine(state),labels=JSON.parse(fs.readFileSync(labelsFile))[split].cases;
 const ids=new Set(),decisions=new Map(merged.decisions.map(d=>[d.node_id,d]));
 const rows=labels.map(l=>{
  const url=new URL(l.page,state.entry).href;
  const cs=state.candidates.filter(c=>canonical(c.url)===canonical(url)&&c.selector===l.selector);assert(cs.length<=1,'Duplicate label owner');
  const c=cs[0],d=c?decisions.get(c.node_id):null;if(c)ids.add(c.node_id);
  return {...l,node_id:c?.node_id,visited:!!c,judged:!!d,decision:d,predicted:!!d?.is_violation&&!d.needs_review};
 });
 function metrics(rs){const tp=rs.filter(r=>r.is_ad&&r.predicted).length,fp=rs.filter(r=>!r.is_ad&&r.predicted).length,fn=rs.filter(r=>r.is_ad&&!r.predicted).length;
  return {tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null};}
 const extras=merged.candidates.filter(c=>!ids.has(c.node_id)&&decisions.get(c.node_id)?.is_violation&&!decisions.get(c.node_id)?.needs_review).map(c=>({node_id:c.node_id,url:c.url,location:c.location,raw_text:c.raw_text,decision:decisions.get(c.node_id)}));
 let tp=0,fp=0,fn=0;
 for(const r of rows){const predicted=new Set(r.predicted?r.decision.techniques:[]),expected=new Set(r.techniques);
  for(const t of predicted){if(expected.has(t))tp++;else fp++;}for(const t of expected)if(!predicted.has(t))fn++;}
 const calls=state.call_records,totalTokens=calls.every(c=>Number.isFinite(c.usage?.total_tokens))?calls.reduce((s,c)=>s+c.usage.total_tokens,0):null;
 const result={split,mode:state.mode,status:state.status,reason:state.reason,pages:state.pages.length,excluded:state.excluded,pending:state.pending.length,
  labels:rows.length,visited_labels:rows.filter(r=>r.visited).length,judged_labels:rows.filter(r=>r.judged).length,
  intent:metrics(rows),final:{tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null},
  strata:Object.fromEntries([...new Set(rows.map(r=>r.category))].map(s=>[s,metrics(rows.filter(r=>r.category===s))])),
  calls:state.calls,totalTokens,elapsed_sec:state.elapsed_sec,unlabeled_positives:extras,rows};
 fs.writeFileSync(path.join(dir,'score.json'),JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({...result,rows:undefined,unlabeled_positives:extras.map(c=>({node_id:c.node_id,text:c.raw_text.slice(0,120)}))},null,2));return result;
}
if(require.main===module)score(...process.argv.slice(2));
module.exports={score};
