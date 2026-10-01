const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {scheduler}=require('./frontier-corridor.cjs'),{walk}=require('./frontier-corridor-run.cjs');
const {run}=require('../src/core/scan.cjs');
function graph(lengths,fork=false){
 const entry='https://structural.test/',pages={},add=(url,links,status=200)=>{pages[url]={status,profile:{detail:false,body:'',links:links.map(url=>({url,text:'공개 정보',group:'same',content_scope:false}))}};};
 add(entry,lengths.map((_,i)=>entry+'branch'+i+'/0'));
 for(let i=0;i<lengths.length;i++)for(let d=0;d<lengths[i];d++){
  const url=entry+'branch'+i+'/'+d,links=[entry];if(d+1<lengths[i])links.push(entry+'branch'+i+'/'+(d+1));
  if(d>0)links.push(entry+'branch'+i+'/'+(d-1));
  if(fork&&d===2){const leaf=url+'/leaf';add(leaf,[entry]);links.push(leaf);}
  links.push('https://external.test/');add(url,links);
 }
 return {entry,pages};
}
async function main(){
 const tests=[graph([17]),graph([32,7,12]),graph([9,14],true),graph([6,6,6])];
 const failed=graph([8,8]);failed.pages[failed.entry+'branch0/7'].status=404;tests.push(failed);
 const out=path.resolve('.runtime/corridor-check-'+Date.now());fs.mkdirSync(out,{recursive:true});const rows=[];
 for(const [i,g]of tests.entries())for(const base of ['bandit','context-bandit']){
  const mode=base+'-corridor',readPage=async url=>structuredClone(g.pages[url]);
  const a=await walk({entry:g.entry,mode,readPage}),b=await walk({entry:g.entry,mode,readPage,serialize:true});
  assert.deepEqual(a.visited,b.visited);assert.deepEqual([...a.visited].sort(),Object.keys(g.pages).sort());assert.equal(new Set(a.visited).size,a.visited.length);
  assert(a.corridor_trace.filter(x=>x.kind==='corridor').every(x=>x.attempt%5===4));
  assert(!a.corridors.length);rows.push({graph:i,base,pages:a.visited.length,probes:a.corridor_trace.filter(x=>x.kind==='corridor').length});
 }
 // Branches, malformed URLs, and failed reads must not invent a continuation.
 const p=scheduler('bandit'),s={attempts:['https://unit.test/a'],pending:[{url:'https://unit.test/b'},{url:'https://unit.test/c'}]};
 p.feedback(s,{url:'https://unit.test/a'},{detail:false,links:[{url:'bad'},{url:'https://unit.test/b'},{url:'https://unit.test/c'}]},[]);assert.equal(s.corridors.length,0);
 s.pending.pop();p.feedback(s,{url:'https://unit.test/a'},{detail:false,links:[{url:'https://unit.test/b'},{url:'https://unit.test/b#anchor'}]},[]);assert.equal(s.corridors.length,1);
 s.pending=[];p.feedback(s,{url:'https://unit.test/b'},null,[]);assert.equal(s.corridors.length,0);
 // Four reserved turns rotate a long path, preserving its next location.
 const q={attempts:['x'],pending:[{url:'https://unit.test/next'},{url:'https://unit.test/other'}],corridors:[{url:'https://unit.test/old',turns:3},{url:'https://unit.test/other',turns:0}],corridor_selection:'https://unit.test/old'};
 p.feedback(q,{url:'https://unit.test/old'},{detail:false,links:[{url:'https://unit.test/next'}]},[]);assert.deepEqual(q.corridors.map(c=>c.url),['https://unit.test/other','https://unit.test/next']);assert.equal(q.corridors[1].turns,0);
 // Exercise the real checkpoint runner across an interruption with no LLM calls.
 const g=tests[1];
 for(const base of ['bandit','context-bandit']){
  const mode=base+'-corridor',accesses=[],options={entry:g.entry,scope:'/',mode,scheduler:scheduler(base),identity:{provider:'test',version:1},createJudge:()=>({calls:[],decide:()=>{throw Error('No candidates');}}),
   readPage:async url=>{accesses.push(url);const packet=g.pages[url];return {pages:[{url,readiness:{settled:true},navigation:{links:packet.profile.links,profile:packet.profile}}],candidates:[],collection_issues:[]};}};
  const dir=path.join(out,base);let state=await run({...options,dir,limits:{pages:9,calls:1,seconds:60}});assert.equal(state.reason,'page_budget');
  state=await run({...options,dir,limits:{pages:30,calls:1,seconds:60}});assert.equal(state.reason,'page_budget');
  const expected=await walk({entry:g.entry,mode,readPage:async url=>g.pages[url],limit:30});assert.deepEqual(state.pages.map(p=>p.url),expected.visited);assert.equal(accesses.length,30);
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,rows,api_calls:0},null,2));console.log(JSON.stringify({passed:true,out,graph_runs:rows.length,real_core_resumes:2,api_calls:0}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
