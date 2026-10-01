const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {observeTechniques}=require('../src/core/techniques.cjs');
const ROOT='.runtime/technique-collected-v1',read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function main(){assert(!fs.existsSync(ROOT));fs.mkdirSync(ROOT);const rows=read('.runtime/nuri10-filter-collected-v1/inputs.json'),flags=new Map();
 for(const source of read('.runtime/nuri10-filter-collected-v1/sources.json')){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source.path)).digest('hex'),source.sha256);for(const c of read(source.path).candidates)flags.set(JSON.stringify([c.url,c.selector]),!!c.context_evidence?.truncated);}
 const queries=[],owners=[];let hint=0;
 for(const r of rows){const raw=r.raw;assert.equal(typeof raw,'string');const o=observeTechniques({raw_text:raw,node_id:r.node_id,url:r.url,location:r.selector},{raw_text:raw,runs:[],generated_content:false});const ranges=new Map();
  for(const m of raw.matchAll(/[\p{L}\p{N}\p{M}]+/gu)){const start=m.index,end=start+m[0].length;const pending=o.unresolved.some(u=>u.technique==='HOMOGLYPH'&&u.start===start&&u.end===end);if(pending)hint++;
   if(!pending&&!(/[A-Za-z]/.test(m[0])&&/[0-9]/.test(m[0])))continue;
   if(o.observations.some(x=>x.technique==='HOMOGLYPH'&&x.evidence.some(e=>e.start<=start&&e.end>=end)))continue;ranges.set(start+':'+end,{start,end,token:m[0],pending});}
  owners.push({id:r.id,node_id:r.node_id,panel:r.panel,url:r.url,location:r.selector,raw_text:raw,label:r.label,techniques:r.techniques,code_confirmed:o.observations.filter(x=>x.technique==='HOMOGLYPH'),query_count:ranges.size});
  for(const q of ranges.values()){const id=crypto.createHash('sha256').update(r.id+':'+q.start+':'+q.end).digest('hex').slice(0,20);assert.equal(raw.slice(q.start,q.end),q.token);const key=JSON.stringify([r.url,r.selector]);assert(flags.has(key));
   queries.push({id,node_id:id,owner_id:r.id,panel:r.panel,url:r.url,location:r.selector,raw_text:raw,...q,collection_truncated:flags.get(key),input:{target:raw.slice(0,q.start)+'[표기]'+q.token+'[/표기]'+raw.slice(q.end),context:r.input.context},known_ad_label:r.label,known_techniques:r.techniques});}
 }
 assert.equal(new Set(queries.map(x=>x.id)).size,queries.length);fs.writeFileSync(ROOT+'/inputs.json',JSON.stringify(queries,null,2));fs.writeFileSync(ROOT+'/owners.json',JSON.stringify(owners,null,2));const report={owners:rows.length,queries:queries.length,original_hint_tokens:hint,protected_truncated:queries.filter(x=>x.collection_truncated).length,known:queries.filter(x=>x.known_ad_label!==null).map(x=>({id:x.id,panel:x.panel,token:x.token,label:x.known_ad_label,techniques:x.known_techniques,raw_text:x.raw_text}))};fs.writeFileSync(ROOT+'/inventory.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
if(require.main===module)main();
