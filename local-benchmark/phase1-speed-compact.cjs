// Experiment only. Exact repeated field values, never semantic summarization.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {estimateRequestTokens}=require('../agent/src/core/llm.cjs');
const NOTE='\n입력의 shared_values는 반복된 필드 값의 공용표다. 후보의 {"shared_ref":번호}는 그 필드의 원래 값을 shared_values[번호].value로 정확히 대체해서 읽는다. 표의 field는 원래 필드 이름이다. 참조는 내용의 저장 위치만 바꾸며 후보 간 문맥이나 판정을 공유한다는 뜻이 아니다. node_id와 판정대상 및 문맥 귀속은 원래대로 독립 판정한다.';
function pack(input){
 assert(Array.isArray(input.candidates));assert(!Object.hasOwn(input,'shared_values'));
 // Keep literal input objects that would collide with the reference syntax unchanged.
 if(input.candidates.some(c=>Object.values(c).some(v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&Object.hasOwn(v,'shared_ref'))))return structuredClone(input);
 const groups=new Map();
 for(const c of input.candidates)for(const [field,value]of Object.entries(c)){
  if(field==='node_id')continue;
  const raw=JSON.stringify(value);if(raw.length<80)continue;
  const key=JSON.stringify([field,value]);const g=groups.get(key)||{field,value,count:0};g.count++;groups.set(key,g);
 }
 const shared=[],refs=new Map();
 for(const [key,g]of groups){
  if(g.count<2)continue;
  const index=shared.length,entry={field:g.field,value:g.value},ref={shared_ref:index};
  if(g.count*JSON.stringify(g.value).length<=JSON.stringify(entry).length+g.count*JSON.stringify(ref).length+1)continue;
  refs.set(key,index);shared.push(entry);
 }
 if(!shared.length)return structuredClone(input);
 const result=structuredClone(input);
 result.candidates=result.candidates.map(c=>Object.fromEntries(Object.entries(c).map(([field,value])=>{
  const index=refs.get(JSON.stringify([field,value]));return [field,index===undefined?value:{shared_ref:index}];
 })));
 result.shared_values=shared;return result;
}
function unpack(input){
 const result=structuredClone(input);if(!Object.hasOwn(result,'shared_values'))return result;
 const shared=result.shared_values;assert(Array.isArray(shared));delete result.shared_values;
 result.candidates=result.candidates.map(c=>Object.fromEntries(Object.entries(c).map(([field,value])=>{
  if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'shared_ref')){
   const index=value.shared_ref;assert(Number.isInteger(index)&&index>=0&&index<shared.length);assert.equal(shared[index].field,field);
   return [field,structuredClone(shared[index].value)];
  }return [field,value];
 })));
 return result;
}
function transformBody(body){
 const result=structuredClone(body),user=result.messages.find(m=>m.role==='user'),system=result.messages.find(m=>m.role==='system');
 assert(user&&system);const original=JSON.parse(user.content),packed=pack(original);assert.deepEqual(unpack(packed),original);
 if(!packed.shared_values)return result;
 user.content=JSON.stringify(packed);system.content+=NOTE;
 // Do not charge an input expansion merely to make the representation uniform.
 if(estimateRequestTokens(result)>=estimateRequestTokens(body))return structuredClone(body);
 return result;
}
function selfCheck(){
 const value={boundary:{tag:'article',role:null,document_scope:false},target_quoted:false,truncated:false};
 const input={role:'judge',candidates:Array.from({length:12},(_,i)=>({node_id:'n'+i,scope:value,passage:'original '+i}))};
 const old=structuredClone(input),packed=pack(input);assert(packed.shared_values.length);assert.deepEqual(unpack(packed),input);assert.deepEqual(input,old);
 const bad=structuredClone(packed);bad.candidates[0].scope.shared_ref=999;assert.throws(()=>unpack(bad));
 const altered=structuredClone(input);altered.candidates[0].scope.truncated=true;assert.deepEqual(unpack(pack(altered)),altered);
 const singleton={candidates:[input.candidates[0]]};assert.deepEqual(pack(singleton),singleton);
 const collision=structuredClone(input);collision.candidates[0].literal={shared_ref:0};assert.deepEqual(pack(collision),collision);
}
function diagnose(traceFile,outFile){
 selfCheck();const rows=fs.readFileSync(traceFile,'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.event==='llm_request');
 const details=rows.map((e,index)=>{
  const compact=transformBody(e.body),old=JSON.parse(e.body.messages.find(m=>m.role==='user').content),value=JSON.parse(compact.messages.find(m=>m.role==='user').content);
  assert.deepEqual(unpack(value),old);
  return {index,call_number:e.call_number,candidates:old.candidates.length,changed:JSON.stringify(e.body)!==JSON.stringify(compact),shared_fields:value.shared_values?.map(x=>x.field)||[],before_chars:JSON.stringify(e.body).length,after_chars:JSON.stringify(compact).length,before_estimate:estimateRequestTokens(e.body),after_estimate:estimateRequestTokens(compact)};
 });
 const sum=k=>details.reduce((n,r)=>n+r[k],0),report={requests:details.length,candidates:sum('candidates'),changed:details.filter(r=>r.changed).length,before_chars:sum('before_chars'),after_chars:sum('after_chars'),before_estimate:sum('before_estimate'),after_estimate:sum('after_estimate'),roundtrip_all:true,token_measurement:'local conservative reservation estimate, not provider token count',details};
 report.estimated_reduction=1-report.after_estimate/report.before_estimate;report.char_reduction=1-report.after_chars/report.before_chars;
 fs.mkdirSync(path.dirname(outFile),{recursive:true});fs.writeFileSync(outFile,JSON.stringify(report,null,2));const {details:_,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(require.main===module)diagnose(process.argv[2]||'.runtime/phase1-full-1790774023853/scan/trace.jsonl',process.argv[3]||'.runtime/phase1-speed-compact-v1/diagnostic.json');
module.exports={pack,unpack,transformBody,selfCheck,diagnose,NOTE};
