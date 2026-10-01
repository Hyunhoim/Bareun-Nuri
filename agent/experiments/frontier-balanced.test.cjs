const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {template,scheduler,walk}=require('./frontier-balanced.cjs'),{walk:oldWalk}=require('./frontier-corridor-run.cjs');
const {run}=require('../src/core/scan.cjs');
const modes=['fifo','context-bandit','depth-fifo','template-fifo'];
async function test(){
 assert.equal(template('https://fixture.test/board/123?board=A&id=1'),template('https://fixture.test/board/456?id=2&board=A'));
 assert.notEqual(template('https://fixture.test/board?id=1&board=A'),template('https://fixture.test/board?id=2&board=B'));
 const entry='http://127.0.0.1:19998/',pages={};
 const add=(route,links,detail=false,status=200)=>{const url=new URL(route,entry).href;pages[url]={status,profile:{detail,body:url,links:links.map(l=>({url:new URL(l,entry).href,text:'자료 확인',content_scope:false,group:'nav',context:{heading:'공공 자료'}}))}};};
 add('/', ['/board?id=1','/board?id=2','/archive/1','/#main','https://outside.example.invalid/']);
 add('/board?id=1',['/','/board?id=2','/board?id=2#duplicate'],true);add('/board?id=2',['/','/archive/2'],true);
 add('/archive/1',['/archive/2']);add('/archive/2',['/archive/3']);add('/archive/3',['/archive/4']);add('/archive/4',[],false,404);
 const out=path.resolve('.runtime/balanced-unit-'+Date.now());fs.mkdirSync(out,{recursive:true});let checks=0;
 for(const mode of modes){
  const readPage=async url=>{assert(pages[url]);return structuredClone(pages[url]);},full=await walk({entry,mode,readPage}),short=await walk({entry,mode,readPage,limit:3});
  const resumed=await walk({entry,mode,readPage,state:JSON.parse(JSON.stringify(short)),serialize:true});assert.deepEqual(full.visited,resumed.visited);assert.equal(new Set(full.visited).size,7);assert.deepEqual([...full.visited].sort(),Object.keys(pages).sort());
  for(const limit of [1,2,5])assert.deepEqual((await walk({entry,mode,readPage,limit})).visited,full.visited.slice(0,limit));
  if(['fifo','context-bandit'].includes(mode))assert.deepEqual(full.visited,(await oldWalk({entry,mode,readPage})).visited);
  if(mode==='depth-fifo')assert(full.visited.indexOf(entry+'archive/3')<full.visited.indexOf(entry+'archive/4'));
  // Choosing before a cancelled read must not consume the round-robin cursor.
  const selected=scheduler(mode),probe=structuredClone(short);assert.equal(selected.choose(probe,mode),selected.choose(probe,mode));
  const safePages=Object.fromEntries(Object.entries(pages).map(([u,p])=>[u,{...p,status:200}])),accesses=[];
  const options={entry,scope:'/',mode,scheduler:scheduler(mode),identity:{provider:'test',version:'balanced-1'},createJudge:()=>({calls:[],decide:()=>{throw Error('No candidates');}}),readPage:async url=>{accesses.push(url);const packet=safePages[url];return {pages:[{url,readiness:{settled:true},navigation:{links:packet.profile.links,profile:packet.profile}}],candidates:[],collection_issues:[]};}};
  const dir=path.join(out,mode);let s=await run({...options,dir,limits:{pages:3,calls:1,seconds:60}});assert.equal(s.reason,'page_budget');
  s=await run({...options,dir,limits:{pages:30,calls:1,seconds:60}});assert.equal(s.status,'completed');assert.equal(accesses.length,7);assert.deepEqual(s.pages.map(p=>p.url),(await walk({entry,mode,readPage:async u=>safePages[u]})).visited);checks++;
 }
 const result={passed:true,policies:checks,core_resumes:checks,api_calls:0};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result}));
}
if(require.main===module)test().catch(e=>{console.error(e);process.exitCode=1});module.exports={test};
