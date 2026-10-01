// API0 pilot scoring: historic controls select candidates, not final adoption.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const methods=require('./digit-request-methods.cjs'),{calculate}=require('./digit-generalization-independent.cjs'),{parseEnvelope}=require('../src/core/json-envelope.cjs');
const ROOT='.runtime/digit-request-pilot-v1',read=p=>JSON.parse(fs.readFileSync(p,'utf8')),manifest=read(ROOT+'/manifest.json'),final=process.argv.includes('--final'),conditions=[];
if(final)assert(['completed','completed_with_failed_conditions'].includes(read(ROOT+'/completion.json').status));
for(const[p,h]of Object.entries(manifest.hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),h);
const old=read('.runtime/digit-complete-live-v1/audit.json');
for(const[index,spec]of manifest.conditions.entries()){
 const name=String(index).padStart(2,'0')+'-'+spec.split+'-'+spec.mode,dir=ROOT+'/'+name;if(!fs.existsSync(dir+'/completion.json'))continue;
 const done=read(dir+'/completion.json');if(done.status!=='completed'){conditions.push(done);continue;}
 const inputs=read(manifest.data+'/'+spec.split+'-inputs.json'),gold=read(manifest.data+'/'+spec.split+'-gold.json'),jobs=methods.jobs(inputs,spec.reverse,spec.mode),records=read(dir+'/decisions.json'),calls=read(dir+'/calls.json');
 const trace=fs.readFileSync(dir+'/trace.jsonl','utf8').trim().split(/\r?\n/).map(JSON.parse),req=trace.filter(x=>x.event==='llm_request'),res=trace.filter(x=>x.event==='llm_response'),contract=methods.contract(spec.mode),flat=[];let foreign=0,invalid=0;
 for(const a of [records,calls,req,res])assert.equal(a.length,jobs.length);
 for(const[i,qs]of jobs.entries()){
  assert.deepEqual(JSON.parse(req[i].body.messages[1].content).candidates,qs.map(contract.initialEvidence));assert.equal(req[i].body.maxCompletionTokens,1024);assert.equal(calls[i].http_status,200);assert.equal(calls[i].status,'ok');assert.equal(res[i].data.choices[0].finish_reason,'stop');
  const parsed=parseEnvelope(res[i].data.choices[0].message.content),raw=contract.validateModelDecisions(Object.entries(parsed.decisions).map(([node_id,d])=>({node_id,...d})),qs),sort=a=>[...a].sort((x,y)=>x.node_id.localeCompare(y.node_id));
  assert.deepEqual(sort(raw),sort(records[i].raw));assert.deepEqual(methods.postprocess(spec.mode,records[i].raw,qs),records[i].decisions);flat.push(...records[i].decisions);
  if(spec.mode==='R')for(const d of raw){const q=qs.find(q=>q.node_id===d.node_id),quote=d.evidence,owned=quote&&(q.target_text.includes(quote)||q.context.includes(quote));if(quote&&!owned){invalid++;if(qs.some(other=>other.node_id!==q.node_id&&(other.target_text.includes(quote)||other.context.includes(quote))))foreign++;}}
 }
 assert.equal(flat.length,56);assert.equal(new Set(flat.map(d=>d.node_id)).size,56);assert.equal(calls.reduce((s,c)=>s+c.usage.total_tokens,0),done.tokens);
 const score=calculate(gold,flat);const tp=gold.filter(g=>g.classification==='substitution'&&flat.find(d=>d.node_id===g.node_id).classification==='substitution').length,fp=gold.filter(g=>g.classification==='literal'&&flat.find(d=>d.node_id===g.node_id).classification==='substitution').length;
 assert.equal(score.tp,tp);assert.equal(score.fp,fp);assert.equal(score.technique_f1,2*tp/(2*tp+fp+24-tp));
 if(true)for(const key of ['exact_restoration','restoration_recall','restoration_accuracy_when_predicted_sub','certified_wrong','certified_error'])score[key]=null;
 score.certified_classification_wrong=flat.filter(d=>d.classification!=='uncertain'&&d.classification!==gold.find(g=>g.node_id===d.node_id).classification).length;
 const previous=old.conditions.find(c=>c.split===spec.split&&c.reverse===spec.reverse&&c.mode==='D'),prior=read('.runtime/digit-complete-live-v1/'+previous.condition+'/decisions.json').flatMap(r=>r.decisions),pred=new Map(flat.map(d=>[d.node_id,d]));
 const lost=gold.filter(g=>g.classification==='substitution'&&prior.find(d=>d.node_id===g.node_id).classification==='substitution'&&pred.get(g.node_id).classification!=='substitution').map(g=>g.node_id),gained=gold.filter(g=>g.classification==='substitution'&&prior.find(d=>d.node_id===g.node_id).classification!=='substitution'&&pred.get(g.node_id).classification==='substitution').map(g=>g.node_id);
 conditions.push({...done,score,attribution:spec.mode==='R'?{foreign_exact_quote:foreign,invalid_quote:invalid}:null,historic_control:previous.condition,lost_tp:lost,gained_tp:gained,max_output:Math.max(...calls.map(c=>c.usage.completion_tokens))});
}
const result={conditions,calls:conditions.reduce((s,c)=>s+c.calls,0),tokens:conditions.reduce((s,c)=>s+c.tokens,0),production_adoption:false};
if(final)assert.equal(conditions.length,6);fs.writeFileSync(ROOT+(final?'/audit.json':'/progress-audit.json'),JSON.stringify(result,null,2),final?{flag:'wx'}:{});
console.log(JSON.stringify({calls:result.calls,tokens:result.tokens,conditions:conditions.map(c=>({name:c.condition,status:c.status,tp:c.score?.tp,fp:c.score?.fp,fn:c.score?.fn,f1:c.score?.technique_f1,macro:c.score?.macro_f1,ambiguous:c.score?.ambiguous_overconfirmed,lost:c.lost_tp?.length,gained:c.gained_tp?.length,attribution:c.attribution}))},null,2));
