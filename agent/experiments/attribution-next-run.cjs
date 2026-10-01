const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runComparison,estimate}=require('./semantic-search-run.cjs');
const {normalizeText}=require('../src/core/jamo.cjs');
const read=f=>JSON.parse(fs.readFileSync(f));
function groups(){
 const rows=require('./attribution-next-panel.cjs').buildPanel().map(r=>({...r,id:'n_'+crypto.createHash('sha256').update('next-'+r.id).digest('hex').slice(0,16)}));
 const groups=['dev','eval'].map(split=>{const rs=rows.filter(r=>r.split===split).sort((a,b)=>a.id.localeCompare(b.id));return{name:split,labels:rs.map(r=>({node_id:r.id,is_ad:r.expected,scenario:r.group})),snapshot:{candidates:rs.map(r=>({node_id:r.id,raw_text:r.raw,normalized_text:normalizeText(r.raw),page_title:'시민 참여 안내',frame_urls:[],signals:[],links:r.links||[],nearby:r.nearby||{},own_style:{tag:r.targetTag||'p'},context_evidence:{target_tag:r.targetTag||'p',scope:{tag:r.scopeTag||'section',role:r.scopeRole||null,document_scope:false},target_quoted:!!r.targetQuoted,truncated:false,units:[...(r.before?[{relation:'before',tag:r.beforeTag||'p',text:r.before,quoted:!!r.beforeQuoted}]:[]),{relation:'target',tag:r.targetTag||'p',quoted:!!r.targetQuoted},...(r.after?[{relation:'after',tag:r.afterTag||'p',text:r.after,quoted:!!r.afterQuoted}]:[])]}}))}};});
 const root='.runtime/jamo-context-live-c-v1',evaluation=read(root+'/evaluation.json'),labels=evaluation.controlled64.rows.filter(r=>r.judged).map(r=>({node_id:r.node_id,is_ad:r.is_ad,scenario:r.panel}));
 labels.push({node_id:'n_3922e53bec3a169f',is_ad:false,scenario:'observed_attribution_error'});
 const ids=new Set(labels.map(r=>r.node_id)),all=new Map();for(const file of fs.readdirSync(root+'/snapshots'))for(const c of read(root+'/snapshots/'+file).candidates)if(ids.has(c.node_id))all.set(c.node_id,c);assert.equal(all.size,labels.length);
 groups.push({name:'replica',labels,snapshot:{candidates:labels.map(l=>all.get(l.node_id))}});return groups;
}
function specs(){const c=require('./attribution-next-contracts.cjs').contracts();return {A:{contract:c.A,batchSize:4,maxTokens:512},E:{contract:c.E,batchSize:4,maxTokens:512},F:{contract:c.F,batchSize:4,maxTokens:512},H:{contract:c.A,batchSize:2,maxTokens:512}};}
async function main(){const gs=groups(),methods=specs();let expected=0,reserved=0;
 for(const g of gs)for(const m of Object.values(methods))for(let i=0;i<g.snapshot.candidates.length;i+=m.batchSize){expected+=2;reserved+=2*(await estimate(g.snapshot.candidates.slice(i,i+m.batchSize),{provider:'hcx',temperature:0,seed:42,maxTokens:512,reasoningEffort:'none'},m.contract)).tokens;}
 assert(expected<=240&&reserved<=1000000);console.log(JSON.stringify({groups:gs.map(g=>[g.name,g.labels.length]),expected,reserved}));if(!process.argv.includes('--live'))return;
 await runComparison({root:path.resolve('.runtime/attribution-next-v1'),groups:gs,modes:['A','E','F','H'],rounds:2,maxTokens:512,methodSpecs:methods,sourceFiles:[__filename,require.resolve('./attribution-next-panel.cjs'),require.resolve('./attribution-next-contracts.cjs'),require.resolve('../src/core/judgment.cjs'),require.resolve('../src/core/jamo-reading.cjs'),require.resolve('../src/core/jamo.cjs'),'docs/attribution-next-plan.md'],limits:{calls:240,tokens:1000000,seconds:3600}});
}
module.exports={groups,specs};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
