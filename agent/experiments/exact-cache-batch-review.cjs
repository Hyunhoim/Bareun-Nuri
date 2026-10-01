const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {splitCandidate}=require('../src/core/scan.cjs'),{fitBatch}=require('../src/core/request-budget.cjs'),{contract}=require('../src/core/judgment.cjs');
const root=path.resolve('.runtime/jamo-context-live-c-v1'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f)));
async function main(){
 const state=read('scan/checkpoint.json').state,config=read('manifest.json').settings,gold=read('evaluation.json').controlled64.rows,pages=new Map();
 for(const p of state.pages){const s=read('scan/'+p.evidence.file),work=s.candidates.flatMap(splitCandidate),batches=[];let at=0;while(at<work.length){const b=await fitBatch(work.slice(at,at+4),config,contract(),4);batches.push(b);at+=b.length;}
  const n=batches.length,left=Math.ceil(n/3),right=Math.ceil(2*n/3);
  const ranking=batches.map((batch,index)=>({batch,index,key:index<left?index*3:index<right?(index-left)*3+1:(index-right)*3+2})).sort((a,b)=>a.key-b.key).map(x=>x.batch);
  assert.deepEqual(state.batch_history.filter(x=>x.page_id===p.id).map(x=>x.ids),batches.slice(0,p.batches.length).map(b=>b.map(x=>x.node_id)));
  pages.set(p.id,{work,batches,ranking});
 }
 const result=[];
 for(const count of [100,300,467]){const seen=[new Set(),new Set()],cursor=new Map();for(const h of state.batch_history.slice(0,count)){const n=cursor.get(h.page_id)||0;cursor.set(h.page_id,n+1);const p=pages.get(h.page_id);[p.batches[n],p.ranking[n]].forEach((b,i)=>b.forEach(x=>seen[i].add(x.node_id)));}
  const merged=seen.map(set=>{const groups=new Map();for(const p of pages.values())for(const w of p.work){const id=w.source_node_id||w.node_id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(w.node_id);}return new Set([...groups].filter(([,ids])=>ids.every(x=>set.has(x))).map(([id])=>id));});
  const ads=gold.filter(x=>x.is_ad===true),tp=ads.filter(x=>x.predicted);const row={slots:count,ad_opportunities:merged.map(s=>ads.filter(r=>s.has(r.node_id)).length),prior_tp_opportunities:merged.map(s=>tp.filter(r=>s.has(r.node_id)).length),gained:ads.filter(r=>!merged[0].has(r.node_id)&&merged[1].has(r.node_id)).map(r=>r.node_id),lost:ads.filter(r=>merged[0].has(r.node_id)&&!merged[1].has(r.node_id)).map(r=>r.node_id)};result.push(row);
 }
 const published=JSON.parse(fs.readFileSync('.runtime/batch-order-v1/result.json'));result.forEach((x,i)=>{assert.deepEqual(x.ad_opportunities,[published.comparisons[i].baseline_ads_reached,published.comparisons[i].alternative_ads_reached]);assert.deepEqual(x.gained,published.comparisons[i].gained);assert.deepEqual(x.lost,published.comparisons[i].lost);});
 const missing=gold.filter(r=>r.is_ad===true&&!r.judged);assert.equal(missing.length,7);for(const m of missing){const p=[...pages.values()].find(p=>p.work.some(w=>(w.source_node_id||w.node_id)===m.node_id));assert(p);assert.equal(p.work.filter(w=>(w.source_node_id||w.node_id)===m.node_id).length,1,'Missing diagnostic assumes unsplit gold');}
 const out={api_calls:0,result,unjudged_ads:missing.length,all_seven_collected_and_unsplit:true,full_original_chunk_completion_required:true};fs.writeFileSync('.runtime/exact-cache-v3/batch-review.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
