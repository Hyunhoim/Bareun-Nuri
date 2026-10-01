// One-factor evidence transfer comparisons. Never imported by the operational worker.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{parseEnv}=require('node:util');
const {baselineContract,createSession,configFromEnv,estimateRequestTokens}=require('../src/core/llm.cjs');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const contract=mode=>({...baselineContract,formatRepair:false,initialEvidence:c=>({...baselineContract.initialEvidence(c),
 ...(mode==='context'?{reference_context:c.context_evidence}:{}),...(mode==='style'?{ancestor_styles:c.ancestors}:{})})});
function metrics(labels,decisions){const byId=new Map(decisions.map(d=>[d.node_id,d]));let tp=0,fp=0,fn=0,review=0,tech=0,techTotal=0;const positives=[];
 for(const l of labels){const d=byId.get(l.node_id);assert(d);const positive=d.is_violation&&!d.needs_review;if(positive)positives.push(l.node_id);if(positive&&l.is_ad)tp++;if(positive&&!l.is_ad)fp++;if(!positive&&l.is_ad)fn++;review+=Number(d.needs_review);
  if(l.observed){techTotal++;if(JSON.stringify([...d.observed_techniques].sort())===JSON.stringify([...l.observed].sort()))tech++;}}
 return {tp,fp,fn,precision:tp/(tp+fp)||0,recall:tp/(tp+fn)||0,f1:2*tp/(2*tp+fp+fn)||0,review,tech_correct:tech,tech_total:techTotal,positive_ids:positives};}
async function main(){
 const root=path.resolve(__dirname,'../../.runtime/priority-one-'+Date.now());fs.mkdirSync(root,{recursive:true});const save=(n,v)=>fs.writeFileSync(path.join(root,n+'.json'),JSON.stringify(v,null,2));
 const labelFile=path.resolve(__dirname,'../../.runtime/stage4-reuse/pilot-labels.json'),evidenceFile=path.resolve(__dirname,'../../.runtime/stage4-reuse/pilot-evidence.json');
 const labels=JSON.parse(fs.readFileSync(labelFile)),ids=new Set(labels.map(l=>l.node_id)),candidates=JSON.parse(fs.readFileSync(evidenceFile)).candidates.filter(c=>ids.has(c.node_id));assert.equal(candidates.length,76);
 const files=[__filename,require.resolve('../src/core/llm.cjs'),labelFile,evidenceFile],hashes=Object.fromEntries(files.map(f=>[f,sha(f)]));save('manifest',{hashes,limits:{calls:32,tokens:400000,seconds:3600},order:['baseline-a','context','style','baseline-b'],labels:76,batch:16});save('input',{candidates});save('labels',labels);
 for(const c of candidates){const base=contract('baseline-a').initialEvidence(c);for(const mode of ['context','style']){const extended=contract(mode).initialEvidence(c);for(const [k,v]of Object.entries(base))assert.deepEqual(extended[k],v);assert(!('is_ad'in extended));}assert(!('context_evidence'in base));}
 if(!process.argv.includes('--live')){console.log(JSON.stringify({root,checks:'76 candidate base fields preserved; labels excluded; context/style isolated'}));return;}
 const env={...process.env,...parseEnv(fs.readFileSync(path.resolve(__dirname,'../.env'),'utf8'))};const config={...configFromEnv('hcx',env),temperature:0,reasoningEffort:'none',seed:42,maxTokens:3072,maxCalls:32,timeoutMs:180000,minIntervalMs:1000,tokensPerMinute:52000,retryRateLimit:false,retryTransientTransport:false};
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('Experiment time limit')),3600000);let spent=0,attempts=0,session,mode,decisions=[],start=0;const results={};
 console.log(JSON.stringify({root,phase:'live started',maximum_calls:32}));
 try{
  for(mode of ['baseline-a','context','style','baseline-b']){
   for(const[f,h]of Object.entries(hashes))assert.equal(sha(f),h,'Frozen input/source changed');decisions=[];start=performance.now();
   session=createSession({...config,maxCalls:32-attempts},{signal:ctl.signal,contract:contract(mode),log:e=>{
    if(e.event==='llm_request'){const tokens=estimateRequestTokens(e.body);if(++attempts>32||spent+tokens>400000)throw Error('Experiment budget exhausted');spent+=tokens;save('budget',{attempts,reservedTokens:spent});}
    fs.appendFileSync(path.join(root,mode+'-trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n');
   }});
   for(let i=0;i<candidates.length;i+=16){const batch=candidates.slice(i,i+16);decisions.push(...await session.decide(batch));save(mode+'-decisions',decisions);save(mode+'-run',{status:'running',calls:session.calls});console.log(JSON.stringify({mode,processed:decisions.length,total:76}));}
   results[mode]={...metrics(labels,decisions),elapsed_sec:(performance.now()-start)/1000,tokens:session.calls.reduce((s,c)=>s+(c.usage?.total_tokens||0),0),calls:session.calls.length};save(mode+'-run',{status:'completed',...results[mode],call_records:session.calls});save('results',results);
  }
  const a=results['baseline-a'],b=results['baseline-b'],adIds=new Set(labels.filter(l=>l.is_ad).map(l=>l.node_id));
  for(const m of ['context','style']){const r=results[m],kept=a.positive_ids.filter(id=>adIds.has(id)&&b.positive_ids.includes(id)),lost=kept.filter(id=>!r.positive_ids.includes(id));
   r.gates={lost_baseline_ads:lost.length,no_fp_regression:r.fp<=Math.min(a.fp,b.fp),no_f1_regression:r.f1>=Math.max(a.f1,b.f1),no_tech_regression:r.tech_correct>=Math.max(a.tech_correct,b.tech_correct),
    useful_gain:m==='context'?(r.fn<Math.min(a.fn,b.fn)||r.fp<Math.min(a.fp,b.fp)):r.tech_correct>Math.max(a.tech_correct,b.tech_correct),
    cost:r.tokens<=1.2*Math.max(a.tokens,b.tokens),latency:r.elapsed_sec<=1.2*Math.max(a.elapsed_sec,b.elapsed_sec)};
   r.passed=lost.length===0&&Object.entries(r.gates).filter(([k])=>k!=='lost_baseline_ads').every(([,v])=>v);
  }
  save('results',results);console.log(JSON.stringify({root,results,reservedTokens:spent,attempts}));
 }catch(e){save('failure',{mode,error:e.message,processed:decisions.length,calls:session?.calls||[],attempts,reservedTokens:spent,results});console.error(JSON.stringify({root,status:'partial',mode,error:e.message}));process.exitCode=1;}
 finally{clearTimeout(timer);}
}
module.exports={contract,metrics};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
