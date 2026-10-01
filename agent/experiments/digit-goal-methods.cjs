// Pilot factors are separate: R changes companions, K changes output contract only.
const assert=require('node:assert/strict'),base=require('./digit-generalization-methods.cjs'),compact=require('./digit-isolated-contract.cjs');
const tokenKey=q=>q.token.normalize('NFKC').toLowerCase();
function regroup(items,size=4){
 const n=Math.ceil(items.length/size),rows=Array.from({length:n},()=>[]);
 for(let slot=0;slot<size;slot++){
  const column=Array.from({length:n},(_,i)=>items[i*size+slot]||null);let selected=null;
  for(let shift=0;shift<n;shift++){const shifted=column.map((_,i)=>column[(i+shift)%n]);if(shifted.every((q,i)=>!q||!rows[i].some(v=>v&&tokenKey(v)===tokenKey(q)))){selected=shifted;break;}}
  if(!selected)throw Error('Cannot preserve slots while separating repeated tokens; do not silently change experiment');
  selected.forEach((q,i)=>rows[i].push(q));
 }
 const batches=rows.map(r=>r.filter(Boolean)).filter(r=>r.length);
 assert.deepEqual(batches.flat().map(x=>x.node_id).sort(),items.map(x=>x.node_id).sort());return batches;
}
function jobs(inputs,reverse,mode){assert(['R','K','D'].includes(mode));const qs=inputs.map(base.prepare);if(reverse)qs.reverse();return mode==='R'?regroup(qs):Array.from({length:Math.ceil(qs.length/4)},(_,i)=>qs.slice(i*4,i*4+4));}
const contract=mode=>mode==='K'?compact.contract():base.contract('D');
const postprocess=(mode,raw,qs)=>mode==='K'?compact.postprocess(mode,raw,qs):base.postprocess('D',raw,qs);
module.exports={jobs,regroup,contract,postprocess};
if(require.main===module){const rows=Array.from({length:56},(_,i)=>({node_id:'n'+i,token:'T'+Math.floor(i/4),target_text:'T'+Math.floor(i/4)}));
 for(const reverse of [false,true]){const qs=reverse?[...rows].reverse():rows,r=jobs(rows,reverse,'R');for(const batch of r){assert.equal(new Set(batch.map(tokenKey)).size,4);batch.forEach((q,j)=>assert.equal(qs.findIndex(x=>x.node_id===q.node_id)%4,j));}}
 assert.throws(()=>regroup(rows.slice(0,4)));assert.deepEqual(jobs(rows,false,'K'),jobs(rows,false,'D'));
 console.log('PASS same input set, slot preservation, token separation, compact input parity');}
