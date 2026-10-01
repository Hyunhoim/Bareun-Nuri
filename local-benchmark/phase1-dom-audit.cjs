// Post-run local DOM audit. No model calls and no mutation of saved verdicts/gold.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../agent/node_modules/playwright');
const read=f=>JSON.parse(fs.readFileSync(f)),dir=path.resolve(process.argv[2]),root=path.resolve('test-set-operating-phase1/public');
async function main(){
 const state=read(path.join(dir,'scan/checkpoint.json')).state;assert.notEqual(state.status,'running','Run after inference ends to avoid timing interference');
 const gold=fs.readFileSync('test-set-operating-phase1/private/gold.jsonl','utf8').trim().split('\n').map(JSON.parse),pages=new Map();for(const g of gold){if(!pages.has(g.page_path))pages.set(g.page_path,[]);pages.get(g.page_path).push(g);}
 const server=http.createServer((req,res)=>{const f=path.resolve(root,decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\//,''));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',f.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'msedge',headless:true}),output=[];
 try{for(const saved of state.pages){const pagePath=new URL(saved.url).pathname;if(!pages.has(pagePath))continue;const snapshot=read(path.join(dir,'scan',saved.evidence.file)),context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ko-KR',serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();
  try{await page.goto(origin+pagePath,{waitUntil:'domcontentloaded'});await page.waitForTimeout(350);
   for(const frame of page.frames()){
    const framePath=new URL(frame.url()).pathname,cs=snapshot.candidates.filter(c=>(c.frame_urls.length?new URL(c.frame_urls.at(-1)).pathname:pagePath)===framePath);
    const rows=await frame.evaluate(items=>items.map(c=>{const selector=c.location.split(' >>> ').at(-1),el=document.querySelector(selector);if(!el)return {node_id:c.node_id,error:'selector_not_found'};const ids=[...(el.matches('[id^="n"]')?[el]:[]),...el.querySelectorAll('[id^="n"]')].filter(n=>/^n[a-f0-9]{14}$/.test(n.id));return {node_id:c.node_id,location:c.location,raw_matches:el.textContent===c.raw_text,covered:ids.map(n=>{const s=getComputedStyle(n);const chain=[];for(let a=n;a;a=a.parentElement){const t=getComputedStyle(a);chain.push({tag:a.tagName,color:t.color,background:t.backgroundColor,opacity:t.opacity,display:t.display,font_size:t.fontSize});}return {id:n.id.slice(1),exact:n===el,text:n.textContent,chain,color:s.color,background:s.backgroundColor,opacity:s.opacity,display:s.display,font_size:s.fontSize}})};}),cs);
    output.push(...rows.map(x=>({...x,page:pagePath,frame:framePath})));
   }
  }finally{await context.close();}
 }}finally{await browser.close();server.close();}
 const matches=output.filter(x=>x.covered?.length);fs.writeFileSync(path.join(dir,'dom-audit.json'),JSON.stringify({kind:'post_run_reconstruction_not_new_detection',rows:matches,errors:output.filter(x=>x.error),text_mismatches:output.filter(x=>x.raw_matches===false),model_calls:0},null,2));console.log(JSON.stringify({covered_candidates:matches.length,errors:output.filter(x=>x.error).length,text_mismatches:output.filter(x=>x.raw_matches===false).length}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
