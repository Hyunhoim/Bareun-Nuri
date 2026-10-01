// Reuse service classification without quotation/style metadata influencing service legality.
const base=require('./service-contract.cjs');
function initialEvidence(c){return {node_id:c.node_id,target_text:c.normalized_text,
 context:{truncated:!!c.context_evidence?.truncated,units:(c.context_evidence?.units||[]).filter(u=>u.relation!=='target').map(u=>({relation:u.relation,text:u.text}))},links:c.links};}
module.exports={...base,initialEvidence};
