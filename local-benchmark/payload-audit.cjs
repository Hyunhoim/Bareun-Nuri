// Offline audit only; never calls an API or reads Phase2.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseEnvelope}=require('../agent/src/core/json-envelope.cjs');
const {contract}=require('../agent/src/core/judgment.cjs');
const {transformBody,unpack}=require('./phase1-speed-compact.cjs');
const {estimateRequestTokens}=require('../agent/src/core/llm.cjs');
const out='.runtime/payload-audit-v1'; fs.mkdirSync(out,{recursive:true});
function valid(content,ids){try{const v=parseEnvelope(content),got=Object.keys(v.decisions||{}); assert.deepEqual(got.slice().sort(),ids.slice().sort());contract().validateModelDecisions(got.map(node_id=>({...v.decisions[node_id],node_id})),ids.map(node_id=>({node_id,raw_text:''})));return true;}catch{return false;}}
function describe(rows){const tokens=rows.map(r=>r.output).sort((a,b)=>a-b),sum=k=>rows.reduce((a,r)=>a+r[k],0);return {responses:rows.length,valid:rows.filter(r=>r.valid).length,output_tokens:{min:tokens[0],median:tokens[Math.floor(tokens.length*.5)],p95:tokens[Math.floor(tokens.length*.95)],max:tokens.at(-1)},thresholds:[384,448,512].map(limit=>({limit,above:rows.filter(r=>r.output>limit).length,valid_above:rows.filter(r=>r.valid&&r.output>limit).length,at_limit:rows.filter(r=>r.output===limit).length,reservation_reduction_tokens:rows.length*(512-limit),reservation_reduction_fraction:rows.length*(512-limit)/(sum('input')+rows.length*512)})),details:rows};}
const reports={};
for(const dir of ['phase1-full-1790774023853','phase1-parallel25-1790789676712','phase1-operating-1790735149471']){
 const file=`.runtime/${dir}/scan/trace.jsonl`;if(!fs.existsSync(file))continue;
 const events=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse),req=new Map(),requests=[],rows=[];
 for(const e of events){if(e.event==='llm_request'){req.set(e.call_number,e.body);requests.push(e.body);}if(e.event!=='llm_response')continue;const b=req.get(e.call_number),u=e.data.usage;if(!b||b.maxCompletionTokens!==512||!Number.isFinite(u?.completion_tokens))continue;const ids=JSON.parse(b.messages.find(m=>m.role==='user').content).candidates.map(c=>c.node_id);rows.push({call:e.call_number,input:u.prompt_tokens,output:u.completion_tokens,ids:ids.length,finish:e.data.choices[0].finish_reason,valid:valid(e.data.choices[0].message.content,ids)});}
 reports[dir]=describe(rows);
 if(dir.startsWith('phase1-full')){let before=0,after=0,changed=0;for(const b of requests){const c=transformBody(b);assert.deepEqual(unpack(JSON.parse(c.messages[1].content)),JSON.parse(b.messages[1].content));before+=estimateRequestTokens(b);after+=estimateRequestTokens(c);changed+=JSON.stringify(b)!==JSON.stringify(c)?1:0;}reports.compaction={requests:requests.length,before,after,changed,all_roundtrip_equal:true,reduction:1-after/before};}
}
for(const dir of ['phase1-speed-live-v1','phase1-speed-repeat3-v1','phase1-speed-sweep-v1']){const base=`.runtime/${dir}`;if(!fs.existsSync(base))continue;const rows=[];for(const f of fs.readdirSync(base).filter(f=>/^(?:A\d|B\d|C\dR\d)-\d+\.json$/.test(f))){const r=JSON.parse(fs.readFileSync(path.join(base,f)));if(!r.raw||!r.usage)continue;const data=JSON.parse(r.raw);if(!data.result)continue;rows.push({file:f,input:r.usage.promptTokens,output:r.usage.completionTokens,ids:r.ids?.length,finish:data.result.finishReason,valid:r.validation?.status==='valid'});}if(rows.length)reports[dir]=describe(rows);}
assert(Object.values(reports).filter(x=>x.responses).every(x=>x.details.every(r=>Number.isFinite(r.input)&&Number.isFinite(r.output))));
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(reports,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(reports).map(([k,{details,...v}])=>[k,v])),null,2));
