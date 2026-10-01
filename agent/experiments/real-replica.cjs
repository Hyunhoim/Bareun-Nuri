// Read-only public collection and finite local DOM replay. No operational imports point here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{collect,canonical,inScope}=require('../src/core/collect.cjs');
const {inspectPage}=require('../src/core/frontier.cjs'),{inspectContext}=require('./frontier-context.cjs');
const {walk,template}=require('./frontier-balanced.cjs');
const ROOT='.runtime/real-replica-v1',modes=['fifo','context-bandit','template-fifo'];
const entries=[{id:'busan-board',institution:'busan',url:'https://www.busan.go.kr/siminopen/siminthink01'},
 {id:'daejeon-board',institution:'daejeon',url:'https://www.daejeon.go.kr/exa/ExaExamNoticeList.do?menuSeq=307'},
 {id:'busan-home',institution:'busan',url:'https://www.busan.go.kr/index.html'},
 {id:'daejeon-home',institution:'daejeon',url:'https://www.daejeon.go.kr/drh/daejeon/index.do'}];
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function save(root,name,v){const dest=path.join(root,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest+'.tmp',JSON.stringify(v,null,2));fs.renameSync(dest+'.tmp',dest);}
const sources=['agent/experiments/real-replica.cjs','agent/experiments/frontier-balanced.cjs','agent/experiments/frontier-context.cjs','agent/src/core/frontier.cjs','agent/src/core/collect.cjs','docs/real-replica-plan.md'];
function freezeSources(root){save(root,'manifest.json',Object.fromEntries(sources.map(f=>[f,hash(fs.readFileSync(f,'utf8'))])));}

// Runs only after the unmodified collector has read the original remote DOM.
function snapshotDOM(){
 const clone=document.documentElement.cloneNode(true),original=[document.documentElement,...document.documentElement.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
 const css=['display','visibility','opacity','color','background-color','position','left','right','top','bottom','font-size','font-family','font-weight','line-height','white-space','width','height','margin','padding','border','overflow','text-align','vertical-align'];
 for(let i=0;i<original.length;i++){const e=original[i],c=copies[i];
  if(!['SCRIPT','STYLE','LINK','BASE','META','HEAD','HTML'].includes(e.tagName)){const s=getComputedStyle(e);c.setAttribute('style',css.map(k=>k+':'+s.getPropertyValue(k)).join(';'));}
  for(const a of [...c.attributes])if(/^on/i.test(a.name)||['src','srcset','action','formaction','srcdoc','nonce','integrity'].includes(a.name))c.removeAttribute(a.name);
  if(e.tagName==='A'&&e.hasAttribute('href'))c.setAttribute('href',e.href);
  if(e.tagName==='IFRAME')c.setAttribute('data-replica-frame','not-replicated');
  if(e.matches('input,textarea')){c.removeAttribute('value');if(e.tagName==='TEXTAREA')c.textContent='';}
 }
 for(const e of clone.querySelectorAll('script,style,link,base,meta[http-equiv]'))e.remove();
 const anchors=[...document.querySelectorAll('a[href]')];
 return {html:'<!doctype html>'+clone.outerHTML,diagnostic:{title:document.title,anchors:anchors.length,
  js_links:anchors.filter(a=>/^javascript:/i.test(a.getAttribute('href'))).length,
  fragment_links:anchors.filter(a=>(a.getAttribute('href')||'').startsWith('#')).length,
  handler_links:anchors.filter(a=>a.hasAttribute('onclick')).length,
  tables:document.querySelectorAll('table').length,forms:document.forms.length,
  frames:[...document.querySelectorAll('iframe')].map(e=>({src:e.src,srcdoc:e.hasAttribute('srcdoc')})),
  text_chars:document.body.innerText.length}};
}
async function capture(root=ROOT){
 assert(!fs.existsSync(path.join(root,'capture.json')),'Capture is immutable');fs.mkdirSync(root,{recursive:true});freezeSources(root);
 const started=performance.now(),pages={},runs=[],events=[],browser=await chromium.launch({headless:true,channel:'msedge'});
 let current=null,count=0;
 const create=browser.newContext.bind(browser);
 browser.newContext=async(...args)=>{const ctx=await create(...args),np=ctx.newPage.bind(ctx);ctx.newPage=async(...a)=>{const page=await np(...a),close=page.close.bind(page);
  page.close=async(...opts)=>{if(current&&!page.isClosed()){current.dom=await page.evaluate(snapshotDOM);current.context=await page.evaluate(inspectContext);current.profile=await page.evaluate(inspectPage);}return close(...opts);};return page;};return ctx;};
 async function get(url,entry){
  if(pages[url])return structuredClone(pages[url].packet);
  if(count>=240||performance.now()-started>1800000)throw Error('Capture budget reached');
  count++;current={url};const t=performance.now();let row;
  try{const s=await collect(url,{browser,entryUrl:entry,maxPages:1,maxNodes:20000,followLinks:false,allowLongText:true,allowEmpty:true,recordNavigation:true,onTiming:e=>events.push(e)});
   assert(current.dom&&current.profile);const p=current.profile,cs=current.context;assert.equal(p.links.length,cs.length);
   p.links=p.links.map((l,i)=>{assert.equal(l.url,cs[i].url);return {...l,context:{...cs[i].context,parent_detail:p.detail}};});p.fingerprint=hash(p.body);
   const id=hash(url).slice(0,24);fs.mkdirSync(path.join(root,'dom'),{recursive:true});fs.writeFileSync(path.join(root,'dom',id+'.html'),current.dom.html);
   save(root,'evidence/'+id+'.json',s);
   row={url,actual:s.pages[0].url,status:200,id,elapsed_ms:performance.now()-t,diagnostic:current.dom.diagnostic,candidates:s.candidates.length,
    long_candidates:s.candidates.filter(c=>c.raw_text.length>12000).length,readiness:s.pages[0].readiness,blocked:s.blocked_requests,issues:s.collection_issues,
    profile_parity:JSON.stringify(p.links.map(l=>l.url))===JSON.stringify(s.pages[0].navigation.profile.links.map(l=>l.url)),
    packet:{status:200,profile:p}};
  }catch(e){row={url,status:0,error:String(e.message),elapsed_ms:performance.now()-t,packet:{status:0,profile:null}};}
  finally{current=null;}
  pages[url]=row;save(root,'capture.partial.json',{entries,pages,runs,elapsed_ms:performance.now()-started});
  console.log(JSON.stringify({capture:count,url,status:row.status,ms:Math.round(row.elapsed_ms),candidates:row.candidates,error:row.error}));
  return structuredClone(row.packet);
 }
 try{for(const entry of entries){let failures=0;for(const mode of modes){
   try{const state=await walk({entry:entry.url,mode,limit:20,readPage:async u=>{if(failures>=3)throw Error('Three consecutive collection failures');const p=await get(u,entry.url);failures=p.status===200?0:failures+1;return p;}});
    runs.push({entry:entry.id,mode,state});save(root,'live-runs/'+entry.id+'-'+mode+'.json',state);
   }catch(e){runs.push({entry:entry.id,mode,error:String(e.message)});break;}
  }}
 }finally{await browser.close();}
 const result={at:new Date().toISOString(),entries,pages,runs,events,elapsed_ms:performance.now()-started,api_calls:0};save(root,'capture.json',result);
 console.log(JSON.stringify({done:true,pages:Object.keys(pages).length,success:Object.values(pages).filter(p=>p.status===200).length,ms:result.elapsed_ms}));
}

if(require.main===module){const action=process.argv[2],root=process.argv[3]||ROOT;
 (action==='capture'?capture(root):Promise.reject(Error('Use capture'))).catch(e=>{console.error(e);process.exitCode=1});}
module.exports={capture,snapshotDOM,hash,save,read,entries,modes,ROOT};
