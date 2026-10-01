// Actual process termination/restart; deterministic judgments are plumbing checks, not model scores.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{setTimeout:delay}=require('node:timers/promises');
const {run,combine,splitCandidate}=require('./progressive.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'progressive-recovery-'));
const entry='http://localhost/recovery/',scope='/recovery/';
const nodes=Array.from({length:22},(_,i)=>({node_id:'n'+i,url:i<17?entry:entry+'b',raw_text:'문서 '+i,normalized_text:'문서 '+i,
 selector:'p#n'+i,location:'p#n'+i,frame_urls:[],signals:[],own_style:{},ancestors:[]}));
const pages=[entry,entry+'b'].map((url,i)=>({pages:[{url,navigation:{role_text:'안내',links:i?[]:[{url:entry+'b',text:'다음'}]}}],candidates:nodes.filter(n=>n.url===url)}));
const judgeSource=`({signal})=>{const calls=[];return {calls,decide:async cs=>{signal.throwIfAborted();calls.push({usage:{total_tokens:1}});return cs.map(c=>({node_id:c.node_id,is_violation:c.node_id==='n0',techniques:c.node_id==='n0'?['JAMO']:[],observed_techniques:[],needs_review:false,reason:'test'}));}};}`;
const createJudge=eval('('+judgeSource+')');
const base={entry,scope,mode:'fifo',limits:{pages:4,calls:10,seconds:600},identity:{provider:'test',version:1}};
(async()=>{
 let child;
 try{
  const dir=path.join(tmp,'crash'),marker=path.join(tmp,'ready');
  const script=`const fs=require('node:fs');const {run}=require(${JSON.stringify(path.resolve(__dirname,'progressive.cjs'))});const pages=${JSON.stringify(pages)};
   run({...${JSON.stringify(base)},dir:${JSON.stringify(dir)},createJudge:${judgeSource},readPage:async url=>{
    if(url.endsWith('/b')){fs.writeFileSync(${JSON.stringify(marker)},'ready');await new Promise(()=>{});}return pages.find(p=>p.pages[0].url===url);
   }}).catch(e=>{console.error(e);process.exitCode=1;});`;
  const scriptFile=path.join(tmp,'child.cjs');fs.writeFileSync(scriptFile,script);
  child=spawn(process.execPath,[scriptFile],{windowsHide:true,stdio:'inherit'});
  let ready=false;for(let i=0;i<100;i++){await delay(30);if(fs.existsSync(marker)){ready=true;break;}if(child.exitCode!==null)break;}assert(ready);
  const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;
  const before=JSON.parse(fs.readFileSync(path.join(dir,'checkpoint.json'))).state;assert.equal(before.decisions.length,16);assert.equal(before.calls,1);
  const resumed=await run({...base,dir,createJudge,readPage:async url=>structuredClone(pages.find(p=>p.pages[0].url===url))});
  assert.equal(resumed.status,'completed');assert.equal(resumed.calls,2);assert.equal(resumed.decisions.length,22);assert.deepEqual(resumed.decisions.slice(0,16),before.decisions);
  assert.equal(new Set(resumed.decisions.map(d=>d.node_id)).size,22);
  const checkpoint=JSON.parse(fs.readFileSync(path.join(dir,'checkpoint.json')));checkpoint.state.candidates[0].raw_text='tampered';fs.writeFileSync(path.join(dir,'checkpoint.json'),JSON.stringify(checkpoint));
  await assert.rejects(()=>run({...base,dir,createJudge,readPage:async()=>{throw Error('Must not read');}}),/checksum/);
  const original={...nodes[0],raw_text:'안내😀 '.repeat(2500),nearby:{}};
  const chunks=splitCandidate(original),negative=chunks.map(c=>({node_id:c.node_id,is_violation:false,techniques:[],observed_techniques:[],needs_review:false,reason:'test'}));
  assert.equal(combine({candidates:[original],work:chunks,decisions:negative}).decisions[0].is_violation,false);
  negative[0].needs_review=true;assert.equal(combine({candidates:[original],work:chunks,decisions:negative}).decisions[0].needs_review,true);
  console.log('PASS: killed-process lock recovery, preserved committed prefix, no duplicate judgments, corruption rejection, negative/uncertain chunk aggregation');
 }finally{
  if(child?.exitCode===null)child.kill();assert.equal(path.dirname(tmp),os.tmpdir());assert(path.basename(tmp).startsWith('progressive-recovery-'));fs.rmSync(tmp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
