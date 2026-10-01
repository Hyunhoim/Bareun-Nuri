// Experiment only: prefer complete local context, retain uncertain/unscoped fallback.
const assert=require('node:assert/strict');
const {contract:baseline}=require('../src/core/judgment.cjs');
function contract(){const base=baseline();return {...base,initialEvidence(c){
 const out=base.initialEvidence(c),e=c.context_evidence;
 if(e?.scope?.document_scope===false&&e.truncated===false&&e.units?.some(u=>u.relation!=='target'&&typeof u.text==='string'&&u.text.trim()))delete out.unscoped_nearby;
 return out;
}};}
module.exports={contract,sourceFiles:[__filename],comparison:'C vs removal of unscoped nearby only when non-document, untruncated local context has other text. Stored evidence is unchanged.'};
if(require.main===module){
 const c={node_id:'test',raw_text:'문구',links:[],nearby:{before:'주변 글'},context_evidence:{scope:{document_scope:false},truncated:false,units:[{relation:'before',text:'소속 글'},{relation:'target'}]}};
 const original=structuredClone(c),a=baseline().initialEvidence(c),b=contract().initialEvidence(c);delete a.unscoped_nearby;assert.deepEqual(a,b);assert.deepEqual(c,original);
 for(const change of [{truncated:true},{scope:{document_scope:true}},{units:[{relation:'target'}]}]){const x={...c,context_evidence:{...c.context_evidence,...change}};assert.deepEqual(contract().initialEvidence(x),baseline().initialEvidence(x));}
 console.log('PASS scoped-only change, evidence preservation and three fallbacks; API0');
}
