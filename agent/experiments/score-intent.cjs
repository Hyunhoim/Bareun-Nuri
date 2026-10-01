// Offline intent metrics. Reviews/missing positives are misses, never silently normal.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [dir,labelFile]=process.argv.slice(2);
if(!dir||!labelFile)throw Error('Usage: node agent/experiments/score-intent.cjs RUN_DIR LABELS_JSON');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'))),snapshot=read('evidence'),decisions=read('decisions'),labels=JSON.parse(fs.readFileSync(labelFile)),run=read('run');
assert.equal(run.status,'completed','Run incomplete');
const byId=new Map(decisions.map(d=>[d.node_id,d]));assert.equal(byId.size,decisions.length,'Duplicate decision');
assert.equal(decisions.length,snapshot.candidates.length,'Incomplete decisions');
const rows=labels.map(l=>{
 const matches=snapshot.candidates.filter(c=>l.node_id?c.node_id===l.node_id:c.selector===l.selector&&(!l.page||c.url===new URL(l.page,snapshot.entry_url).href)&&(!l.frames||JSON.stringify(c.frame_urls)===JSON.stringify(l.frames.map(f=>new URL(f,snapshot.entry_url).href))));
 assert.equal(matches.length,1,'Label must resolve to one collected candidate: '+(l.node_id||l.selector));
 const c=matches[0],d=byId.get(c.node_id);assert(d,'Missing judgment');
 assert.equal(typeof l.is_ad,'boolean','Boolean ground truth required');
 return {node_id:c.node_id,text:c.raw_text,is_ad:l.is_ad,expected_review:!!l.expected_review,predicted:d.is_violation,review:d.needs_review,decision:d};
});
assert.equal(new Set(rows.map(r=>r.node_id)).size,rows.length,'Duplicate labels');
const ids=new Set(rows.map(r=>r.node_id)),unlabeled=decisions.filter(d=>!ids.has(d.node_id));
const known=rows.filter(r=>!r.expected_review);
const tp=known.filter(r=>r.is_ad&&r.predicted&&!r.review).length,fp=known.filter(r=>!r.is_ad&&r.predicted&&!r.review).length,fn=known.filter(r=>r.is_ad).length-tp;
const errors=rows.filter(r=>r.review!==r.expected_review||!r.review&&r.predicted!==r.is_ad);
const out={labeled:rows.length,binaryLabeled:known.length,expectedReviews:rows.length-known.length,processed:decisions.length,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null,
 reviews:rows.filter(r=>r.review).length,unexpectedReviews:rows.filter(r=>r.review&&!r.expected_review).length,
 unlabeled:unlabeled.length,unlabeledPositive:unlabeled.filter(d=>d.is_violation).length,unlabeledReview:unlabeled.filter(d=>d.needs_review).length,
 passed:errors.length===0&&unlabeled.length===0,calls:run.calls.length,totalTokens:run.totalTokens,elapsedSec:run.elapsedSec,errors};
fs.writeFileSync(path.join(dir,'intent-score.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify({...out,errors:errors.map(r=>({text:r.text,ad:r.is_ad,review:r.review,reason:r.decision.reason}))},null,2));
