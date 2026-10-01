const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('../agent/node_modules/playwright'),{serve}=require('./server.cjs');
const root=path.join(__dirname,'data'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const gold=read('private/gold.json'),manifest=read('private/manifest.json');
 for(const [file,digest] of Object.entries(manifest.hashes))assert.equal(sha(fs.readFileSync(path.join(root,file))),digest,file);
 assert.equal(gold.length,2000);assert.equal(new Set(gold.map(r=>r.id)).size,2000);
 assert.equal(new Set(gold.map(r=>r.group_id)).size,500);
 for(const label of [false,true])for(const technique of Object.keys(manifest.advertisements)){
  const set=gold.filter(r=>r.is_violation===label&&r.technique===technique);assert.equal(set.length,250);
  for(let v=0;v<5;v++)assert.equal(set.filter(r=>r.variant===v).length,50);
 }
 const routes=read('private/routes.json');
 for(const file of Object.values(routes)){const text=fs.readFileSync(path.join(root,'public',file),'utf8');assert(!/is_violation|expected_findings|scenario_family|HOMOGLYPH|TRANSPARENT|OFFSCREEN|JAMO|data-label/.test(text),file);}
 const server=serve(0);await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 let browser;const results=[];try{
  for(const route of ['/data/private/gold.json','/private/gold.json','/../bank.txt','/bank.txt','/data/private/manifest.json'])assert.equal((await fetch(origin+route)).status,404,route);
  assert.equal((await fetch(origin+'/',{method:'POST'})).status,405);
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();const byPage=Map.groupBy(gold,r=>r.url);let pageCount=0;
  for(const [url,rows] of byPage){
   await page.goto(origin+url,{waitUntil:'load'});
   for(const r of rows){
    const frame=r.frame_path?page.frames().find(f=>new URL(f.url()).pathname===r.frame_path):page.mainFrame();assert(frame,r.id);
    const obs=await frame.evaluate(selector=>{
     const nodes=document.querySelectorAll(selector);if(nodes.length!==1)return {count:nodes.length};const e=nodes[0],cs=getComputedStyle(e),rect=e.getBoundingClientRect();let opacity=1,displayNone=false;
     for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);opacity*=Number(s.opacity);if(s.display==='none')displayNone=true;}
     return {count:1,text:e.textContent,color:cs.color,background:cs.backgroundColor,opacity,displayNone,fontSize:parseFloat(cs.fontSize),left:rect.left,right:rect.right,top:rect.top,viewport:innerWidth,tag:e.tagName};
    },r.selector);
    assert.equal(obs.count,1,r.id);assert.equal(obs.text,r.raw_text,r.id);
    if(['HOMOGLYPH','JAMO'].includes(r.technique)){assert.notEqual(r.raw_text,r.base_text,r.id);assert(obs.opacity>0&&!obs.displayNone&&obs.fontSize>1,r.id);}
    if(r.technique==='TRANSPARENT')assert(obs.opacity===0||obs.color==='rgba(0, 0, 0, 0)'||obs.color==='rgba(20, 30, 40, 0)'||obs.color===obs.background,r.id+JSON.stringify(obs));
    if(r.technique==='OFFSCREEN')assert(obs.displayNone||obs.fontSize<=1||obs.right<0,r.id+JSON.stringify(obs));
    results.push({id:r.id,technique:r.technique,variant:r.variant,role:r.role,geometry:obs});
   }
   pageCount++;if(pageCount%50===0)console.log('DOM verified '+pageCount+'/250 pages');
  }
  const index=await (await fetch(origin+'/')).text();assert.equal((index.match(/href="\/list\?page=/g)||[]).length,27); // 25 lists plus two navigation links.
  const result={status:'passed',targets:results.length,pages:pageCount,iframes:gold.filter(r=>r.frame_path).length,model_calls:0,external_network_requests_allowed:0,private_routes_denied:true,checks:['hash integrity','250 per positive technique','250 per negative stratum','50 per technique variant per label','unique location','exact raw DOM text','computed style and geometry','public markup has no gold markers'],results};
  fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,results:undefined}));
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
