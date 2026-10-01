// Final output and resume parity with positive/review/long-text/observation cases.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const core=require('../src/core/scan.cjs'),bounded=require('./bounded-scan.cjs');
const root=path.resolve('.runtime/bounded-results-'+Date.now()),entry='http://results.local/',urls=[entry,entry+'one',entry+'two'];
global.fetch=()=>{throw Error('Network forbidden');};
const kinds=[['positive','review','normal_partial','long_positive'],['double','review_unresolved','normal','long_review'],['positive_partial','positive_and_partial','normal','positive']];
const snapshots=urls.map((url,p)=>({pages:[{url,readiness:{settled:true},navigation:{links:p===0?urls.slice(1).map(url=>({url})):[]}}],collection_issues:[],candidates:kinds[p].map((kind,i)=>({node_id:`p${p}n${i}`,url,location:'#text-'+i,selector:'#text-'+i,raw_text:kind.startsWith('long')?'장문 구간 근거 '.repeat(1600):'ㄱㅏ 원문 근거 '+kind,normalized_text:'판정 원문',signals:[],links:[],frame_urls:[],ancestors:[],own_style:{}}))}));
const kindById=new Map(snapshots.flatMap((s,p)=>s.candidates.map((c,i)=>[c.node_id,kinds[p][i]])));
for(const snapshot of snapshots)snapshot.technique_observations=snapshot.candidates.map(c=>{
 const kind=kindById.get(c.node_id),observations=[];
 function add(technique,partial=false){const end=partial?1:c.raw_text.length;observations.push({technique,coverage:['TRANSPARENT','OFFSCREEN'].includes(technique)?partial?'partial-text':'all-text':'text-span',evidence:[{technique,reason:'offline-fixture',start:0,end,text:c.raw_text.slice(0,end)}]});}
 if(['positive','double','positive_and_partial'].includes(kind))add('JAMO');
 if(['long_positive','double'].includes(kind))add('OFFSCREEN');
 if(kind.includes('partial'))add('TRANSPARENT',true);
 return{node_id:c.node_id,url:c.url,location:c.location,raw_text:c.raw_text,version:1,observations,unresolved:kind==='review_unresolved'?[{technique:'HOMOGLYPH',reason:'ambiguous-script-or-digit-substitution'}]:[]};
});
function judge({onRequestState},inputLog){const calls=[];return{calls,tracksRequests:true,fitBatch:async xs=>xs.slice(0,4),decide:async xs=>{
 calls.push({number:calls.length+1,status:'ok',usage:{total_tokens:0}});onRequestState({phase:'sent'});inputLog.push(structuredClone(xs));onRequestState({phase:'responded'});
 return xs.map(c=>{const kind=kindById.get(c.source_node_id||c.node_id),positive=kind==='long_positive'?c.source_start===5600:['positive','double','positive_partial','positive_and_partial'].includes(kind),review=kind==='long_review'?c.source_start===5600:kind.startsWith('review');return{node_id:c.node_id,is_violation:positive,needs_review:review,techniques:positive?['JAMO']:[],observed_techniques:[],reason:review?'근거 부족':positive?'근거 확인':'일반 안내'};});
}};}
const read=(dir,name)=>JSON.parse(fs.readFileSync(path.join(dir,name)));
function compareOutputs(a,b){for(const name of ['diagnostics.json','technique-diagnostics.json'])assert.deepEqual(read(b,name),read(a,name),name);assert.deepEqual(read(b,'result.json').findings,read(a,'result.json').findings);assert.deepEqual(read(b,'coverage.json').unjudged,[]);}
async function main(){
 const logs={core:[],bounded:[],resume:[]},common={entry,scope:'/',mode:'fifo',identity:{provider:'mock',code:'results-parity'},limits:{pages:10,calls:100,seconds:60,nodes:0},observeTechniques:true,readPage:async url=>structuredClone(snapshots[urls.indexOf(url)])};
 const a=path.join(root,'core'),b=path.join(root,'bounded'),r=path.join(root,'resume');
 const old=await core.run({...common,dir:a,createJudge:x=>judge(x,logs.core)}),full=await bounded.run({...common,dir:b,policy:'srpt',activeWindow:8,createJudge:x=>judge(x,logs.bounded)});
 assert.equal(old.status,'completed',old.reason);assert.equal(full.status,'completed',full.reason);compareOutputs(a,b);
 const expectedWork=snapshots.flatMap(s=>s.candidates.flatMap(core.splitCandidate));
 for(const name of ['core','bounded']){const input=logs[name].flat();assert.equal(new Set(input.map(c=>c.node_id)).size,expectedWork.length);assert.deepEqual([...input].sort((x,y)=>x.node_id.localeCompare(y.node_id)),[...expectedWork].sort((x,y)=>x.node_id.localeCompare(y.node_id)));assert(logs[name].every(xs=>xs.length<=4));}
 const first=await bounded.run({...common,dir:r,policy:'srpt',activeWindow:8,limits:{...common.limits,calls:1},createJudge:x=>judge(x,logs.resume)});assert.equal(first.reason,'call_budget');assert(!read(r,'result.json').findings.some(f=>f.evidence_text===snapshots[0].candidates[3].raw_text));
 const before=bounded.materialize(r,first),resumed=await bounded.run({...common,dir:r,policy:'srpt',activeWindow:8,createJudge:x=>judge(x,logs.resume)});assert.equal(resumed.status,'completed',resumed.reason);assert.deepEqual(resumed.batch_history,full.batch_history);assert.deepEqual(logs.resume,logs.bounded);compareOutputs(a,r);
 const after=bounded.materialize(r,resumed);for(const d of before.decisions)assert.deepEqual(after.decisions.find(x=>x.node_id===d.node_id),d);
 const findings=read(b,'result.json').findings,diags=read(b,'diagnostics.json'),tech=read(b,'technique-diagnostics.json');assert(findings.length>=6);assert.equal(new Set(findings.map(f=>f.url)).size,3);assert.deepEqual(findings.map(f=>f.id),findings.map((_,i)=>'f_'+String(i+1).padStart(4,'0')));assert(findings.some(f=>f.evidence_text===snapshots[0].candidates[3].raw_text));assert(diags.some(d=>d.node_id==='p1n3'&&d.needs_review));assert(diags.some(d=>d.node_id==='p1n1'&&d.intent_needs_review&&d.technique_needs_review));assert(tech.some(d=>d.node_id==='p2n0'));assert(tech.some(d=>d.node_id==='p0n2'&&!d.is_violation));
 const result={status:'passed',diagnostic_order_equal:true,root,api_calls:0,browser_launches:0,pages:3,candidates:12,work:expectedWork.length,findings:findings.length,diagnostics:diags.length,technique_diagnostics:tech.length,checks:['exact final core findings including IDs/location/raw/technique','semantic and observation diagnostic content and order equality','long positive/review chunk integration','no premature long result','identical input work multiset and max4 batches','multi-page finding ID renumbering','exact interrupted/resumed request batches and prior decisions']};fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}main().catch(e=>{console.error(e);process.exitCode=1;});
