// Offline experiment only. Production parser and failed checkpoint stay untouched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseEnvelope}=require('../agent/src/core/json-envelope.cjs');
function parseCandidate(content){
 const text=content.trim(),m=/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
 return parseEnvelope(m?m[1]+'\n'+(m[2]||''):content);
}
function main(dir){
 const p=path.join(dir,'baseline/scan'),trace=fs.readFileSync(path.join(p,'trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse),requests=new Map(trace.filter(e=>e.event==='llm_request').map(e=>[e.call_number,e]));
 const cp=JSON.parse(fs.readFileSync(path.join(p,'checkpoint.json'))),work=require('../agent/src/core/bounded-scan-store.cjs').materialize(p,cp.state).work,by=new Map(work.map(c=>[c.node_id,c]));
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(path.join(p,'checkpoint.json'))).digest('hex'),before=hash();let preserved=0;const recovered=[];
 for(const e of trace.filter(e=>e.event==='llm_response')){
  const text=e.data.choices[0].message.content,value=parseCandidate(text);let old;try{old=parseEnvelope(text);}catch{}
  if(old){assert.deepEqual(value,old);preserved++;}else{
   const cs=JSON.parse(requests.get(e.call_number).body.messages[1].content).candidates.map(c=>by.get(c.node_id));assert(cs.every(Boolean));
   const ds=require('../agent/src/core/judgment.cjs').contract().validateModelDecisions(Object.entries(value.decisions).map(([node_id,d])=>({...d,node_id})),cs);
   recovered.push({call:e.call_number,ids:ds.map(d=>d.node_id),decisions:ds});
  }
 }
 const j='{"decisions":{}}';assert.deepEqual(parseCandidate('```json\n'+j+'\n```\n설명입니다.'),{decisions:{}});
 for(const x of ['앞 설명\n```json\n'+j+'\n```','```json\n'+j+'\n```\n{}','```json\n'+j+'\n```\n```text\nextra\n```','```json\n{"x":1,"x":2}\n```\n설명','```json\n{"x":\n```\n설명','```json\n'+j+j+'\n```\n설명'])assert.throws(()=>parseCandidate(x));
 assert.equal(hash(),before);const out=path.join(dir,'response-audit.json');assert(!fs.existsSync(out));fs.writeFileSync(out,JSON.stringify({preserved,recovered,checkpoint_unchanged:true,production_modified:false,api:0,scope:'Offline candidate parser only; recovered output is not committed'},null,2));console.log({preserved,recovered_calls:recovered.map(r=>r.call),api:0});
}
module.exports={parseCandidate};if(require.main===module)main(path.resolve(process.argv[2]));
