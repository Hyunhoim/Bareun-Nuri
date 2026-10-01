// API0: separate coverage, incomplete responses and repeat-model variation.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {materialize}=require('../agent/src/core/bounded-scan-store.cjs');
const {prefix,measure}=require('./phase1-operating-evaluate.cjs');
const roots=process.argv.slice(2),read=f=>JSON.parse(fs.readFileSync(f));assert.equal(roots.length,2);
const runs=roots.map(dir=>{const e=read(dir+'/evaluation.json'),state=read(dir+'/scan/checkpoint.json').state,data=materialize(dir+'/scan',state),s=prefix(state,e.boundary),accepted=new Set(s.batch_history.flatMap(b=>b.ids));
 const key=c=>new URL(c.url).pathname+'|'+(c.location.match(/#n([a-f0-9]{14})(?![a-f0-9])/)?.[1]||'');
 const ids=new Map(data.candidates.map(c=>[key(c),c.node_id])),decisions=new Map(data.decisions.map(d=>[d.node_id,d]));
 const quarantine=new Set(state.issues.flatMap(i=>i.quarantined_ids||[]));
 const traces=fs.readFileSync(dir+'/scan/trace.jsonl','utf8').trim().split('\n').map(JSON.parse),requests=traces.filter(t=>t.event==='llm_request');
 const requested=new Set(requests.flatMap(r=>JSON.parse(r.body.messages[1].content).candidates.map(c=>c.node_id)));
 return {dir,e,state,data,s,ids,decisions,quarantine,accepted,requested,requests,storage:read(dir+'/scan/storage-metrics.json')};});
const [a,b]=runs,by=new Map(a.e.first25.rows.map(r=>[r.page+'|'+r.id,r])),counts={},details=[];
for(const r of b.e.first25.rows){const k=r.page+'|'+r.id,x=by.get(k),id=b.ids.get(k)||a.ids.get(k);if(x.predicted===r.predicted)continue;
 const reason=x.judged&&r.judged?'same-input-model-variation':a.quarantine.has(id)||b.quarantine.has(id)?'incomplete-response-variation':'deadline-coverage';
 const kind=r.ad?(r.predicted?'ad_gain':'ad_loss'):(r.predicted?'new_fp':'removed_fp');const name=reason+'/'+kind;counts[name]=(counts[name]||0)+1;details.push({id:r.id,node_id:id,kind,reason});}
// Diagnostic only: retain baseline returned decisions for common requests, while
// using candidate's actual committed batch coverage. Not a new measured run.
const counterfactual=b.e.first25.rows.map(r=>{const id=b.ids.get(r.page+'|'+r.id),d=b.accepted.has(id)?(a.requested.has(id)?a.decisions.get(id):b.decisions.get(id)):null;return {...r,judged:!!d,predicted:!!d?.is_violation&&!d?.needs_review,got:[]};});
const q=r=>r.state.issues.filter(i=>i.quarantined_ids).map(i=>i.quarantined_ids.join('|'));
const aq=q(a),bq=q(b);
const result={scope:'Observed Phase1 regression. Counterfactual fixes common baseline responses; no API or independent holdout.',changes:counts,details,counterfactual_semantic:measure(counterfactual).semantic,quarantines:{baseline:aq.length,candidate:bq.length,common:aq.filter(x=>bq.includes(x)).length,baseline_only:aq.filter(x=>!bq.includes(x)).length,candidate_only:bq.filter(x=>!aq.includes(x)).length},storage:runs.map(r=>({dir:r.dir,...r.storage})),tokens:runs.map(r=>r.e.tokens),calls:runs.map(r=>r.e.calls)};
fs.writeFileSync(b.dir+'/effects.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,details:undefined},null,2));
