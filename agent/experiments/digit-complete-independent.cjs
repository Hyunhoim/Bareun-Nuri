// API0 arithmetic audit. Read evaluation data only after the whole experiment finishes.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT='.runtime/digit-complete-live-v1',classes=['substitution','literal','uncertain'];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),ratio=(a,b)=>b?a/b:null,mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function calculate(gold,decisions){
 const labels=new Map(gold.map(g=>[g.node_id,g])),seen=new Set();assert.equal(labels.size,gold.length);assert.equal(decisions.length,gold.length);
 const matrix=Array.from({length:3},()=>[0,0,0]);let exact=0,wrong=0,certified=0;
 for(const d of decisions){const g=labels.get(d.node_id),actual=classes.indexOf(g?.classification),predicted=classes.indexOf(d.classification);
  assert(g&&actual>=0&&predicted>=0&&!seen.has(d.node_id));seen.add(d.node_id);matrix[actual][predicted]++;
  const rightReading=actual===0&&predicted===0&&typeof d.restored==='string'&&d.restored.toUpperCase()===g.reading.toUpperCase();
  if(rightReading)exact++;if(predicted!==2){certified++;if(actual!==predicted||actual===0&&!rightReading)wrong++;}
 }
 const totalRow=i=>matrix[i].reduce((a,b)=>a+b,0),tp=matrix[0][0],fp=matrix[1][0],fn=totalRow(0)-tp;
 const macro=mean(classes.map((_,i)=>{const column=matrix.reduce((s,r)=>s+r[i],0);return ratio(2*matrix[i][i],totalRow(i)+column)||0;}));
 return {n:gold.length,confusion:Object.fromEntries(classes.map((name,i)=>[name,Object.fromEntries(classes.map((other,j)=>[other,matrix[i][j]]))])),
  tp,fp,fn,technique_f1:ratio(2*tp,2*tp+fp+fn),three_class_accuracy:ratio(matrix[0][0]+matrix[1][1]+matrix[2][2],gold.length),macro_f1:macro,
  exact_restoration:exact,restoration_recall:ratio(exact,totalRow(0)),restoration_accuracy_when_predicted_sub:ratio(exact,tp),
  literal_correct:matrix[1][1],literal_uncertain:matrix[1][2],ambiguous_correct:matrix[2][2],ambiguous_overconfirmed:totalRow(2)-matrix[2][2],ambiguous_predicted_sub:matrix[2][0],
  certified,coverage:ratio(certified,gold.length),certified_wrong:wrong,certified_error:ratio(wrong,certified)};
}
function main(){
 const completion=read(ROOT+'/completion.json');assert(['completed','completed_with_failed_conditions'].includes(completion.status),'Whole run must finish before evaluation labels are read');
 const manifest=read(ROOT+'/manifest.json'),audit=read(ROOT+'/audit.json');assert.equal(completion.conditions,manifest.conditions.length);assert.equal(audit.conditions.length,manifest.conditions.length);
 for(const[file,digest]of Object.entries(manifest.hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),digest,'Frozen source mismatch: '+file);
 const verified=[],decisionsByCondition=new Map();let allCalls=0,allTokens=0;
 for(const[index,spec]of manifest.conditions.entries()){
  const name=String(index).padStart(2,'0')+'-'+spec.split+'-'+spec.mode,dir=ROOT+'/'+name,done=read(dir+'/completion.json'),reported=audit.conditions.find(c=>c.condition===name);
  assert(reported);assert.equal(done.status,reported.status);allCalls+=done.calls;allTokens+=done.tokens;
  if(done.status!=='completed'){verified.push({condition:name,status:done.status,score_available:false});continue;}
  const inputs=read(manifest.data+'/'+spec.split+'-inputs.json'),gold=read(manifest.data+'/'+spec.split+'-gold.json'),records=read(dir+'/decisions.json'),calls=read(dir+'/calls.json');
  assert.equal(records.length,spec.requests);assert.equal(calls.length,done.calls);assert.equal(done.calls,spec.requests);
  assert.equal(calls.reduce((n,c)=>n+c.usage.total_tokens,0),done.tokens);
  const ordered=spec.reverse?[...inputs].reverse():inputs,flat=[];
  for(const[i,r]of records.entries()){assert.equal(r.ordinal,i);const expected=ordered.slice(i*4,i*4+4).map(x=>x.node_id).sort();assert.deepEqual(r.decisions.map(x=>x.node_id).sort(),expected);assert.deepEqual(r.raw.map(x=>x.node_id).sort(),expected);flat.push(...r.decisions);}
  assert.deepEqual(gold.map(x=>x.node_id).sort(),inputs.map(x=>x.node_id).sort());const score=calculate(gold,flat);
  for(const[key,value]of Object.entries(score))assert.deepEqual(value,reported.score[key],name+': '+key);
  for(const role of new Set(gold.map(g=>g.role))){const subset=gold.filter(g=>g.role===role),ids=new Set(subset.map(g=>g.node_id)),roleScore=calculate(subset,flat.filter(d=>ids.has(d.node_id)));for(const[key,value]of Object.entries(roleScore))assert.deepEqual(value,reported.by_role[role][key],name+'/'+role+': '+key);}
  verified.push({...done,score});decisionsByCondition.set(name,flat);
 }
 assert.equal(allCalls,audit.calls);assert.equal(allTokens,audit.tokens);
 const summaries={};for(const split of ['dev','evaluation'])for(const mode of ['D','F']){
  const conditions=verified.filter(c=>c.split===split&&c.mode===mode&&c.status==='completed');if(conditions.length!==2)continue;
  const first=decisionsByCondition.get(conditions[0].condition),second=new Map(decisionsByCondition.get(conditions[1].condition).map(d=>[d.node_id,d]));
  const value={mean_f1:mean(conditions.map(c=>c.score.technique_f1)),mean_macro_f1:mean(conditions.map(c=>c.score.macro_f1)),mean_accuracy:mean(conditions.map(c=>c.score.three_class_accuracy)),mean_fp:mean(conditions.map(c=>c.score.fp)),mean_ambiguous_overconfirmed:mean(conditions.map(c=>c.score.ambiguous_overconfirmed)),mean_seconds:mean(conditions.map(c=>c.wall_sec)),mean_tokens:mean(conditions.map(c=>c.tokens)),classification_changes:first.filter(d=>d.classification!==second.get(d.node_id).classification).length,restoration_changes:first.filter(d=>d.restored?.toUpperCase()!==second.get(d.node_id).restored?.toUpperCase()).length};
  assert.deepEqual(value,audit.summaries[split+'-'+mode]);summaries[split+'-'+mode]=value;
 }
 const out={status:'passed',independent_score_implementation:true,conditions:verified,summaries,calls:allCalls,tokens:allTokens,notes:['No API calls or scorer imports.','Evaluation labels read only after whole-run completion.','Technique F1 excludes ambiguous gold; three-class metrics include it.','Source response validation belongs to the separate primary audit.']};
 fs.writeFileSync(ROOT+'/independent-audit.json',JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:out.status,conditions:verified.length,calls:allCalls,tokens:allTokens}));
}
module.exports={calculate};if(require.main===module)main();
