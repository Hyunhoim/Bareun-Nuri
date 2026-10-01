const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{parseEnv}=require('node:util'),{setTimeout:delay}=require('node:timers/promises');
const {contract,sources,check}=require('./semantic-intent-contract.cjs');
const {score}=require('./context-ownership.cjs');
const {createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs');
const {integrateObservations}=require('../src/core/techniques.cjs');
function evaluate(group,ds,calls,mode){const s=score(group.labels,ds),by=new Map(ds.map(d=>[d.node_id,d]));
 s.explicit_uncertain=group.labels.filter(l=>l.is_ad===null&&by.get(l.node_id).raw_ad_verdict==='uncertain').length;
 s.empty_reasons=ds.filter(d=>!d.reason.trim()).length;s.citation_correct=0;s.citation_total=0;
 if(['E','S'].includes(mode))for(const l of group.labels){const d=by.get(l.node_id),c=group.snapshot.candidates.find(c=>c.node_id===l.node_id);s.citation_total++;
  const want=l.is_ad===null?'insufficient':l.is_ad?'invitation':l.scenario==='quote'?'citation':'information';
  const valid=l.scenario==='quote'||l.scenario==='linked'?sources(c).filter(r=>r.position==='before'&&r.text!==c.raw_text).map(r=>r.id):['t'];
  s.citation_correct+=Number(d.reason_code===want&&d.evidence_ids.some(id=>valid.includes(id))&&(!l.expected_review||d.raw_ad_verdict==='uncertain'));
 }
 const combined=integrateObservations(group.snapshot,ds,group.snapshot.technique_observations);combined.decisions.forEach((d,i)=>{const {techniques,observed_techniques,...a}=d,{techniques:t,observed_techniques:o,...b}=ds[i];assert.deepEqual(a,b);});
 s.observer={...score(group.labels,combined.decisions),technique_reviews:combined.technique_diagnostics.length};
 s.tokens=calls.reduce((n,c)=>n+(c.usage?.total_tokens||0),0);s.calls=calls.length;s.elapsed_sec=calls.reduce((n,c)=>n+c.elapsed_sec,0);
 return {metrics:s,integrated:combined};
}
function gate(labels,r,a,b,diagnostic){const ads=new Set(labels.filter(l=>l.is_ad===true).map(l=>l.node_id)),common=a.positive_ids.filter(id=>ads.has(id)&&b.positive_ids.includes(id));
 return {lost:common.filter(id=>!r.positive_ids.includes(id)).length,fp:r.fp<=Math.min(a.fp,b.fp),f1:r.f1>=Math.max(a.f1,b.f1),normal_review:r.normal_review<=Math.min(a.normal_review,b.normal_review),
  explicit_uncertain:!diagnostic||r.explicit_uncertain>=3,citations:!diagnostic||r.citation_correct/r.citation_total>=.9,
  technique:r.observer.tech_correct>=Math.max(a.tech_correct,b.tech_correct),final:r.observer.final.f1>=Math.max(a.final.f1,b.final.f1),
  tokens:r.tokens<=1.2*Math.max(a.tokens,b.tokens),latency:r.elapsed_sec<=1.2*Math.max(a.elapsed_sec,b.elapsed_sec),calls:r.calls<=Math.max(a.calls,b.calls)};
}
const pass=g=>g.lost===0&&Object.entries(g).filter(([k])=>k!=='lost').every(([,v])=>v);
async function main(){check();if(!process.argv.includes('--live'))return;
 const project=path.resolve(__dirname,'../..'),root=path.join(project,'.runtime/intent-contract-'+Date.now());fs.mkdirSync(root,{recursive:true});
 const read=f=>JSON.parse(fs.readFileSync(f)),save=(n,v)=>fs.writeFileSync(path.join(root,n+'.json'),JSON.stringify(v,null,2)),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const data=path.join(project,'.runtime/context-ownership-data-v2'),groups=['dev','confirmation'].map(name=>({name,labels:read(path.join(data,name+'-labels.json')),snapshot:read(path.join(data,name+'-evidence.json'))}));
 const old=read(path.join(project,'.runtime/stage4-reuse/pilot-evidence.json')),labels=read(path.join(project,'.runtime/stage4-reuse/pilot-labels.json')),ids=new Set(labels.map(l=>l.node_id));
 const regression={name:'regression',labels,snapshot:{candidates:old.candidates.filter(c=>ids.has(c.node_id)),technique_observations:old.technique_observations.filter(o=>ids.has(o.node_id))}};
 const files=[__filename,path.join(__dirname,'semantic-intent-contract.cjs'),path.join(__dirname,'context-ownership.cjs'),path.join(__dirname,'priority-one.cjs'),path.join(project,'docs/intent-contract-plan.md'),...['llm.cjs','collect.cjs','techniques.cjs','jamo.cjs','confusables-latin.json'].map(f=>path.join(__dirname,'../src/core',f))];
 const hashes=Object.fromEntries(files.map(f=>[f,hash(f)]));for(const g of [...groups,regression]){save(g.name+'-labels',g.labels);save(g.name+'-evidence',g.snapshot);for(const suffix of ['labels','evidence']){const f=path.join(root,g.name+'-'+suffix+'.json');hashes[f]=hash(f);}}
 save('manifest',{hashes,order:['O1','J','E','S','O2'],limits:{calls:40,tokens:550000,seconds:3600},conditional_regression:true});
 const env={...process.env,...parseEnv(fs.readFileSync(path.join(project,'agent/.env'),'utf8'))},config={...configFromEnv('hcx',env),temperature:0,seed:42,maxTokens:3072,maxCalls:40,timeoutMs:180000,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:false,retryTransientTransport:false};
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('Experiment time limit')),3600000);let attempts=0,reserved=0,lastEnd=0;const results={diagnostic:{},regression:{}};const failures=[];
 async function runMode(panel,mode,selected){if(lastEnd)await delay(Math.max(0,61000-(Date.now()-lastEnd)),undefined,{signal:ctl.signal});for(const[f,h]of Object.entries(hashes))assert.equal(hash(f),h,'Frozen input/source changed');
  const prefix=panel+'-'+mode;let all=[];const session=createSession({...config,maxCalls:40-attempts},{signal:ctl.signal,contract:contract(mode),log:e=>{
   if(e.event==='llm_request'){const n=estimateRequestTokens(e.body);if(attempts+1>40||reserved+n>550000)throw Error('Experiment budget exceeded');attempts++;reserved+=n;save('budget',{attempts,reserved});}
   fs.appendFileSync(path.join(root,prefix+'-trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n');}});
  const measured={};try{for(const g of selected){const ds=[],at=session.calls.length;for(let i=0;i<g.snapshot.candidates.length;i+=16){const batch=await session.decide(g.snapshot.candidates.slice(i,i+16));ds.push(...batch);all.push(...batch);save(prefix+'-decisions',all);save(prefix+'-calls',session.calls);console.log(JSON.stringify({root,panel,mode,group:g.name,processed:ds.length}));}
    const e=evaluate(g,ds,session.calls.slice(at),mode);measured[g.name]=e.metrics;save(prefix+'-'+g.name+'-integrated',e.integrated);}
   results[panel][mode]=measured;save('results',results);return true;
  }catch(e){save(prefix+'-calls',session.calls);const failure={panel,mode,error:e.message,processed:all.length,calls:session.calls};failures.push(failure);save('failures',failures);
   // A complete response with a rejected local contract is a failed condition, never retried.
   if(!mode.startsWith('O')&&session.calls.at(-1)?.status==='ok')return false;throw e;
  }finally{lastEnd=Date.now();}
 }
 try{for(const mode of ['O1','J','E','S','O2'])await runMode('diagnostic',mode,groups);
  const gates={},eligible=[];for(const mode of ['E','S']){if(!results.diagnostic[mode])continue;gates[mode]={};let good=true;
   for(const g of groups){const r=results.diagnostic[mode][g.name],a=results.diagnostic.O1[g.name],b=results.diagnostic.O2[g.name],test=gate(g.labels,r,a,b,true);gates[mode][g.name]=test;
    good&&=pass(test);}
   const quoteFp=m=>groups.reduce((n,g)=>n+results.diagnostic[m][g.name].by_scenario.quote.fp,0);
   const before=Math.min(quoteFp('O1'),quoteFp('O2'));gates[mode].quote_reduction=quoteFp(mode)<before&&quoteFp(mode)<=before/2;good&&=gates[mode].quote_reduction;if(good)eligible.push(mode);
  }save('gates',{diagnostic:gates,eligible});
  eligible.sort((x,y)=>{const summary=m=>groups.reduce((a,g)=>{const v=results.diagnostic[m][g.name];return [a[0]+v.normal_review,a[1]-v.f1,a[2]+v.tokens];},[0,0,0]);const a=summary(x),b=summary(y);return a[0]-b[0]||a[1]-b[1]||a[2]-b[2];});
  const selected=eligible[0];let regression_pass=false;if(selected){for(const mode of ['O1',selected,'O2'])await runMode('regression',mode,[regression]);if(results.regression[selected]){const g=gate(regression.labels,results.regression[selected].regression,results.regression.O1.regression,results.regression.O2.regression,false);regression_pass=pass(g);save('regression-gate',g);}}
  save('completion',{status:'completed',attempts,reserved,selected:selected||null,regression_pass,adoption:'none; requires unused confirmation and 25-minute validation if diagnostic gates pass'});console.log(JSON.stringify({root,completed:true,selected,regression_pass}));
 }catch(e){save('failure',{error:e.message,attempts,reserved});console.error(JSON.stringify({root,error:e.message}));process.exitCode=1;}finally{clearTimeout(timer);}
}
module.exports={evaluate,gate};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
