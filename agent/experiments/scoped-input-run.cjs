const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {runComparison,estimate}=require('./semantic-search-run.cjs');
const {contract}=require('../src/core/judgment.cjs'),variant=require('./scoped-input.cjs');
const read=f=>JSON.parse(fs.readFileSync(f));
function groups(){
 const gs=require('./attribution-next-run.cjs').groups().filter(g=>g.name!=='replica');
 const all=new Map();for(const f of fs.readdirSync('.runtime/jamo-context-live-c-v1/snapshots'))for(const c of read('.runtime/jamo-context-live-c-v1/snapshots/'+f).candidates)all.set(c.node_id,c);
 const {key}=require('../../.runtime/replica-context-supplement-v1/evaluate.cjs').localKeys('dev');
 const byKey=new Map([...all.values()].map(c=>[key(c),c]));
 const labels=read('.runtime/replica-context-supplement-v1/dev-controlled-gold.json').map(l=>({node_id:byKey.get(key(l))?.node_id,is_ad:l.is_ad,scenario:l.panel}));
 labels.push({node_id:'n_3922e53bec3a169f',is_ad:false,scenario:'author'});assert(labels.every(l=>all.has(l.node_id)));
 gs.push({name:'replica65',labels,snapshot:{candidates:labels.map(l=>all.get(l.node_id))}},require('./scoped-input-panel.cjs').fresh());return gs;
}
async function main(){
 const gs=groups(),spec={C:{contract:contract(),batchSize:4,maxTokens:512},S:{contract:variant.contract(),batchSize:4,maxTokens:512}};let calls=0,tokens=0;
 for(const g of gs)for(const m of Object.values(spec))for(let i=0;i<g.labels.length;i+=4){calls+=2;tokens+=2*(await estimate(g.snapshot.candidates.slice(i,i+4),{provider:'hcx',temperature:0,seed:42,maxTokens:512,reasoningEffort:'none'},m.contract)).tokens;}
 assert(calls<=160&&tokens<=1000000);console.log(JSON.stringify({groups:gs.map(g=>[g.name,g.labels.length]),calls,reserved:tokens}));
 if(!process.argv.includes('--live'))return;
 await runComparison({root:path.resolve('.runtime/scoped-input-v1'),groups:gs,modes:['C','S'],rounds:2,maxTokens:512,methodSpecs:spec,
  sourceFiles:[__filename,require.resolve('./scoped-input.cjs'),require.resolve('./scoped-input-panel.cjs'),require.resolve('./attribution-next-panel.cjs'),require.resolve('../src/core/judgment.cjs'),require.resolve('../src/core/jamo-reading.cjs'),'docs/scoped-input-plan.md'],limits:{calls:160,tokens:1000000,seconds:3600}});
}
module.exports={groups};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
