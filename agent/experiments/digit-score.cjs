// Gold is used only here, after inference. Uncertain positives count as missed substitutions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [dir,labelFile]=process.argv.slice(2);if(!dir||!labelFile)throw Error('Usage: digit-score.cjs RUN_DIR LABELS_JSON');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'))),run=read('run');assert.equal(run.status,'completed');
const labels=JSON.parse(fs.readFileSync(labelFile)),judgments=read('judgments'),queries=read('queries'),byId=new Map(judgments.map(j=>[j.node_id,j])),qs=new Map(queries.map(q=>[q.node_id,q]));
assert.equal(byId.size,judgments.length);assert.equal(qs.size,queries.length);
assert.equal(new Set(labels.map(l=>l.query_id)).size,labels.length);assert.equal(queries.length,labels.length);
const rows=labels.map(l=>{const d=byId.get(l.query_id),q=qs.get(l.query_id);assert(d&&q,'Missing query/result');assert.equal(q.owner_node_id,l.node_id);assert.equal(q.token,l.token);
 return {...l,predicted:d.classification,reading:d.reading==='none'?null:q.readings[Number(d.reading.slice(1))],reason:d.reason};});
const positives=rows.filter(r=>r.classification==='substitution'),negatives=rows.filter(r=>r.classification==='literal'),ambiguous=rows.filter(r=>r.classification==='uncertain');
const tp=positives.filter(r=>r.predicted==='substitution').length,fp=negatives.filter(r=>r.predicted==='substitution').length,fn=positives.length-tp;
const pairs=new Map();for(const r of rows){if(!pairs.has(r.pair))pairs.set(r.pair,[]);pairs.get(r.pair).push(r);}
const pairChanges=[...pairs.entries()].filter(([k,a])=>{assert.equal(a.length,2,k);return a[0].predicted!==a[1].predicted;}).map(([pair,items])=>({pair,items:items.map(r=>({context:r.context,predicted:r.predicted}))}));
const literalResolved=negatives.filter(r=>r.predicted==='literal').length,uncertainCorrect=ambiguous.filter(r=>r.predicted==='uncertain').length;
const result={labeled:rows.length,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp/positives.length,f1:2*tp/(2*tp+fp+fn),
 positiveCount:positives.length,literalCount:negatives.length,literalResolved,literalReviews:negatives.filter(r=>r.predicted==='uncertain').length,
 ambiguousCount:ambiguous.length,uncertainCorrect,uncertainWrongPositive:ambiguous.filter(r=>r.predicted==='substitution').length,uncertainWrongLiteral:ambiguous.filter(r=>r.predicted==='literal').length,
 reviewRate:rows.filter(r=>r.predicted==='uncertain').length/rows.length,pairs:pairs.size,pairChanges,
 readingErrors:positives.filter(r=>r.predicted==='substitution'&&r.reading?.toLowerCase()!==r.family).map(r=>({token:r.token,reading:r.reading,expected:r.family})),
 passed:tp>=14&&fp===0&&literalResolved===20&&uncertainCorrect===8&&pairChanges.length===0,
 calls:run.calls.length,totalTokens:run.totalTokens,elapsedSec:run.elapsedSec,errors:rows.filter(r=>r.predicted!==r.classification)};
fs.writeFileSync(path.join(dir,'score.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
