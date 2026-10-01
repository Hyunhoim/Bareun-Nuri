const fs=require('node:fs'),assert=require('node:assert/strict');
const root='.runtime/technique-collected-v1',read=n=>JSON.parse(fs.readFileSync(root+'/'+n,'utf8'));
const rows=read('inputs.json'),models=read('models.json'),owners=new Map(read('owners.json').map(r=>[r.id,r]));
for(const r of rows){const o=owners.get(r.owner_id);assert.equal(r.raw_text,o.raw_text);assert.equal(r.url,o.url);assert.equal(r.location,o.location);assert.equal(r.raw_text.slice(r.start,r.end),r.token);assert.equal(r.input.target,r.raw_text.slice(0,r.start)+'[표기]'+r.token+'[/표기]'+r.raw_text.slice(r.end));}
const eligible=models.first.rows.filter(r=>!r.protected).map(r=>r.id),allowed=new Set(eligible);
assert.equal(allowed.size,21);assert.equal(rows.length,80);
const f=read('hcx-forward/decisions.json'),b=read('hcx-reverse/decisions.json');
for(const a of [f,b]){assert.equal(a.length,allowed.size);assert.equal(new Set(a.map(r=>r.node_id)).size,allowed.size);for(const r of a)assert(allowed.has(r.node_id));}
const reverse=new Map(b.map(r=>[r.node_id,r.classification]));
const changed=f.filter(r=>r.classification!==reverse.get(r.node_id)).map(r=>({id:r.node_id,token:rows.find(x=>x.id===r.node_id).token,forward:r.classification,reverse:reverse.get(r.node_id)}));
const comparison=read('comparison.json');
for(const k of ['first','role','agreement']){comparison.models[k].protected_unprocessed=59;comparison.models[k].decided=21;comparison.models[k].unprocessed=59;comparison.models[k].note='80 stored records include 59 protected uncertain placeholders; not 80 completed judgments';}
fs.writeFileSync(root+'/comparison.json',JSON.stringify(comparison,null,2));
const result={identity_checks:rows.length,eligible:21,protected_unprocessed:59,order_changes:changed,forward:read('hcx-forward/completion.json'),reverse:read('hcx-reverse/completion.json')};
fs.writeFileSync(root+'/audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
