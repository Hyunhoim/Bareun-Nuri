// Replay the identical confirmed response prefix through the old scanner; API0.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const {score}=require('./phase1-operating-evaluate.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{fitBatch}=require('../agent/src/core/request-budget.cjs');
const dir=path.resolve(process.argv[2]),read=f=>JSON.parse(fs.readFileSync(f)),job=path.join(dir,'scan'),state=read(path.join(job,'checkpoint.json')).state;
const gold=fs.readFileSync(path.join(dir,'gold-frozen.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
function before(name){const file=path.resolve('agent/src/core',name),m=new Module(file+'.before',module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(path.join(dir,'stage',name+'.before'),'utf8'),file);return m.exports;}
async function main(){
 const traces=fs.readFileSync(path.join(job,'trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse),requests=traces.filter(e=>e.event==='llm_request'),responses=traces.filter(e=>e.event==='llm_response');
 const snapshots=new Map(state.pages.map(p=>[p.url,read(path.join(job,p.evidence.file))]));
 const stored=new Map(state.pages.flatMap(p=>p.batches.flatMap(r=>read(path.join(job,r.file)).decisions)).map(d=>[d.node_id,d]));
 let sent=0;global.fetch=async(url,options)=>{
  const body=JSON.parse(options.body),req=requests[sent],res=responses[sent];assert(req&&res);assert.deepEqual(body.messages,req.body.messages);sent++;
  const r=res.data,choice=r.choices[0];return {ok:true,status:200,headers:new Map(),json:async()=>({status:{code:'20000'},result:{finishReason:choice.finish_reason,message:{content:choice.message.content},usage:{promptTokens:r.usage?.prompt_tokens||0,completionTokens:r.usage?.completion_tokens||0,totalTokens:r.usage?.total_tokens||0}}})};
 };
 const config={provider:'hcx',model:'HCX-007',reasoningEffort:'none',temperature:0,maxTokens:512,maxCalls:600,timeoutMs:1000,apiKey:'OFFLINE_REPLAY',endpoint:'https://stub.invalid',seed:42};
 const scanner=before('bounded-scan.cjs'),llm=before('llm.cjs'),target=path.join(dir,'baseline-replay');const cached=fs.existsSync(path.join(target,'checkpoint.json'));
 const baseline=cached?read(path.join(target,'checkpoint.json')).state:await scanner.run({dir:target,entry:state.entry,mode:'fifo',scope:'/',identity:{provider:'hcx',experiment:'confirmed-prefix-replay'},limits:{pages:200,calls:600,seconds:1500,nodes:0},policy:'srpt',activeWindow:8,quantum:1,aging:8,batchSize:12,collectionConcurrency:5,observeTechniques:true,
 readPage:async url=>{assert(snapshots.has(url),'Replay lacks collected page');return structuredClone(snapshots.get(url));},
 createJudge:opts=>{const session=llm.createSession(config,{...opts,contract:contract()}),decide=session.decide.bind(session);session.fitBatch=items=>fitBatch(items,{...config,tokensPerMinute:58000},contract(),12);session.decide=async items=>{const ds=await decide(items);return ds.map(d=>{assert(stored.has(d.node_id));assert.equal(stored.get(d.node_id).publication_act,d.publication_act);return stored.get(d.node_id);});};return session;}});
 assert.equal(baseline.status,'failed');if(!cached)assert.equal(sent,20);assert.equal(baseline.calls,20);assert(baseline.inflight);
 const events=fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse),boundary=events.filter(e=>e.type==='progress'&&e.elapsedSec<=1500).at(-1);assert(boundary);
 const first=structuredClone(state);let judged=0,quarantinedCount=0;first.batch_history=[];
 for(const h of state.batch_history){const nj=judged+(h.quarantined?0:h.ids.length),nq=quarantinedCount+(h.quarantined?h.ids.length:0);if(nj>boundary.processed||nq>(boundary.quarantined||0))break;first.batch_history.push(h);judged=nj;quarantinedCount=nq;}
 assert.equal(judged,boundary.processed);assert.equal(quarantinedCount,boundary.quarantined||0);first.pages=first.pages.slice(0,boundary.pages);
 for(const p of first.pages){const h=first.batch_history.filter(h=>h.page_id===p.id);p.batches=p.batches.slice(0,h.length);p.offset=h.reduce((n,h)=>n+h.ids.length,0);p.quarantined_work=h.reduce((n,h)=>n+(h.quarantined?h.ids.length:0),0);p.complete=p.offset===p.work&&!p.quarantined_work;}
 first.elapsed_sec=boundary.elapsedSec;
 const b=score(target,baseline,gold),c=score(job,first,gold),end=score(job,state,gold);
 const cb=new Map(c.rows.map(r=>[r.id,r]));assert(b.rows.filter(r=>r.judged).every(r=>cb.get(r.id).judged&&cb.get(r.id).predicted===r.predicted),'Prior decisions lost');
 const quarantine=state.pages.flatMap(p=>p.batches.map(ref=>({p,b:read(path.join(job,ref.file))})).filter(x=>x.b.quarantine));
 const coverage=read(path.join(job,'coverage.json')),unjudged=new Set(coverage.unjudged.map(x=>x.node_id));for(const {b} of quarantine)for(const id of b.ids){assert(unjudged.has(id));assert(!stored.has(id));}
 const out={scope:'Controlled fault actual 25min run vs same-response baseline replay, not an independent semantic comparison',baseline_status:baseline.status,baseline_calls:baseline.calls,baseline:{overall:b.overall,judged:b.judged_only,processed:b.judged_candidates},first25_boundary:boundary,ended_after25:state.elapsed_sec>1500,end_semantic:end.overall.semantic,candidate_status:state.status,candidate_reason:state.reason,candidate_calls:state.calls,candidate_elapsed:state.elapsed_sec,candidate:{overall:c.overall,judged:c.judged_only,processed:c.judged_candidates},common_preserved:true,quarantined:quarantine.map(({p,b})=>({page:p.url,offset:b.offset,size:b.ids.length,missing:b.quarantine.missing_ids.length,later_page_items_processed:p.offset>b.offset+b.ids.length})),extra_tp:c.overall.semantic.tp-b.overall.semantic.tp,extra_fp:c.overall.semantic.fp-b.overall.semantic.fp,tokens:state.call_records.reduce((n,c)=>n+(c.usage?.total_tokens||0),0)};
 fs.writeFileSync(path.join(dir,'quarantine-evaluation.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}
main().catch(e=>{console.error(e);process.exitCode=1});
