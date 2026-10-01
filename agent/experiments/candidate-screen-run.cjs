const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createSession}=require('../src/core/llm.cjs'),{configuration}=require('./replica-intent-run.cjs');
const {estimate}=require('./semantic-search-run.cjs'),{contract}=require('./candidate-screen.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f));
async function main(){
 const root='.runtime/candidate-screen-v1';assert(!fs.existsSync(root),'Fresh output required');fs.mkdirSync(root);const save=(n,v)=>fs.writeFileSync(path.join(root,n+'.json'),JSON.stringify(v,null,2));
 const gs=require('./scoped-input-run.cjs').groups(),files=[__filename,require.resolve('./candidate-screen.cjs'),require.resolve('./scoped-input-run.cjs'),require.resolve('./scoped-input-panel.cjs'),require.resolve('../src/core/judgment.cjs'),require.resolve('../src/core/llm.cjs'),require.resolve('../src/core/json-envelope.cjs'),'docs/candidate-screen-plan.md'];
 const hashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]));fs.mkdirSync(path.join(root,'source'));for(const f of files)fs.copyFileSync(f,path.join(root,'source',path.basename(f)));
 const {config:base}=configuration(),config={...base,maxTokens:1024,maxCalls:32,minIntervalMs:1000,tokensPerMinute:52000,timeoutMs:180000,retryRateLimit:false,retryTransientTransport:false};
 const safe={...config};delete safe.apiKey;save('manifest',{hashes,settings:safe,groups:gs.map(g=>({name:g.name,n:g.labels.length})),limits:{calls:32,tokens:300000,seconds:3600},live:process.argv.includes('--live')});
 for(const g of gs)save(g.name+'-input',g);
 const plans=[];for(let r=0;r<2;r++)for(const g of gs){const cs=r?[...g.snapshot.candidates].sort((a,b)=>sha('screen-order-'+a.node_id).localeCompare(sha('screen-order-'+b.node_id))):g.snapshot.candidates;for(let i=0;i<cs.length;i+=16)plans.push({round:r,group:g.name,batch:cs.slice(i,i+16)});}
 let reserved=0;for(const p of plans){p.estimate=(await estimate(p.batch,config,contract())).tokens;reserved+=p.estimate;}assert(plans.length<=32&&reserved<=300000);save('preflight',{calls:plans.length,reserved});console.log(JSON.stringify({calls:plans.length,reserved}));
 if(!process.argv.includes('--live'))return;
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(Error('experiment_deadline')),3600000),start=performance.now();let error=null;const rows=[];
 const session=createSession(config,{contract:contract(),signal:ctl.signal,log:e=>fs.appendFileSync(path.join(root,'trace.jsonl'),JSON.stringify(e)+'\n')});
 try{for(const p of plans){for(const[f,h]of Object.entries(hashes))assert.equal(sha(fs.readFileSync(f)),h,'Frozen source changed');const ds=await session.decide(p.batch);rows.push(...ds.map(d=>({...d,group:p.group,round:p.round})));save('decisions',rows);save('calls',session.calls);console.log(JSON.stringify({group:p.group,round:p.round,done:rows.length,calls:session.calls.length}));}}
 catch(e){error=String(e.message).replaceAll(config.apiKey,'[REDACTED]');}finally{clearTimeout(timer);save('calls',session.calls);save('completion',{error,status:error?'failed':'completed',wall_sec:(performance.now()-start)/1000,calls:session.calls.length,tokens:session.calls.reduce((n,c)=>n+(c.usage?.total_tokens||0),0),no_automatic_retry:true});}
 const result=[];for(let r=0;r<2;r++)for(const g of gs){const ds=rows.filter(x=>x.group===g.name&&x.round===r),by=new Map(ds.map(d=>[d.node_id,d]));result.push({group:g.name,round:r,total:g.labels.length,processed:ds.length,ads:g.labels.filter(l=>l.is_ad===true).length,ads_kept:g.labels.filter(l=>l.is_ad===true&&by.get(l.node_id)?.keep).length,normal:g.labels.filter(l=>l.is_ad===false).length,normal_excluded:g.labels.filter(l=>l.is_ad===false&&by.get(l.node_id)?.keep===false).length,uncertain_excluded:g.labels.filter(l=>l.is_ad===null&&by.get(l.node_id)?.keep===false).length,excluded_ads:g.labels.filter(l=>l.is_ad===true&&by.get(l.node_id)?.keep===false).map(l=>l.node_id)});}
 save('results',result);console.log(JSON.stringify(result));if(error)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
