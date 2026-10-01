const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root='.runtime/klue-refinement-v1',old='.runtime/klue-pilot-v2',read=(base,n)=>JSON.parse(fs.readFileSync(`${base}/${n}.json`)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),norm=x=>x.normalize('NFKC').replace(/[\u200b-\u200d\ufeff\s]/g,'');
for(const [f,h]of Object.entries(read(root,'frozen')))assert.equal(sha(f),h);
const frozen=read(old,'frozen');for(const [f,h]of Object.entries(frozen.hashes))assert.equal(sha(f),h);for(const [f,h]of Object.entries(frozen.data_hashes))assert.equal(sha(old+'/'+f),h);
for(const [f,h]of Object.entries(read(root,'manifest').hashes))assert.equal(sha(root+'/'+f),h);
const inputs=read(old,'final-inputs'),reg=read(old,'regression'),gold=read(old,'final-labels'),banned=new Set([...inputs,...reg].map(r=>norm(r.input.target))),seen=new Set();
for(const split of ['train','validation'])for(const r of read(root,split)){assert(!banned.has(norm(r.input.target)));const key=JSON.stringify(r.input);assert(!seen.has(key));seen.add(key);}
const result={audit:'passed',panels:{}};
for(const [name,rows,labels,prevFile]of [['old128',inputs,new Map(gold.map(r=>[r.id,r.label])), 'final-predictions'],['old137',reg,new Map(reg.map(r=>[r.id,r.is_ad===null?3:r.is_ad?0:2])), 'regression-predictions']]){
 const prev=new Map(read(old,prevFile).map(r=>[r.id,r.prediction])),next=new Map(read(root,name+'-predictions').map(r=>[r.id,r.prediction]));assert.equal(next.size,rows.length);
 const counts={tp:0,fp:0,fn:0},changes={lost_tp:[],gained_tp:[],fixed_fp:[],new_fp:[]};
 for(const r of rows){assert(labels.has(r.id)&&prev.has(r.id)&&next.has(r.id));const y=labels.get(r.id),a=prev.get(r.id),b=next.get(r.id);assert(Number.isInteger(b)&&b>=0&&b<4);if(y===3)continue;
 if(y===0){if(b===0)counts.tp++;else counts.fn++;}else if(b===0)counts.fp++;
 const kind=y===0?(a===0&&b!==0?'lost_tp':a!==0&&b===0?'gained_tp':null):(a===0&&b!==0?'fixed_fp':a!==0&&b===0?'new_fp':null);
 if(kind)changes[kind].push({id:r.id,...r.input,before:a,after:b});
 }
 const expected=read(root,'results')[name];for(const key of ['tp','fp','fn'])assert.equal(counts[key],expected.metrics[key]);for(const key of ['lost_tp','gained_tp'])assert.deepEqual(changes[key].map(r=>r.id),expected[key]);
 result.panels[name]={...counts,f1:2*counts.tp/(2*counts.tp+counts.fp+counts.fn),changes,object_string_contexts:rows.filter(r=>r.input.context.includes('[object Object]')).length};
}
fs.writeFileSync(root+'/audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
