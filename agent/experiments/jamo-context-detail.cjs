const fs=require('node:fs'),path=require('node:path');
const {score}=require('./context-ownership.cjs');
const {groups,specs}=require('./jamo-context-run.cjs');
const read=f=>JSON.parse(fs.readFileSync(f));
function detail(root){const data=groups(),methods=specs(data.oracle),out={original_six:{},changed_reading:{},scenarios:{}};
 const six=read('.runtime/call-budget-600-v1/evaluation.json').controlled64.rows.filter(r=>r.miss_reason==='judgment_false_negative');
 for(const row of six){out.original_six[row.node_id]={raw:JSON.parse(row.key)[2],conditions:{}};for(const m of ['A','B','C','D'])out.original_six[row.node_id].conditions[m]=[0,1].map(r=>read(path.join(root,`replica-${m}-r${r}-decisions.json`)).find(d=>d.node_id===row.node_id).publication_act);}
 for(const g of data.groups){const changed=new Set(g.snapshot.candidates.filter(c=>methods.A.contract.initialEvidence(c).normalized_text!==methods.B.contract.initialEvidence(c).normalized_text).map(c=>c.node_id));
 out.changed_reading[g.name]={count:changed.size,conditions:{}};out.scenarios[g.name]={};
 for(const m of ['A','B','C','D']){out.changed_reading[g.name].conditions[m]=[0,1].map(r=>score(g.labels.filter(l=>changed.has(l.node_id)),read(path.join(root,`${g.name}-${m}-r${r}-decisions.json`))));out.scenarios[g.name][m]=[0,1].map(r=>score(g.labels,read(path.join(root,`${g.name}-${m}-r${r}-decisions.json`))).by_scenario);}}
 fs.writeFileSync(path.join(root,'detail.json'),JSON.stringify(out,null,2));return out;}
if(require.main===module)console.log(JSON.stringify(detail(path.resolve(process.argv[2]||'.runtime/jamo-context-v1')).original_six,null,2));module.exports={detail};
