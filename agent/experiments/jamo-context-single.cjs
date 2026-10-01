// B equals A for these readable targets; avoid duplicate oracle calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {groups,specs}=require('./jamo-context-run.cjs'),{runComparison}=require('./semantic-search-run.cjs');
async function main(){const data=groups(),g=data.groups.find(g=>g.name==='replica'),methods=specs(data.oracle);
 const detail=JSON.parse(fs.readFileSync('.runtime/jamo-context-v1/detail.json'));
 const ids=new Set(Object.entries(detail.original_six).filter(([,v])=>v.conditions.B.some(x=>x!=='이용권유')).map(([id])=>id));
 assert.equal(ids.size,3);for(const l of g.labels.filter(l=>l.is_ad===false).slice(0,3))ids.add(l.node_id);
 const candidates=g.snapshot.candidates.filter(c=>ids.has(c.node_id));for(const c of candidates)assert.deepEqual(methods.A.contract.initialEvidence(c),methods.B.contract.initialEvidence(c),'Oracle must be identical for this diagnostic');
 const group={name:'single',labels:g.labels.filter(l=>ids.has(l.node_id)),snapshot:{candidates}};
 await runComparison({root:path.resolve('.runtime/jamo-context-single-v1'),groups:[group],modes:['A','D'],rounds:2,maxTokens:512,methodSpecs:{A:{...methods.A,batchSize:1},D:{...methods.D,batchSize:1}},sourceFiles:[__filename,require.resolve('./jamo-context-run.cjs'),require.resolve('./jamo-context-normalize.cjs'),require.resolve('./jamo-context-variant.cjs'),require.resolve('../src/core/judgment.cjs'),'docs/jamo-context-plan.md'],limits:{calls:24,tokens:150000,seconds:600}});
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
