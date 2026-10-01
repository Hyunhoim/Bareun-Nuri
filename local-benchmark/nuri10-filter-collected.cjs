const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {contract}=require('../agent/src/core/judgment.cjs');
const {context}=require('./klue-scoped-context.cjs');
const root='.runtime/nuri10-filter-collected-v1',read=f=>JSON.parse(fs.readFileSync(f));
assert(!fs.existsSync(root));fs.mkdirSync(root);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const controlled=read('.runtime/scale-large-live-v1/evaluation.json').controlled64.rows;
const gold=new Map(controlled.map(r=>[r.node_id,r]));
const human=read('.runtime/nuri-1.2-human-review-v1/review-items.json');
const answers=read('.runtime/nuri-1.2-human-review-v1/human-review-chat-answers.json').answers;
assert(human.length===17&&answers.every(r=>r.decision===2&&r.reviewed));
const humanMap=new Map(human.map(r=>[r.url+'\n'+r.selector,r]));
const rows=[],seen=new Set(),sources=[];
for(const [panel,dir] of [['real','.runtime/real-context-review-v1'],['real','.runtime/nuri-1.2-human-review-v1'],['replica','.runtime/scale-large-live-v1/snapshots']]){
 for(const f of fs.readdirSync(dir).filter(f=>panel==='real'?/^snapshot-.*\.json$/.test(f):f.endsWith('.json')).sort()){
  const path=dir+'/'+f,s=read(path);sources.push({path,sha256:sha(fs.readFileSync(path)),candidates:s.candidates.length});
  for(const c of s.candidates){
   const key=panel+'\n'+c.url+'\n'+c.location;if(seen.has(key))continue;seen.add(key);
   const e=contract().initialEvidence(c),g=panel==='replica'?gold.get(c.node_id):null,h=panel==='real'?humanMap.get(c.url+'\n'+c.selector):null;
   if(g)assert.equal(JSON.parse(g.key)[2],c.raw_text);
   if(h)assert.equal(h.raw,c.raw_text);
   const tags=[c.own_style,...(c.ancestors||[])].map(x=>x?.tag||'');
   const area=tags.includes('nav')?'navigation':tags.includes('footer')?'footer':tags.includes('header')?'header':/^h[1-6]$/.test(tags[0])?'heading':tags.includes('article')?'article':'other';
   rows.push({id:sha(key).slice(0,24),panel,url:c.url,selector:c.selector,node_id:c.node_id,area,raw:c.raw_text,input:{target:e.normalized_text,context:context(c,e)},label:g?(g.is_ad===true?0:g.is_ad===false?2:3):h?2:null,techniques:g?.technique_gold||[],label_source:g?'controlled64':h?'human17':'unknown'});
  }
 }
}
assert.equal(rows.filter(r=>r.panel==='replica'&&r.label!==null).length,64);
fs.writeFileSync(root+'/inputs.json',JSON.stringify(rows,null,2));
fs.writeFileSync(root+'/sources.json',JSON.stringify(sources,null,2));
console.log(JSON.stringify({rows:rows.length,real:rows.filter(r=>r.panel==='real').length,replica:rows.filter(r=>r.panel==='replica').length,human:rows.filter(r=>r.label_source==='human17').length}));
