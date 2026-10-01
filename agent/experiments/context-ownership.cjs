// Experimental only: preserve all baseline fields, add bounded DOM relationships.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{parseEnv}=require('node:util');
const {setTimeout:delay}=require('node:timers/promises');
const {baselineContract,createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs');
const {integrateObservations}=require('../src/core/techniques.cjs');
const {metrics}=require('./priority-one.cjs');
function relationalEvidence(c){const base=baselineContract.initialEvidence(c),e=c.context_evidence;if(!e)return base;
 return {...base,context_scope:{boundary:e.scope,meaning:'DOM local group; not proof of common author or intent',
  target:{tag:e.target_tag,in_quote:e.target_quoted},surrounding:(e.units||[]).filter(u=>u.relation!=='target').map(u=>({position:u.relation,in_quote:u.quoted,text:u.text})),truncated:e.truncated}};
}
const contract=mode=>({...baselineContract,formatRepair:false,initialEvidence:mode==='B'?relationalEvidence:baselineContract.initialEvidence});
function score(labels,decisions){const m=metrics(labels.filter(l=>l.is_ad!==null),decisions),by=new Map(decisions.map(d=>[d.node_id,d]));
 m.tech_correct=0;m.tech_total=0;m.normal_review=0;m.uncertain_correct=0;m.uncertain_total=0;let tp=0,fp=0,fn=0;
 for(const l of labels){const d=by.get(l.node_id);assert(d);if(l.is_ad===false&&d.needs_review)m.normal_review++;
  if(l.is_ad===null){m.uncertain_total++;m.uncertain_correct+=Number(d.needs_review);}
  if(l.observed){m.tech_total++;m.tech_correct+=Number(JSON.stringify([...d.observed_techniques].sort())===JSON.stringify([...l.observed].sort()));
   if(l.is_ad!==null){const want=new Set(l.techniques),got=new Set(d.is_violation&&!d.needs_review?d.techniques:[]);for(const t of got)want.has(t)?tp++:fp++;for(const t of want)if(!got.has(t))fn++;}}
 }m.final={tp,fp,fn,f1:2*tp/(2*tp+fp+fn)||0};m.by_scenario={};
 for(const group of new Set(labels.map(l=>l.scenario||'legacy'))){const sub=labels.filter(l=>(l.scenario||'legacy')===group);m.by_scenario[group]={count:sub.length,...metrics(sub.filter(l=>l.is_ad!==null),decisions)};}
 return m;
}
function gates(labels,r,a,b){const ads=new Set(labels.filter(l=>l.is_ad===true).map(l=>l.node_id)),common=a.positive_ids.filter(id=>ads.has(id)&&b.positive_ids.includes(id));
 return {lost_baseline_ads:common.filter(id=>!r.positive_ids.includes(id)),fp:r.fp<=Math.min(a.fp,b.fp),f1:r.f1>=Math.max(a.f1,b.f1),normal_review:r.normal_review<=Math.min(a.normal_review,b.normal_review),
  uncertainty:r.uncertain_correct>=Math.max(a.uncertain_correct,b.uncertain_correct),calls:r.calls<=Math.max(a.calls,b.calls),tokens:r.tokens<=1.2*Math.max(a.tokens,b.tokens),latency:r.elapsed_sec<=1.2*Math.max(a.elapsed_sec,b.elapsed_sec)};
}
const passed=g=>g.lost_baseline_ads.length===0&&Object.entries(g).filter(([k])=>k!=='lost_baseline_ads').every(([,v])=>v);
function check(){const c={node_id:'n',raw_text:'텍스트',normalized_text:'텍스트',frame_urls:[],context_evidence:{scope:{tag:'article',document_scope:false},target_tag:'p',target_quoted:false,units:[{relation:'before',quoted:false,text:'다른 설명'},{relation:'target',quoted:false}],truncated:false}};
 const e=relationalEvidence(c);for(const[k,v]of Object.entries(baselineContract.initialEvidence(c)))assert.deepEqual(e[k],v);
 assert.equal(e.context_scope.surrounding[0].text,'다른 설명');assert.equal(e.context_scope.surrounding.length,1);assert(!JSON.stringify(e).includes('is_ad'));
 assert.equal(relationalEvidence({...c,context_evidence:null}).context_scope,undefined);assert.equal(contract('B').SYSTEM,baselineContract.SYSTEM);
 const labels=[{node_id:'a',is_ad:true,observed:['JAMO'],techniques:['JAMO']},{node_id:'b',is_ad:false,observed:[],techniques:[]},{node_id:'c',is_ad:null,observed:[],techniques:[]}];
 const ds=[{node_id:'a',is_violation:true,needs_review:false,observed_techniques:['JAMO'],techniques:['JAMO']},{node_id:'b',is_violation:false,needs_review:true,observed_techniques:[],techniques:[]},{node_id:'c',is_violation:false,needs_review:true,observed_techniques:[],techniques:[]}];
 const m=score(labels,ds);assert.equal(m.f1,1);assert.equal(m.normal_review,1);assert.equal(m.uncertain_correct,1);assert.equal(m.tech_total,3);console.log('PASS: base fields/prompt preserved, no invented ownership, uncertainty separated');
}
async function main(){check();if(!process.argv.includes('--live'))return;
 const project=path.resolve(__dirname,'../..'),data=path.join(project,'.runtime/context-ownership-data-v2'),root=path.join(project,'.runtime/context-ownership-'+Date.now());fs.mkdirSync(root,{recursive:true});
 const read=f=>JSON.parse(fs.readFileSync(f)),save=(n,v)=>fs.writeFileSync(path.join(root,n+'.json'),JSON.stringify(v,null,2)),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const regressionLabels=read(path.join(project,'.runtime/stage4-reuse/pilot-labels.json')),ids=new Set(regressionLabels.map(l=>l.node_id)),old=read(path.join(project,'.runtime/stage4-reuse/pilot-evidence.json'));
 const panels={regression:{labels:regressionLabels,snapshot:{candidates:old.candidates.filter(c=>ids.has(c.node_id)),technique_observations:old.technique_observations.filter(o=>ids.has(o.node_id))}}};
 for(const split of ['dev','confirmation'])panels[split]={labels:read(path.join(data,split+'-labels.json')),snapshot:read(path.join(data,split+'-evidence.json'))};
 const sourceFiles=[__filename,path.join(__dirname,'context-ownership-site.cjs'),path.join(__dirname,'priority-one.cjs'),path.join(project,'docs/context-ownership-plan.md'),...['llm.cjs','collect.cjs','techniques.cjs','jamo.cjs','confusables-latin.json'].map(f=>path.join(__dirname,'../src/core',f))];
 const hashes=Object.fromEntries(sourceFiles.map(f=>[f,hash(f)]));for(const [name,p]of Object.entries(panels)){assert.equal(p.labels.length,p.snapshot.candidates.length);save(name+'-labels',p.labels);save(name+'-evidence',p.snapshot);for(const tail of ['labels','evidence']){const f=path.join(root,name+'-'+tail+'.json');hashes[f]=hash(f);}}
 save('manifest',{hashes,limits:{calls:40,tokens:550000,seconds:3600},batch:16,settings:{model:'HCX-007',reasoning:'none',temperature:0,seed:42},order:['regression A1 B A2','dev A1 B A2','confirmation B A1 A2 only if semantic gates pass']});
 const env={...process.env,...parseEnv(fs.readFileSync(path.join(project,'agent/.env'),'utf8'))},config={...configFromEnv('hcx',env),temperature:0,seed:42,maxTokens:3072,maxCalls:40,timeoutMs:180000,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:false,retryTransientTransport:false};
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('Experiment time limit')),3600000);let attempts=0,reserved=0,session,condition,decisions=[],lastEnd=0;const result={};
 async function runPanel(name){const {labels,snapshot}=panels[name];result[name]={};
  for(const mode of name==='confirmation'?['B','A1','A2']:['A1','B','A2']){
   // Cooldown is outside measured condition time and identical between all sessions.
   if(lastEnd)await delay(Math.max(0,61000-(Date.now()-lastEnd)),undefined,{signal:ctl.signal});
   for(const[f,h]of Object.entries(hashes))assert.equal(hash(f),h,'Frozen source/input changed');condition=name+'-'+mode;decisions=[];
   session=createSession({...config,maxCalls:40-attempts},{signal:ctl.signal,contract:contract(mode),log:e=>{
    if(e.event==='llm_request'){const n=estimateRequestTokens(e.body);if(attempts+1>40||reserved+n>550000)throw Error('Experiment budget exceeded');attempts++;reserved+=n;save('budget',{attempts,reserved});}
    fs.appendFileSync(path.join(root,condition+'-trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n');}});
   const start=performance.now();for(let i=0;i<snapshot.candidates.length;i+=16){decisions.push(...await session.decide(snapshot.candidates.slice(i,i+16)));save(condition+'-decisions',decisions);save(condition+'-calls',session.calls);console.log(JSON.stringify({root,condition,processed:decisions.length}));}
   lastEnd=Date.now();const r={...score(labels,decisions),elapsed_sec:(performance.now()-start)/1000,tokens:session.calls.reduce((n,c)=>n+c.usage.total_tokens,0),calls:session.calls.length};
   const combined=integrateObservations(snapshot,decisions,snapshot.technique_observations);save(condition+'-integrated',combined);
   r.observer={...score(labels,combined.decisions),technique_reviews:combined.technique_diagnostics.length};
   combined.decisions.forEach((d,i)=>{const {techniques,observed_techniques,...a}=d,{techniques:t,observed_techniques:o,...b}=decisions[i];assert.deepEqual(a,b);});
   result[name][mode]=r;save('results',result);
  }
  const {A1:a,A2:b,B:r}=result[name];r.gates=gates(labels,r,a,b);r.semantic_pass=passed(r.gates);
  r.technique_pass=r.tech_correct>=Math.max(a.tech_correct,b.tech_correct)&&r.final.f1>=Math.max(a.final.f1,b.final.f1);
  r.observer_pass=r.observer.tech_correct>=Math.max(a.tech_correct,b.tech_correct)&&r.observer.final.f1>=Math.max(a.final.f1,b.final.f1);
  save('results',result);
 }
 try{await runPanel('regression');await runPanel('dev');
  const gain=['regression','dev'].some(n=>{const {A1:a,A2:b,B:r}=result[n];return r.fp<Math.min(a.fp,b.fp)||r.fn<Math.min(a.fn,b.fn);});
  const advance=gain&&['regression','dev'].every(n=>result[n].B.semantic_pass);
  save('gate',{advance_confirmation:advance,useful_gain:gain});
  if(advance)await runPanel('confirmation');
  save('completion',{status:'completed',confirmation_used:advance,attempts,reserved,adoption:'not automatic; requires full gates and 25-minute end-to-end comparison'});
  console.log(JSON.stringify({root,completed:true,advance_confirmation:advance}));
 }catch(e){save('failure',{condition,error:e.message,processed:decisions.length,calls:session?.calls,attempts,reserved});console.error(JSON.stringify({root,condition,error:e.message}));process.exitCode=1;}finally{clearTimeout(timer);}
}
module.exports={relationalEvidence,contract,score,gates};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
