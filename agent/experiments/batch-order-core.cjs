const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {splitCandidate}=require('../src/core/scan.cjs'),{fitBatch}=require('../src/core/request-budget.cjs');
const {rotate}=require('./batch-order-diagnostic.cjs');
async function prepareSnapshot(snapshot,config,contract){
 const work=snapshot.candidates.flatMap(splitCandidate),batches=[];
 for(let at=0;at<work.length;){const batch=await fitBatch(work.slice(at,at+4),config,contract,4);batches.push(batch.map(c=>c.node_id));at+=batch.length;}
 return {...snapshot,experimental_work_batches:rotate(batches)};
}
function plannedWork(snapshot){const original=snapshot.candidates.flatMap(splitCandidate),byId=new Map(original.map(c=>[c.node_id,c])),ids=snapshot.experimental_work_batches.flat();assert.equal(ids.length,original.length);assert.equal(new Set(ids).size,original.length);assert(ids.every(id=>byId.has(id)));return ids.map(id=>byId.get(id));}
function replaceOnce(s,from,to){assert.equal(s.split(from).length,2,'Clone patch drift: '+from);return s.replace(from,to);}
function loadCore(){
 const coreDir=path.resolve(__dirname,'../src/core'),dir=path.resolve(__dirname,'../../.runtime/batch-order-core-v1');fs.mkdirSync(dir,{recursive:true});
 function dependencies(s){return s.replace(/require\('\.\/([^']+)'\)/g,(all,f)=>'require('+JSON.stringify(path.join(coreDir,f))+')');}
 let store=dependencies(fs.readFileSync(path.join(coreDir,'bounded-scan-store.cjs'),'utf8'));
 store="const {plannedWork}=require("+JSON.stringify(__filename)+");\n"+store;
 assert.equal(store.split('snapshot.candidates.flatMap(splitCandidate)').length,3);store=store.replaceAll('snapshot.candidates.flatMap(splitCandidate)','plannedWork(snapshot)');
 store=replaceOnce(store,'{snapshot,work:plannedWork(snapshot),decisions:','{snapshot,work:plannedWork(snapshot),plan:snapshot.experimental_work_batches,decisions:');
 fs.writeFileSync(path.join(dir,'store.cjs'),store);
 let core=dependencies(fs.readFileSync(path.join(coreDir,'bounded-scan.cjs'),'utf8'));
 core=replaceOnce(core,'require('+JSON.stringify(path.join(coreDir,'bounded-scan-store.cjs'))+')','require("./store.cjs")');
 core=replaceOnce(core,"format:'bounded-evidence-v2'","format:'experimental-three-region-batches-v1'");
 core=replaceOnce(core,'proposed=data.work.slice(selected.offset,selected.offset+4)','planned=data.plan[selected.batches.length],proposed=data.work.slice(selected.offset,selected.offset+planned.length)');
 core=replaceOnce(core,'assert(batch.length&&batch.length<=4&&batch.every((c,i)=>c===proposed[i]));','assert.deepEqual(proposed.map(c=>c.node_id),planned);assert.equal(batch.length,proposed.length);assert(batch.length&&batch.length<=4&&batch.every((c,i)=>c===proposed[i]));');
 fs.writeFileSync(path.join(dir,'core.cjs'),core);
 return {core:require(path.join(dir,'core.cjs')),sourceFiles:[__filename,path.join(__dirname,'batch-order-diagnostic.cjs'),path.join(dir,'core.cjs'),path.join(dir,'store.cjs')]};
}
module.exports={prepareSnapshot,plannedWork,loadCore};
