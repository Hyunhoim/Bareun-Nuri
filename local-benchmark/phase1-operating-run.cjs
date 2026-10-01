// Unmodified production worker; serve only public HTML, preserve one bounded run.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),data=path.join(root,'test-set-operating-phase1'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const completeRun=process.argv.includes('--complete');
const parallelRun=process.argv.includes('--parallel');assert(!(completeRun&&parallelRun));
async function main(){
 const dir=path.join(root,(parallelRun?'.runtime/phase1-parallel25-':completeRun?'.runtime/phase1-full-':'.runtime/phase1-operating-')+Date.now());fs.mkdirSync(dir);const save=(n,v)=>fs.writeFileSync(path.join(dir,n+'.json'),JSON.stringify(v,null,2));
 const datasetHash=sha(path.join(data,'manifest.json'));const dataset=JSON.parse(fs.readFileSync(path.join(data,'manifest.json')));for(const[f,h]of Object.entries(dataset.files))assert.equal(sha(path.join(data,f)),h,'Dataset drift');
 const oldPins=JSON.parse(fs.readFileSync(path.join(data,'private/operating-source-pin.json'))),pins=Object.fromEntries(Object.keys(oldPins).map(f=>[f,sha(path.join(root,f))]));
 const publicRoot=path.join(data,'public');const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),relative=decodeURIComponent(u.pathname).replace(/^\/+/,''),file=path.resolve(publicRoot,relative||'index.html');if(!file.startsWith(publicRoot+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(file));}catch{res.writeHead(400);res.end();}});
 if(parallelRun)for(const f of ['agent/experiments/phase1-parallel/worker.cjs','agent/experiments/phase1-parallel/bounded-scan.cjs'])pins[f]=sha(path.join(root,f));
 const port=parallelRun?Number(new URL(JSON.parse(fs.readFileSync(path.join(root,'.runtime/phase1-full-1790774023853/manifest.json'))).input.url).port):0;
 await new Promise((r,j)=>{server.once('error',j);server.listen(port,'127.0.0.1',r)});const url=`http://127.0.0.1:${server.address().port}/index.html`;
 const input={url,provider:'hcx',jobDir:path.join(dir,'scan'),envFile:path.join(root,'agent/.env'),maxPages:200,maxNodes:0,maxCalls:600,timeoutSeconds:1500};
 save('manifest',{dataset_sha256:sha(path.join(data,'manifest.json')),dataset_version:dataset.version,source_hashes:pins,changed_since_data_creation:Object.keys(pins).filter(f=>pins[f]!==oldPins[f]),input:{...input,envFile:'agent/.env'},scope:parallelRun?'Experimental three-request ordered waves; actual browser and HCX for25min; historical production control, same URL. No automatic retry or resume.':completeRun?'Unmodified production 25min then resume pending work; no fault injection. Gold never passed to worker.':'First 25-minute production run; no patches or resume. Gold never passed to worker.',runner_sha256:sha(__filename)});
 fs.copyFileSync(path.join(data,'private/gold.jsonl'),path.join(dir,'gold-frozen.jsonl'));fs.copyFileSync(path.join(data,'manifest.json'),path.join(dir,'dataset-manifest.json'));
 console.log(JSON.stringify({dir,url,phase:'starting',limits:{seconds:1500,calls:600,pages:200},model:'HCX-007',batch:12}));
 try{for(let segment=1;segment<=(completeRun?3:1);segment++){
 for(const[f,h]of Object.entries(pins))assert.equal(sha(path.join(root,f)),h,'Source drift before segment');
 const cpFile=path.join(input.jobDir,'checkpoint.json');if(segment>1){const prior=JSON.parse(fs.readFileSync(cpFile)).state;input.firstStartedAt=prior.started_at;input.segmentStartedAt=new Date().toISOString();input.timeoutSeconds=3600;}
 const segmentStarted=Date.now();let done=null;
 console.log(JSON.stringify({phase:'segment_start',segment,seconds:input.timeoutSeconds}));
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,parallelRun?'agent/experiments/phase1-parallel/worker.cjs':'agent/src/worker.cjs')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});let tail='',last=0;const timer=setTimeout(()=>{child.kill();reject(Error('hard_timeout_no_retry'));},(input.timeoutSeconds+310)*1000);
 child.stdout.on('data',b=>{tail+=b;let n;while((n=tail.indexOf('\n'))>=0){const line=tail.slice(0,n);tail=tail.slice(n+1);fs.appendFileSync(path.join(dir,'events.jsonl'),line+'\n');try{const e=JSON.parse(line);if(e.type==='done')done=e;if(e.type==='done'||Date.now()-last>30000){console.log(line);last=Date.now();}}catch{}}});
 child.stderr.on('data',b=>fs.appendFileSync(path.join(dir,'stderr.log'),b));child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('exit',code=>{clearTimeout(timer);save('completion-'+segment,{exit_code:code,finished_at:new Date().toISOString(),wall_sec:(Date.now()-segmentStarted)/1000,no_automatic_retry:true});resolve();});child.stdin.write(JSON.stringify(input)+'\n');});
 if(!fs.existsSync(cpFile))break;const cp=JSON.parse(fs.readFileSync(cpFile));save('checkpoint-segment-'+segment,cp);save('done-'+segment,done);
 const state=cp.state,remaining=state.pending.length||state.pages.some(p=>p.offset<p.work);
 if(!completeRun||!remaining||state.inflight||!['time_budget','call_budget','page_budget'].includes(state.reason))break;
 }save('completion',{finished_at:new Date().toISOString(),no_automatic_retry:true});} 
 finally{server.close();save('source-after',{unchanged:Object.entries(pins).every(([f,h])=>sha(path.join(root,f))===h),dataset_unchanged:sha(path.join(data,'manifest.json'))===datasetHash});}
 console.log(JSON.stringify({dir,phase:'finished'}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
