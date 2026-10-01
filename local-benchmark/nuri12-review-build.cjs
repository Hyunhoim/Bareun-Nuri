// Purposeful review sampling from already saved public-page evidence, not production filtering.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {contract}=require('../agent/src/core/judgment.cjs');const {context}=require('./klue-scoped-context.cjs');
const root='.runtime/nuri-1.2-human-review-v1',read=p=>JSON.parse(fs.readFileSync(p)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const rows=[],log=read(root+'/capture.json');
for(const entry of log.filter(x=>x.file)){
 assert.equal(sha(fs.readFileSync(root+'/'+entry.file)),entry.sha256);const snap=read(root+'/'+entry.file);const seen=new Set();
 const picked=snap.candidates.filter(c=>{
  const text=c.raw_text.replace(/\s+/g,' ').trim();const region=entry.file==='snapshot-2.json'?c.selector.includes(' > dl > dd'):c.selector.includes(' > table > tbody > tr');
  if(!region||!c.selector.endsWith('p')&&!/ > p:nth-of-type\(\d+\)$/.test(c.selector)||text.length<30||text.length>1800||seen.has(text)||/담당자|팀장|대리.*☎|개인정보관리|COPYRIGHT/i.test(text))return false;
  seen.add(text);return true;
 }).slice(0,10);
 for(const c of picked){const e=contract().initialEvidence(c),input={target:e.normalized_text,context:context(c,e)};rows.push({id:sha(c.url+'\n'+c.location).slice(0,18),url:c.url,page_title:c.page_title,selector:c.selector,frame_urls:c.frame_urls,collected_at:snap.collected_at,snapshot_file:entry.file,snapshot_sha256:entry.sha256,raw:c.raw_text,input,input_sha256:sha(JSON.stringify(input)),page_evidence:picked.map(x=>({selector:x.selector,text:x.raw_text})),decision:null,reviewed:false});}
}
assert(rows.length>0);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);fs.writeFileSync(root+'/review-items.json',JSON.stringify(rows,null,2));
const m=read(root+'/manifest.json');Object.assign(m,{items:rows.length,items_sha256:sha(fs.readFileSync(root+'/review-items.json')),sampling:'Manually inspected content regions of three captured pages; up to10 paragraph elements per source, no predicted labels. Rows from one page are one source group.'});fs.writeFileSync(root+'/manifest.json',JSON.stringify(m,null,2));console.log(JSON.stringify({items:rows.length,pages:new Set(rows.map(r=>r.url)).size}));
