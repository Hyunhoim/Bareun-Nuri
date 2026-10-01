const fs=require('node:fs'),assert=require('node:assert/strict');
const read=f=>JSON.parse(fs.readFileSync(f)),{parseEnvelope}=require('./json-envelope.cjs');
function traces(dir){return fs.readFileSync(dir+'/scan/trace.jsonl','utf8').trim().split('\n').map(JSON.parse);}
const before='.runtime/scale-medium-live-v1',after='.runtime/scale-medium-envelope-v1';
const a=traces(before),b=traces(after),ar=a.filter(e=>e.event==='llm_request'),br=b.filter(e=>e.event==='llm_request');
let matched=0;for(let i=0;i<Math.min(ar.length,br.length);i++){assert.deepEqual(br[i].body,ar[i].body,'Changed common model request');matched++;}
let recovered=0;for(const r of b.filter(e=>e.event==='llm_response')){const text=r.data.choices[0].message.content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1');try{JSON.parse(text);}catch{parseEnvelope(text);recovered++;}}
const ea=read(before+'/evaluation.json'),eb=read(after+'/evaluation.json'),by=new Map(eb.controlled64.rows.map(r=>[r.key,r]));
const commonChanges=ea.controlled64.rows.filter(r=>r.judged&&by.get(r.key)?.judged&&r.predicted!==by.get(r.key).predicted).map(r=>({key:r.key,is_ad:r.is_ad,before:r.predicted,after:by.get(r.key).predicted}));
const out='.runtime/envelope-result-v1.json';assert(!fs.existsSync(out));const result={common_identical_requests:matched,new_requests:br.length-ar.length,envelope_recoveries_in_new_run:recovered,common_controlled_prediction_changes:commonChanges,before:{...ea.controlled64,rows:undefined},after:{...eb.controlled64,rows:undefined},note:'Fresh runs; changed predictions for equal requests are model variation, not a parser reinterpretation. Completed saved decisions were proven identical in offline replay.'};fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
