// Per-run experimental deduplication; no shared/persistent cache or approximate match.
const assert=require('node:assert/strict');
const {audit,key,candidateEvidence,observationEvidence}=require('./reuse-audit.cjs');
const {validateDecisions}=require('../src/core/llm.cjs');
function planReuse(snapshot){
 audit(snapshot); // Fail closed on duplicate IDs or missing/misattributed observation evidence.
 const observations=new Map((snapshot.technique_observations||[]).map(o=>[o.node_id,o]));
 const seen=new Map(),representatives=[],aliases=[];
 for(const c of snapshot.candidates){
  const fingerprint=key({candidate:candidateEvidence(c),observation:observationEvidence(observations.get(c.node_id))});
  if(!seen.has(fingerprint)){seen.set(fingerprint,c.node_id);representatives.push(c);}
  aliases.push({node_id:c.node_id,representative:seen.get(fingerprint)});
 }
 return {representatives,aliases};
}
function expandDecisions(snapshot,plan,decisions){
 const expected=planReuse(snapshot);assert.deepEqual(plan,expected,'Reuse plan/source mismatch');
 validateDecisions({decisions},plan.representatives);
 const byId=new Map(decisions.map(d=>[d.node_id,d]));
 const expanded=plan.aliases.map(a=>({...structuredClone(byId.get(a.representative)),node_id:a.node_id}));
 validateDecisions({decisions:expanded},snapshot.candidates);return expanded;
}
module.exports={planReuse,expandDecisions};
