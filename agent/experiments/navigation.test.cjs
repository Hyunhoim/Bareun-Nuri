const assert=require('node:assert/strict');
const {simulate,inspectPage,inspectXML}=require('./navigation.cjs'),{replay}=require('./priority.cjs');
const {canonical}=require('../src/core/collect.cjs');
const {chromium}=require('playwright');
const entry='http://example.test/',u=s=>new URL(s,entry).href;
const link=(s,text='',group='x',content_scope=false)=>({url:u(s),text,group,content_scope});
const pages=[{url:entry,links:[link('a'),link('b','게시판'),link('a#same'),link('https://outside.test/')]},
 {url:u('a'),links:[link('deep','게시판','item',true)]},{url:u('b'),links:[link('')],detail:true},
 {url:u('deep'),links:[],detail:true}].map(p=>({...p,status:200,bytes:50,fingerprint:p.url}));
const lookup=new Map(pages.map(p=>[canonical(p.url),p]));
async function main(){
 for(const mode of ['fifo','priority','hybrid','bandit']){
  const allowed=new Set([canonical(entry)]),read=async url=>{
   assert(allowed.has(url),'Unseen destination leaked');const p=lookup.get(url);assert(p);
   for(const l of p.links)if(new URL(l.url).origin===new URL(entry).origin)allowed.add(canonical(l.url));return structuredClone(p);
  };
  const r=await simulate({entry,mode,read});assert(r.complete);assert.equal(r.visits.length,4);assert.equal(new Set(r.visits.map(v=>v.url)).size,4);
  if(['fifo','priority'].includes(mode))assert.deepEqual(r.visits.map(v=>v.url),replay({entry_url:entry,scope:'/',pages},mode).map(v=>v.url));
  const q=await simulate({entry,mode,read,maxRequests:2});assert.equal(q.events.length,2);assert.equal(q.complete,false);
 }
 const read=async(url,kind)=>kind==='robots'?{status:200,body:'Sitemap: '+u('map.xml'),bytes:20}:kind==='xml'?{status:200,bytes:100,xml:{type:'urlset',locations:[u('deep'),u('missing'),u('https://outside.test/')]}}:lookup.get(url)||{status:404,bytes:10};
 const r=await simulate({entry,read,sitemap:true,maxRequests:5});assert.equal(r.events.length,5);assert.equal(r.events.filter(e=>e.kind!=='page').length,2);assert(r.visits.some(v=>v.url===u('deep')));
 const full=await simulate({entry,read,sitemap:true});assert(full.events.some(e=>e.status===404));assert.equal(full.visits.filter(v=>v.status===200).length,4);
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const p=await browser.newPage();await p.setContent('<base href="http://example.test/"><main><h1>안내</h1><article><p>'+('일반적인 본문 설명입니다. '.repeat(5))+'</p><a id="case42" class="gold-ad" href="x">자료</a></article></main>');
  const x=await p.evaluate(inspectPage);assert(x.detail);assert(!x.links[0].group.includes('case42'));assert(!x.links[0].group.includes('gold-ad'));assert(x.links[0].content_scope);
  const xml=await p.evaluate(inspectXML,'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://example.test/a?x=1&amp;y=2</loc></url></urlset>');assert.equal(xml.locations[0],u('a?x=1&y=2'));
  await assert.rejects(()=>p.evaluate(inspectXML,'<urlset><loc>x</urlset>'),/Invalid/);
  await assert.rejects(()=>p.evaluate(inspectXML,'<!DOCTYPE x [<!ENTITY y SYSTEM "file:///secret">]><urlset/>'),/DTD/);
 }finally{await browser.close();}
 console.log('PASS: FIFO/priority equivalence, no future graph access, budgets, unique visits, sitemap accounting/404/scope, DOM-only groups and XML validation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
