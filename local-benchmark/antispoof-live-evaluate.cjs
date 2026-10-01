// Offline only; no inference, browser, API, or in-place checkpoint changes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {materialize}=require('../agent/src/core/bounded-scan-store.cjs'),{combine,digest}=require('../agent/src/core/scan.cjs'),{integrateObservations}=require('../agent/src/core/techniques.cjs');
const {localKeys}=require('../.runtime/replica-context-supplement-v1/evaluate.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function measure(rows){
 const known=rows.filter(r=>r.is_ad!==null),tp=known.filter(r=>r.is_ad&&r.predicted).length,fp=known.filter(r=>!r.is_ad&&r.predicted).length,fn=known.filter(r=>r.is_ad&&!r.predicted).length;
 let tt=0,tf=0,tn=0;for(const r of known){if(!r.want)continue;const want=new Set(r.want),got=new Set(r.got);for(const t of want)got.has(t)?tt++:tn++;for(const t of got)if(!want.has(t))tf++;}
 return {positions:rows.length,ads:known.filter(r=>r.is_ad).length,judged:rows.filter(r=>r.judged).length,tp,fp,fn,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null,technique:{tp:tt,fp:tf,fn:tn,f1:2*tt+tf+tn?2*tt/(2*tt+tf+tn):null},normal_review:known.filter(r=>!r.is_ad&&r.review).length,ambiguous_positive:rows.filter(r=>r.is_ad===null&&r.predicted).length,miss_reasons:rows.filter(r=>r.is_ad===true&&!r.predicted).reduce((a,r)=>(a[r.miss_reason]=(a[r.miss_reason]||0)+1,a),{})};
}
function prefix(state,event){
 const s=structuredClone(state);let total=0,history=[];
 for(const b of s.batch_history){if(total+b.ids.length>event.processed)break;history.push(b);total+=b.ids.length;}assert.equal(total,event.processed,'25-minute commit boundary missing');
 s.pages=s.pages.slice(0,event.pages);for(const p of s.pages){const h=history.filter(b=>b.page_id===p.id);p.batches=p.batches.slice(0,h.length);p.offset=h.reduce((n,b)=>n+b.ids.length,0);p.complete=p.offset===p.work;}
 assert.equal(s.pages.reduce((n,p)=>n+p.offset,0),total);s.batch_history=history;s.elapsed_sec=event.elapsedSec;return s;
}
function score(dir,state,gold,keys,overrides){
 const expanded=materialize(dir,state);
 if(overrides){const by=new Map(overrides.map(d=>[d.node_id,d]));assert.equal(by.size,overrides.length);let found=0;expanded.decisions=expanded.decisions.map(d=>{if(!by.has(d.node_id))return d;const v=by.get(d.node_id),old=structuredClone(d),next=structuredClone(v);delete old.antispoof;delete next.antispoof;assert.deepEqual(next,old,'Counterfactual changed HCX intent');found++;return v;});assert.equal(found,by.size);}
 const merged=combine(expanded),ids=new Set(merged.candidates.map(c=>c.node_id)),integrated=integrateObservations(merged,merged.decisions,expanded.technique_observations.filter(o=>ids.has(o.node_id)));
 const candidates=new Map(expanded.candidates.map(c=>[keys.key(c),c])),decisions=new Map(merged.decisions.map(d=>[d.node_id,d])),final=new Map(integrated.decisions.map(d=>[d.node_id,d]));assert.equal(candidates.size,expanded.candidates.length);
 const visited=new Set(expanded.pages.map(keys.position));const rows=gold.map(g=>{
  const c=candidates.get(keys.key(g)),d=c&&decisions.get(c.node_id),f=c&&final.get(c.node_id),predicted=!!d?.is_violation&&!d.needs_review;
  return {id:g.id,key:keys.key(g),panel:g.panel,is_ad:g.is_ad,collected:!!c,judged:!!d,predicted,review:!!d?.needs_review,want:g.technique_gold_available===false?null:g.techniques,got:f?.is_violation&&!f.needs_review?f.techniques:[],miss_reason:!visited.has(keys.position(g))?'closed_inventory_not_visited':!c?'visited_not_collected':!d?'collected_not_judged':'judgment_false_negative'};
 });
 const known=new Set(rows.map(r=>r.key)),unknown=merged.candidates.filter(c=>{const d=decisions.get(c.node_id);return d?.is_violation&&!d.needs_review&&!known.has(keys.key(c));}).map(c=>({key:keys.key(c),node_id:c.node_id,review_required:true}));
 const modelPred=expanded.decisions.flatMap(d=>d.antispoof?.predictions||[]),issues=expanded.decisions.flatMap(d=>d.antispoof?.unresolved||[]);
 return {controlled64:measure(rows),primary52:measure(rows.filter(r=>r.panel!=='supplemental-context')),rows,unlabelled_positives:unknown,pages:expanded.pages.length,candidates:expanded.candidates.length,judged_work:expanded.decisions.length,merged_judged:merged.decisions.length,antispoof:{predictions:modelPred.length,protected:modelPred.filter(p=>p.protected).length,unresolved:issues.length,failed_requests:issues.filter(u=>u.technique===null).length},elapsed_sec:state.elapsed_sec};
}
function main(dir){
 const manifest=read(path.join(dir,'manifest.json')),completed=read(path.join(dir,'completion.json'));assert.equal(completed.status,'completed','Wait until both arms finish');assert(read(path.join(dir,'source-after.json')).verified);
 for(const [f,h] of Object.entries(manifest.hashes))assert.equal(sha(f),h);
 const seal=read('.runtime/replica-context-supplement-v1/manifest.json');for(const [f,h] of Object.entries(seal.gold_sha256))assert.equal(sha(path.join('.runtime/replica-context-supplement-v1',f)),h);
 const keys=localKeys('dev'),inventory=new Set(manifest.profile.urls.map(keys.position)),gold=read('.runtime/replica-context-supplement-v1/dev-controlled-gold.json').filter(g=>inventory.has(keys.position(g))),result={};
 for(const arm of ['baseline','typed']){
  const job=path.join(dir,arm,'scan'),saved=read(path.join(job,'checkpoint.json'));assert.equal(digest(saved.state),saved.sha256);assert(!saved.state.inflight);const events=fs.readFileSync(path.join(dir,arm,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse),last=events.filter(e=>e.type==='progress'&&e.elapsedSec<=1500).at(-1);assert(last);
  result[arm]={first25:{...score(job,prefix(saved.state,last),gold,keys),calls_at_last_progress:last.calls,boundary:'Last committed progress at or before 1500 seconds; later completion excluded'},end:score(job,saved.state,gold,keys),worker:read(path.join(job,'worker-run.json')),status:saved.state.status,reason:saved.state.reason,checkpoint_sha256:sha(path.join(job,'checkpoint.json'))};
 }
 const output=path.join(dir,'evaluation.json');assert(!fs.existsSync(output),'Preserve evaluation');fs.writeFileSync(output,JSON.stringify({scope:'Observed controlled64 only, unknown locations not scored, not independent evaluation',result},null,2));
 console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k,v])=>[k,{first25:v.first25.controlled64,end:v.end.controlled64,antispoof:v.end.antispoof,status:v.status,reason:v.reason}]))));
}
if(process.argv.includes('--selftest')){
 const m=measure([{is_ad:true,predicted:false,judged:false,want:['JAMO'],got:[],miss_reason:'collected_not_judged'},{is_ad:false,predicted:true,judged:true,want:[],got:['HOMOGLYPH']},{is_ad:null,predicted:true,judged:true,want:[],got:[]}]);assert.equal(m.fn,1);assert.equal(m.fp,1);assert.equal(m.technique.fn,1);assert.equal(m.technique.fp,1);assert.equal(m.ambiguous_positive,1);
 const s=prefix({pages:[{id:'a',work:2,batches:[{},{}],offset:2}],batch_history:[{page_id:'a',ids:['x']},{page_id:'a',ids:['y']}]},{processed:1,pages:1,elapsedSec:1499});assert.equal(s.pages[0].offset,1);assert.equal(s.pages[0].batches.length,1);console.log('Evaluation boundary and unknown-label checks passed');
}else if(require.main===module)main(path.resolve(process.argv[2]));
module.exports={measure,prefix,score};
