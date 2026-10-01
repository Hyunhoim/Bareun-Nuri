// Opt-in paid HCX experiment. Runtime worker does not import these contracts.
const fs=require('node:fs'),path=require('node:path'),{parseEnv}=require('node:util');
const {configFromEnv,createSession}=require('../src/core/llm.cjs');
const {outputResult}=require('../src/core/output.cjs');
async function main(){
  const [mode,input,destination]=process.argv.slice(2);
  if(!['context','intent','isolated','contextual','attributed'].includes(mode)||!input||!destination)throw Error('Usage: node agent/experiments/run.cjs context|intent|isolated|contextual|attributed evidence.json NEW_OUTPUT_DIR');
  const snapshot=JSON.parse(fs.readFileSync(path.resolve(input))),dir=path.resolve(destination);
  if(fs.existsSync(dir))throw Error('Output directory already exists; choose a new path');
  const env={...process.env,...parseEnv(fs.readFileSync(path.join(__dirname,'../.env'),'utf8'))};
  const config={...configFromEnv('hcx',env),maxTokens:3072,timeoutMs:180000,maxCalls:300,minIntervalMs:1000,
    tokensPerMinute:52000,retryRateLimit:true,retryTransientTransport:true,seed:42};
  const contract=require('./'+(['isolated','contextual','attributed'].includes(mode)?'target':mode)+'-contract.cjs'),ctl=new AbortController();
  let decisions=[];const started=new Date().toISOString(),begin=performance.now();
  fs.mkdirSync(dir,{recursive:true});
  const save=(name,value)=>fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value,null,2));
  const session=createSession(config,{contract,signal:ctl.signal,log:e=>fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify(e)+'\n')});
  let serviceSession,quoteSession,rescueSession,confirmSession,domainSession;
  const timer=setTimeout(()=>ctl.abort(Error('Experiment time limit exceeded')),3600000);
  const cancel=()=>ctl.abort(Error('Experiment cancelled'));process.once('SIGINT',cancel);
  let status='failed',error;
  try{
    save('evidence',snapshot);
    for(let i=0;i<snapshot.candidates.length;i+=16){
      decisions.push(...await session.decide(snapshot.candidates.slice(i,i+16)));save('decisions',decisions);
      console.log(JSON.stringify({processed:decisions.length,total:snapshot.candidates.length,calls:session.calls.length}));
    }
    if(['isolated','contextual','attributed'].includes(mode)){
      const {quotationSources,applyQuotationContext,decideIdentified,reconcileSourceClaims,serviceCandidates,applyServiceContext,rescueCandidates,applyRescueContext,confirmationCandidates,confirmRescue,domainCandidates,verifyRescueDomain}=require('./contextualize.cjs');
      save('target-decisions',decisions);
      const initial=decisions;
      const offers=serviceCandidates(snapshot.candidates,decisions),serviceJudgments=[];
      save('service-node-ids',offers.map(c=>c.node_id));
      if(offers.length){
        const used=session.calls.length;
        if(used>=config.maxCalls)throw Error('No call budget left for service validation');
        serviceSession=createSession({...config,maxCalls:config.maxCalls-used},{contract:require('./service-contract.cjs'),signal:ctl.signal,
          log:e=>fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify({...e,phase:'service'})+'\n')});
        for(let i=0;i<offers.length;i+=16){serviceJudgments.push(...await decideIdentified(serviceSession,offers.slice(i,i+16)));save('service-decisions',serviceJudgments);
          console.log(JSON.stringify({serviceProcessed:serviceJudgments.length,serviceTotal:offers.length}));}
      }
      decisions=applyServiceContext(snapshot.candidates,decisions,serviceJudgments);save('context-input-decisions',decisions);
      const sources=quotationSources(snapshot.candidates,decisions),observations=[];save('source-evidence',sources);
      if(sources.length){
        const used=session.calls.length+(serviceSession?.calls.length||0);
        if(used>=config.maxCalls)throw Error('No call budget left for contextual validation');
        quoteSession=createSession({...config,maxCalls:config.maxCalls-used},{contract:require('./support-contract.cjs'),signal:ctl.signal,
          log:e=>fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify({...e,phase:'quotation'})+'\n')});
        for(let i=0;i<sources.length;i+=16){observations.push(...await decideIdentified(quoteSession,sources.slice(i,i+16)));save('source-decisions',observations);
          console.log(JSON.stringify({sourceProcessed:observations.length,sourceTotal:sources.length}));}
        save('source-initial-decisions',observations);
        const reversed=sources.slice().reverse();
        for(let i=0;i<reversed.length;i+=16)observations.push(...await decideIdentified(quoteSession,reversed.slice(i,i+16)));
        save('source-order-check',observations.slice(sources.length));
        const checked=await reconcileSourceClaims(quoteSession,sources,observations);
        observations.splice(0,observations.length,...checked.observations);save('source-decisions',observations);save('source-resolutions',checked.resolutions);
      }
      decisions=applyQuotationContext(snapshot.candidates,decisions,sources,observations);save('decisions',decisions);
      save('baseline-decisions',decisions);
      save('baseline-metrics',{calls:session.calls.length+(serviceSession?.calls.length||0)+(quoteSession?.calls.length||0),elapsedSec:(performance.now()-begin)/1000});
      if(mode==='attributed'){
        const nodes=rescueCandidates(snapshot.candidates,initial,decisions),rescued=[];
        save('rescue-node-ids',nodes.map(c=>c.node_id));
        if(nodes.length){
          const used=session.calls.length+(serviceSession?.calls.length||0)+(quoteSession?.calls.length||0);
          if(used>=config.maxCalls)throw Error('No call budget left for attribution');
          rescueSession=createSession({...config,reasoningEffort:'low',maxTokens:5120,maxCalls:config.maxCalls-used},
            {contract:require('./attribution-contract.cjs'),signal:ctl.signal,log:e=>fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify({...e,phase:'attribution'})+'\n')});
          for(let i=0;i<nodes.length;i+=4){rescued.push(...await decideIdentified(rescueSession,nodes.slice(i,i+4)));save('attribution-decisions',rescued);
            console.log(JSON.stringify({attributionProcessed:rescued.length,attributionTotal:nodes.length}));}
        }
        decisions=applyRescueContext(snapshot.candidates,initial,decisions,rescued);save('decisions',decisions);
      }
      if(mode==='contextual'){
        const nodes=rescueCandidates(snapshot.candidates,initial,decisions),rescued=[];
        save('rescue-node-ids',nodes.map(c=>c.node_id));
        if(nodes.length){
          const used=session.calls.length+(serviceSession?.calls.length||0)+(quoteSession?.calls.length||0);
          if(used>=config.maxCalls)throw Error('No call budget left for contextual rescue');
          rescueSession=createSession({...config,reasoningEffort:'low',maxTokens:5120,maxCalls:config.maxCalls-used},
            {contract:require('./rescue-contract.cjs'),signal:ctl.signal,log:e=>fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify({...e,phase:'rescue'})+'\n')});
          for(let i=0;i<nodes.length;i+=4){rescued.push(...await decideIdentified(rescueSession,nodes.slice(i,i+4)));save('rescue-decisions',rescued);
            console.log(JSON.stringify({rescueProcessed:rescued.length,rescueTotal:nodes.length}));}
        }
        const proposed=confirmationCandidates(nodes,rescued),roles=[];
        if(proposed.length){
          const used=session.calls.length+(serviceSession?.calls.length||0)+(quoteSession?.calls.length||0)+(rescueSession?.calls.length||0);
          if(used>=config.maxCalls)throw Error('No call budget left for role confirmation');
          confirmSession=createSession({...config,reasoningEffort:'low',maxTokens:5120,maxCalls:config.maxCalls-used},
            {contract:require('./role-contract.cjs'),signal:ctl.signal,log:e=>fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify({...e,phase:'confirmation'})+'\n')});
          for(let i=0;i<proposed.length;i+=4){roles.push(...await decideIdentified(confirmSession,proposed.slice(i,i+4)));save('confirmation-decisions',roles);
            console.log(JSON.stringify({confirmProcessed:roles.length,confirmTotal:proposed.length}));}
        }
        let confirmed=confirmRescue(rescued,roles,nodes);save('confirmed-rescue-decisions',confirmed);
        const domainNodes=domainCandidates(nodes,confirmed),domains=[];
        if(domainNodes.length){
          const used=session.calls.length+(serviceSession?.calls.length||0)+(quoteSession?.calls.length||0)+(rescueSession?.calls.length||0)+(confirmSession?.calls.length||0);
          if(used>=config.maxCalls)throw Error('No call budget left for service-domain confirmation');
          domainSession=createSession({...config,maxCalls:config.maxCalls-used},
            {contract:require('./domain-contract.cjs'),signal:ctl.signal,log:e=>fs.appendFileSync(path.join(dir,'trace.jsonl'),JSON.stringify({...e,phase:'domain'})+'\n')});
          for(let i=0;i<domainNodes.length;i+=16){domains.push(...await decideIdentified(domainSession,domainNodes.slice(i,i+16)));save('domain-decisions',domains);}
        }
        confirmed=verifyRescueDomain(nodes,confirmed,domains);
        decisions=applyRescueContext(snapshot.candidates,initial,decisions,confirmed);save('decisions',decisions);
      }
    }
    ctl.signal.throwIfAborted();
    if(mode==='context'){
      const out=outputResult(snapshot,decisions,started,(performance.now()-begin)/1000,'hcx');
      out.result.meta.tool_version+='/experimental-context';save('result',out.result);save('diagnostics',out.diagnostics);
    }
    status='completed';
  }catch(e){error=String(e.message).replaceAll(config.apiKey,'[REDACTED]');throw Error(error);}
  finally{
    clearTimeout(timer);process.removeListener('SIGINT',cancel);
    const calls=[...session.calls,...serviceSession?.calls||[],...quoteSession?.calls||[],...rescueSession?.calls||[],...confirmSession?.calls||[],...domainSession?.calls||[]];
    save('run',{mode,status,error,started,elapsedSec:(performance.now()-begin)/1000,batch:16,rescueBatch:4,rescueReasoning:['contextual','attributed'].includes(mode)?'low':null,processed:decisions.length,calls,
      totalTokens:calls.every(c=>Number.isFinite(c.usage?.total_tokens))?calls.reduce((s,c)=>s+c.usage.total_tokens,0):null});
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
