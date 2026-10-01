const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {run,splitCandidate,combine,acquireLock}=require('./progressive.cjs');
const {createSession}=require('../src/core/llm.cjs'),{outputResult}=require('../src/core/output.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'progressive-test-')),entry='http://localhost/site/',scope='/site/';
const style={tag:'p',opacity:1,display:'block',visibility:'visible',color:'rgb(0, 0, 0)',background:'rgb(255, 255, 255)',font_size:16,position:'static',rect:{x:0,y:0,width:100,height:20,right:100,bottom:20}};
const nodes=Array.from({length:37},(_,i)=>({node_id:'n'+i,url:i<7?entry:entry+Math.floor((i-7)/10),location:'p#n'+i,selector:'p#n'+i,
 raw_text:'공공 안내 '+i,normalized_text:'공공 안내 '+i,page_title:'안내',nearby:{before:'',after:''},links:[],frame_urls:[],signals:[],own_style:style,ancestors:[]}));
const urls=[entry,...Array.from({length:3},(_,i)=>entry+i)];
const pages=urls.map((url,i)=>({entry_url:entry,pages:[{url,title:'안내',navigation:{role_text:'안내',links:i?[]:urls.slice(1).map(url=>({url,text:'안내'}))}}],candidates:nodes.filter(n=>n.url===url)}));
const reader=async url=>structuredClone(pages.find(p=>p.pages[0].url.replace(/\/$/,'')===url.replace(/\/$/,'')));
const limits={pages:10,calls:20,seconds:60},identity={provider:'test',version:1};
function factory(log,{fail=false}={}){return ({signal,maxCalls})=>{
 const calls=[];return {calls,decide:async cs=>{signal.throwIfAborted();assert(calls.length<maxCalls);calls.push({number:calls.length+1,usage:{total_tokens:1}});log.push(cs.map(c=>c.node_id));
  if(fail)throw Error('connection lost after sending');return cs.map(c=>({node_id:c.node_id,is_violation:Number(c.node_id.slice(1))%5===0,techniques:Number(c.node_id.slice(1))%5===0?['JAMO']:[],observed_techniques:[],needs_review:false,reason:'Deterministic plumbing test, not accuracy'}));}};};}
async function main(){
 const lock=acquireLock(tmp,'test.lock');assert.throws(()=>acquireLock(tmp,'test.lock'),/already active/);fs.unlinkSync(lock);
 fs.mkdirSync(lock+'.gate');assert.throws(()=>acquireLock(tmp,'test.lock'),/recovery already active/);fs.rmdirSync(lock+'.gate');
 fs.writeFileSync(lock,JSON.stringify({pid:2147483647}));assert.equal(acquireLock(tmp,'test.lock'),lock);fs.unlinkSync(lock);
 const log=[],common={entry,scope,mode:'fifo',limits,identity,readPage:reader};
 const full=await run({...common,dir:path.join(tmp,'full'),createJudge:factory(log)});assert.equal(full.status,'completed');
 assert.deepEqual(log,[nodes.slice(0,16),nodes.slice(16,32),nodes.slice(32)].map(cs=>cs.map(c=>c.node_id)));
 const resumeLog=[],dir=path.join(tmp,'resume');
 const partial=await run({...common,dir,limits:{...limits,pages:2},createJudge:factory(resumeLog)});
 assert.equal(partial.status,'partial');assert.equal(partial.reason,'page_budget');assert.equal(partial.decisions.length,16);
 const resumed=await run({...common,dir,createJudge:factory(resumeLog)});assert.equal(resumed.status,'completed');assert.deepEqual(resumeLog,log);
 assert.deepEqual(resumed.decisions,full.decisions);assert.deepEqual(resumed.candidates,full.candidates);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'result.json'))).findings,JSON.parse(fs.readFileSync(path.join(tmp,'full/result.json'))).findings);
 await run({...common,dir,createJudge:()=>{throw Error('Completed work must not call API');}});
 await assert.rejects(()=>run({...common,dir,identity:{provider:'test',version:2},createJudge:factory([])}),/changed/);
 const callsDir=path.join(tmp,'calls'),callLog=[];
 const paused=await run({...common,dir:callsDir,limits:{...limits,calls:1},createJudge:factory(callLog)});
 assert.equal(paused.reason,'call_budget');await run({...common,dir:callsDir,createJudge:factory(callLog)});assert.deepEqual(callLog,log);
 const fitFactory=log=>o=>({...factory(log)(o),fitBatch:async cs=>cs.slice(0,5)});
 const fitLog=[],fitFull=await run({...common,dir:path.join(tmp,'fit-full'),createJudge:fitFactory(fitLog)});
 const fitResumeLog=[],fitDir=path.join(tmp,'fit-resume');
 await run({...common,dir:fitDir,limits:{...limits,calls:1},createJudge:fitFactory(fitResumeLog)});
 const fitResumed=await run({...common,dir:fitDir,createJudge:fitFactory(fitResumeLog)});
 assert.deepEqual(fitResumeLog,fitLog);assert.deepEqual(fitResumed.decisions,fitFull.decisions);
 assert.deepEqual(fitLog.flat(),nodes.map(n=>n.node_id));
 const timed=await run({...common,dir:path.join(tmp,'time'),limits:{...limits,seconds:0.02},readPage:async(u,s)=>{await delay(100,undefined,{signal:s});return reader(u);},createJudge:factory([])});
 assert.equal(timed.reason,'time_budget');assert.equal(timed.pages.length,0);assert.equal(timed.pending.length,1);
 const failDir=path.join(tmp,'failed'),badLog=[];
 const failed=await run({...common,dir:failDir,createJudge:factory(badLog,{fail:true})});assert.equal(failed.status,'failed');assert(failed.inflight);
 await run({...common,dir:failDir,createJudge:factory(badLog)});assert.equal(badLog.length,1,'Unknown request must not auto-repeat');
 assert(fs.existsSync(path.join(failDir,'result.partial.json')));
 // Preserve real request bodies as well as candidate ordering; no production prompt override.
 const bodyA=[],bodyB=[],config={provider:'mock',maxCalls:20,maxTokens:3072};
 const baseline=createSession(config,{log:e=>{if(e.event==='llm_request')bodyA.push(e.body);}});
 for(let i=0;i<nodes.length;i+=16)await baseline.decide(nodes.slice(i,i+16));
 await run({...common,dir:path.join(tmp,'wire'),identity:{provider:'mock'},createJudge:o=>createSession({...config,maxCalls:o.maxCalls},{signal:o.signal,log:e=>{if(e.event==='llm_request')bodyB.push(e.body);}})});
 assert.deepEqual(bodyB,bodyA,'Streaming changed wire input or batch composition');
 assert.equal(splitCandidate(nodes[0])[0],nodes[0]);
 const original={...nodes[0],raw_text:('한글😀 문장. ').repeat(2200)};const chunks=splitCandidate(original);
 let covered=0;for(const c of chunks){assert(c.raw_text.length<=6000);assert(c.source_start<=covered);assert.equal(c.raw_text,original.raw_text.slice(c.source_start,c.source_end));assert(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(c.raw_text));covered=c.source_end;}assert.equal(covered,original.raw_text.length);
 const d=chunks.map((c,i)=>({node_id:c.node_id,is_violation:i===1,techniques:i===1?['TRANSPARENT']:[],observed_techniques:[],needs_review:false,reason:'test'}));
 const merged=combine({candidates:[original],work:chunks,decisions:d});assert(merged.decisions[0].is_violation);assert.equal(merged.candidates[0].raw_text,original.raw_text);
 const out=outputResult({entry_url:entry,candidates:merged.candidates},merged.decisions,new Date().toISOString(),0,'test');assert.equal(out.result.findings[0].location,original.location);
 assert.equal(combine({candidates:[original],work:chunks,decisions:d.slice(1)}).decisions.length,0);
 console.log('PASS: batch/wire equivalence, committed resume, page/call/time budgets, unknown-call refusal, source identity, long-text offsets and original output ownership');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{assert.equal(path.dirname(tmp),os.tmpdir());assert(path.basename(tmp).startsWith('progressive-test-'));fs.rmSync(tmp,{recursive:true,force:true});});
