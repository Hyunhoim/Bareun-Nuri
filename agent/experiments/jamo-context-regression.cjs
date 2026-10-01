// Frozen follow-up only after the phase-one gate; no prompt tuning.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {runComparison}=require('./semantic-search-run.cjs');
const {specs}=require('./jamo-context-run.cjs');
const read=f=>JSON.parse(fs.readFileSync(f));
async function main(){const summary=read('.runtime/jamo-context-v1/summary.json'),selected=summary.promising[0];assert(selected,'No promising candidate');
 const groups=['dev','holdout'].map(name=>({name,labels:read('.runtime/replica-intent-data-v1/'+name+'-labels.json'),snapshot:read('.runtime/replica-intent-data-v1/'+name+'-evidence.json')}));
 const all=specs(new Map()),methods={A:all.A,[selected]:all[selected]};
 await runComparison({root:path.resolve('.runtime/jamo-context-regression-v1'),groups,modes:['A',selected],rounds:2,maxTokens:512,methodSpecs:methods,sourceFiles:[__filename,require.resolve('./jamo-context-run.cjs'),require.resolve('./jamo-context-normalize.cjs'),require.resolve('./jamo-context-variant.cjs'),require.resolve('../src/core/judgment.cjs'),require.resolve('../src/core/jamo.cjs'),'docs/jamo-context-plan.md'],limits:{calls:104,tokens:900000,seconds:3600}});
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
