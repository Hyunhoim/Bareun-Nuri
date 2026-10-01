// Saved-input replay through the production exporter; no browser or API calls.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {outputResult}=require('../src/core/output.cjs');
const root='.runtime/canine-technique-v1',data='.runtime/technique-specialist-data-v3';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
assert(read(root+'/evaluation/completed.json').completed);
const report=read(root+'/report.json'),result={};
for(const arm of ['existing','klue_uts','canine_plain','canine_uts']){
  result[arm]={};
  const predictions=read(root+'/evaluation/'+arm+'.json').panels;
  for(const split of ['dev','final']){
    const rows=read(data+'/'+split+'-inputs.json'),gold=read(data+'/'+split+'-gold.json');
    const intent=new Map(read('.runtime/technique-specialist-intent-v1/'+split+'-decisions.json').map(x=>[x.node_id,x]));
    const pred=new Map(predictions[split].rows.map(x=>[x.id,x.label]));
    const key=x=>JSON.stringify([x.url,x.location,'HOMOGLYPH']);
    const expected=new Set(rows.filter((x,i)=>{assert.equal(x.id,gold[i].id);return gold[i].is_ad&&gold[i].label===0;}).map(key));
    const ds=rows.map(x=>{const d=intent.get(x.id);assert(d);return {...d,techniques:d.is_violation&&pred.get(x.id)===0?['HOMOGLYPH']:[]};});
    const out=outputResult({entry_url:'http://127.0.0.1:64920/'+split,candidates:rows.map(x=>({...x,node_id:x.id}))},ds,new Date().toISOString(),0,'hcx');
    const found=new Set(out.result.findings.map(key));assert.equal(found.size,out.result.findings.length);
    const tp=[...found].filter(x=>expected.has(x)).length,fp=found.size-tp,fn=expected.size-tp;
    assert.deepEqual({tp,fp,fn,f1:2*tp/(2*tp+fp+fn)},report[arm][split].hcx_combined);
    result[arm][split]={tp,fp,fn,f1:2*tp/(2*tp+fp+fn)};
    fs.writeFileSync(root+'/evaluation/'+arm+'-'+split+'-result.json',JSON.stringify(out.result,null,2));
  }
}
fs.writeFileSync(root+'/export-audit.json',JSON.stringify({api_calls:0,production_changed:false,results:result},null,2));
console.log(JSON.stringify(result));
