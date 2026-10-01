// Experiment only: replace every mapped digit, preserve source text and the D contract.
const assert=require('node:assert/strict'),base=require('./digit-generalization-methods.cjs');
function completeReadings(token,cap=64){
 if(typeof token!=='string'||!token||!Number.isInteger(cap)||cap<1)throw Error('Invalid token or cap');
 const uppercase=/[A-Z]/.test(token)&&!/[a-z]/.test(token);
 const options=[...token].map(c=>/[0-9]/.test(c)?base.readings(c).values.map(x=>uppercase?x.toUpperCase():x):[c]);
 let count=1;for(const a of options){count*=a.length;if(count>cap)return {values:[],truncated:true};}
 let values=[''];for(const a of options)values=values.flatMap(prefix=>a.map(c=>prefix+c));
 return {values:[...new Set(values)].filter(x=>x!==token),truncated:false};
}
function prepare(row,mode='D'){
 const q=base.prepare(row);assert(['D','F'].includes(mode));
 if(mode==='F'){const full=completeReadings(q.token);q.readings=full.values;q.readings_truncated=full.truncated;}
 return q;
}
module.exports={...base,completeReadings,prepare,contract:()=>base.contract('D'),postprocess:(_mode,raw,qs)=>base.postprocess('D',raw,qs)};
if(require.main===module){
 assert.deepEqual(completeReadings('j4ckp0t').values,['jackpot']);
 assert.deepEqual(completeReadings('B0NUS').values,['BONUS']);
 assert.deepEqual(completeReadings('A4').values,['AA']);
 assert.deepEqual(completeReadings('B2B').values,['BZB']);
 assert.deepEqual(completeReadings('t1cket').values,['ticket','tlcket']);
 assert.deepEqual(completeReadings('plain').values,[]);
 assert(completeReadings('A1111111').truncated);
 const row={node_id:'x',token:'j4ckp0t',target_text:'j4ckp0t 이용 안내',gold:'DO_NOT_LEAK'},q=prepare(row,'F');
 assert.equal(q.target_text,row.target_text);assert.equal(q.token,row.token);assert(!JSON.stringify(base.initialEvidence(q)).includes('DO_NOT_LEAK'));
 console.log('PASS full replacement, alternatives, overflow, original preservation, no label leakage');
}
