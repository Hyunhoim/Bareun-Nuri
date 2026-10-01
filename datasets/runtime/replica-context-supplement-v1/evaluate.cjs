// Offline only. CLI: node evaluate.cjs dev RUN_ROOT... > FACTS.json
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const {combine,digest}=require(path.join(root,'agent/src/core/scan.cjs'));
const positive=d=>!!d?.is_violation&&!d.needs_review;
function localKeys(split){
 const site=path.join(root,'.runtime/replica-intent-data-v1'),catalog=read(path.join(site,'catalog.json')),cfg=catalog.entries[split];assert(cfg);
 const {canonical}=require(path.join(root,'agent/src/core/collect.cjs')),known=new Map();
 for(const p of catalog.pages.filter(p=>p.institution===cfg.institution)){const k=canonical(p.original_url);assert(!known.has(k)||known.get(k)===p.source_id,'Ambiguous local server canonical collision');known.set(k,p.source_id);}
 const position=x=>{
  const raw=typeof x==='string'?x:(x.url||x.pathname),u=new URL(raw,cfg.source);
  const original=u.pathname+u.search;
  if(u.origin!==cfg.source&&u.origin!=='http://127.0.0.1:'+cfg.port)return original;
  const served=canonical(cfg.source+u.pathname+u.search);if(!known.has(served))return original;
  const normalized=new URL(served);return normalized.pathname+normalized.search;
 };
 const key=c=>JSON.stringify([position(c),c.selector,c.raw_text]);
 return {position,key,audit:{catalog_sha256:sha(path.join(site,'catalog.json')),server_source_sha256:sha(path.join(root,'agent/experiments/replica-intent-site.cjs')),canonical_source_sha256:sha(path.join(root,'agent/src/core/collect.cjs')),canonical_routes:known.size,rule:'Only exact captured local server routes use its canonical aliases. Query key/value pairs are retained, duplicate-key ordering preserved, no request URL modified.'}};
}
function evaluate(split,runs){
 const manifest=read(path.join(__dirname,'manifest.json'));for(const[f,h]of Object.entries(manifest.gold_sha256))assert.equal(sha(path.join(__dirname,f)),h);
 const {position,key,audit}=localKeys(split);
 const gold=read(path.join(__dirname,split+'-controlled-gold.json')),known=new Set(gold.map(key)),union=new Map(),results=[];assert.equal(known.size,gold.length,'Gold canonical collision');
 for(const run of runs){const folder=path.resolve(run),p=path.join(folder,'worker/checkpoint.json'),saved=read(p);assert.equal(digest(saved.state),saved.sha256);const state=saved.state,merged=combine(state),byId=new Map(merged.decisions.map(d=>[d.node_id,d])),candidates=new Map(state.candidates.map(c=>[key(c),c])),visited=new Set(state.pages.map(position)),pending=new Set(state.pending.map(position));
  assert.equal(candidates.size,state.candidates.length,'Candidate canonical collision');
  const rows=gold.map(g=>{const c=candidates.get(key(g)),d=c&&byId.get(c.node_id);return {...g,collected:!!c,judged:!!d,predicted:positive(d),review:!!d?.needs_review,miss_reason:g.is_ad!==true||positive(d)?null:!visited.has(position(g))?(pending.has(position(g))?'discovered_pending':'address_undiscovered'):!c?'visited_not_collected':!d?'collected_not_judged':'judgment_false_negative'};});
  const measure=rows=>{const tp=rows.filter(r=>r.is_ad===true&&r.predicted).length,fp=rows.filter(r=>r.is_ad===false&&r.predicted).length,fn=rows.filter(r=>r.is_ad===true&&!r.predicted).length;return{positions:rows.length,ads:rows.filter(r=>r.is_ad===true).length,ads_collected:rows.filter(r=>r.is_ad===true&&r.collected).length,ads_judged:rows.filter(r=>r.is_ad===true&&r.judged).length,normal:rows.filter(r=>r.is_ad===false).length,ambiguous:rows.filter(r=>r.is_ad===null).length,collected:rows.filter(r=>r.collected).length,judged:rows.filter(r=>r.judged).length,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null,normal_review:rows.filter(r=>r.is_ad===false&&r.review).length,ambiguous_review:rows.filter(r=>r.is_ad===null&&r.review).length,miss_reasons:rows.filter(r=>r.miss_reason).reduce((a,r)=>(a[r.miss_reason]=(a[r.miss_reason]||0)+1,a),{})};};
  const outside=[];for(const c of merged.candidates){const k=key(c),d=byId.get(c.node_id);if(positive(d)&&!known.has(k)){const entry={key:k,pathname:position(c),selector:c.selector,raw_text:c.raw_text,context_evidence:c.context_evidence,decision:d,run:folder};outside.push(entry);if(!union.has(k))union.set(k,{key:k,pathname:position(c),selector:c.selector,raw_text:c.raw_text,context_evidence:c.context_evidence,runs:[]});union.get(k).runs.push({run:folder,node_id:c.node_id,decision:d});}}
  results.push({run:folder,checkpoint_sha256:sha(p),status:state.status,reason:state.reason,primary52:measure(rows.filter(r=>r.panel!=='supplemental-context')),supplement12:measure(rows.filter(r=>r.panel==='supplemental-context')),controlled64:measure(rows),unlabelled_positive_count:outside.length,unlabelled_positives:outside});
 }
 return {scope:'Post-hoc labelled controlled64 semantic positions; not whole-site truth. Primary4-technique metrics unchanged and not recomputed here.',split,local_server_alias_audit:audit,gold_manifest_sha256:sha(path.join(__dirname,'manifest.json')),results,unlabelled_positive_union:[...union.values()],unlabelled_positive_union_size:union.size,api_calls:0,browser_calls:0};
}
module.exports={evaluate,localKeys};if(require.main===module)console.log(JSON.stringify(evaluate(process.argv[2],process.argv.slice(3)),null,2));
