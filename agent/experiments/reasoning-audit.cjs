// Report partial experiments only on jointly received responses; never score unattempted cases.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {metrics}=require('./reasoning-navigation.cjs'),{atomic}=require('../src/core/scan.cjs');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function audit(root='.runtime/reasoning-navigation-v2'){
 for(const [f,h]of Object.entries(read(path.join(root,'manifest.json'))))assert.equal(hash(fs.readFileSync(f)),h,'Frozen source changed');
 const budget=read(path.join(root,'budget.json')),results=read(path.join(root,'results.json')),labels=read(path.join(root,'labels.json'));
 const traces=fs.readFileSync(path.join(root,'trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse),pairs=[];
 const out={status:budget.status,reason:budget.reason,planned_calls:180,attempts:budget.requests.length,received:budget.requests.filter(r=>r.http_status===200).length,
  unknown_requests:budget.requests.filter(r=>r.http_status===null).length,elapsed_sec:budget.elapsed_sec,repeats:[],wire_pairs_identical:true,efficacy:'unresolved_when_incomplete',stability:'unmeasured_without_complete_repeats'};
 for(const repeat of [1,2,3]){
  const shared=labels.filter(g=>['none','medium'].every(e=>budget.requests.some(c=>c.repeat===repeat&&c.id===g.node_id&&c.effort===e&&c.http_status===200)));
  if(!shared.length)continue;const ids=new Set(shared.map(g=>g.node_id)),row={repeat,pairs:shared.length,ads:shared.filter(g=>g.is_ad).length,normal:shared.filter(g=>!g.is_ad&&!g.expected_review).length,review:shared.filter(g=>g.expected_review).length,efforts:{}};
  for(const g of shared){const a=traces.find(t=>t.repeat===repeat&&t.id===g.node_id&&t.effort==='none'&&t.event==='llm_request'),b=traces.find(t=>t.repeat===repeat&&t.id===g.node_id&&t.effort==='medium'&&t.event==='llm_request');assert.deepEqual({...a.body,thinking:null},{...b.body,thinking:null});pairs.push({repeat,id:g.node_id});}
  for(const effort of ['none','medium']){const calls=budget.requests.filter(c=>c.repeat===repeat&&ids.has(c.id)&&c.effort===effort);row.efforts[effort]={...metrics(results.filter(r=>r.repeat===repeat&&r.effort===effort&&ids.has(r.id)),shared),format_errors:calls.filter(c=>c.status==='failed').length,tokens:calls.reduce((n,c)=>n+c.tokens,0),mean_service_sec:calls.reduce((n,c)=>n+c.service_sec,0)/calls.length};}
  out.repeats.push(row);
 }
 out.known_tokens=budget.requests.reduce((n,c)=>n+(c.tokens||0),0);out.accounted_tokens=budget.requests.reduce((n,c)=>n+(c.tokens??c.reserved),0);out.queue_sec=budget.requests.reduce((n,c)=>n+c.queue_wait_sec,0);
 out.unmeasured_categories=[...new Set(labels.filter(g=>!pairs.some(p=>p.id===g.node_id)).map(g=>g.kind))];
 const nav=read(path.join(root,'navigation/summary.json'));
 const decision={operating_baseline:'FIFO + reused browser + HCX-007 none + sequential batches up to 16',reasoning:{adopt:false,comparison_completed:budget.status==='completed',effect_established:false,reason:'Incomplete planned repeats; strict output contract failures; preserve none, do not claim medium has no semantic benefit',fifo_followup:'not run: prerequisite not passed'},navigation:{adopt:false,offline_completed:true,gates:nav.gates,reason:'Mean reach gains did not preserve FIFO ad locations; confirmation gain below fixed threshold',paid_followup:'not run: prerequisite not passed'},additional_model_calls:0};
 atomic(root,'paired-audit.json',out);atomic(root,'decision.json',decision);console.log(JSON.stringify({paired:out.repeats,decision,known_tokens:out.known_tokens},null,2));return out;
}
if(require.main===module)audit(process.argv[2]);module.exports={audit};
