// One fresh 25min segment. Fixed Phase1 URL, never automatic retries/resume.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1];},worker=path.resolve(arg('--worker')||'agent/src/worker.cjs'),label=arg('--label');
assert(label&&/^[a-z0-9-]+$/.test(label));assert(worker.startsWith(root+path.sep));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),data=path.join(root,'test-set-operating-phase1'),publicRoot=path.join(data,'public');
async function main(){
 const dir=path.join(root,'.runtime/hcx-throughput-'+label+'-'+Date.now());fs.mkdirSync(dir);const save=(name,value)=>fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value,null,2));
 const dm=JSON.parse(fs.readFileSync(path.join(data,'manifest.json')));for(const[f,h]of Object.entries(dm.files))assert.equal(sha(path.join(data,f)),h);
 const oldPins=JSON.parse(fs.readFileSync(path.join(data,'private/operating-source-pin.json'))),files=new Set([...Object.keys(oldPins),path.relative(root,worker),...fs.readdirSync(path.dirname(worker)).filter(f=>f.endsWith('.cjs')).map(f=>path.relative(root,path.join(path.dirname(worker),f)))]);
 const pins=Object.fromEntries([...files].map(f=>[f,sha(path.join(root,f))])),phase2=sha('test-set-operating-phase2/manifest.json');
 const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),p=path.resolve(publicRoot,decodeURIComponent(u.pathname).replace(/^\/+/, '')||'index.html');if(!p.startsWith(publicRoot+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',p.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(p));}catch{res.writeHead(400);res.end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(57931,'127.0.0.1',resolve);});
 const input={url:'http://127.0.0.1:57931/index.html',provider:'hcx',jobDir:path.join(dir,'scan'),envFile:path.join(root,'agent/.env'),maxPages:200,maxNodes:0,maxCalls:600,timeoutSeconds:1500};
 save('manifest',{dataset_sha256:sha(path.join(data,'manifest.json')),dataset_version:dm.version,source_hashes:pins,input:{...input,envFile:'agent/.env'},worker:path.relative(root,worker),label,scope:'One actual25min run under hcx-throughput-goal-plan; gold never passed to worker',runner_sha256:sha(__filename)});
 fs.copyFileSync(path.join(data,'manifest.json'),path.join(dir,'dataset-manifest.json'));fs.copyFileSync(path.join(data,'private/gold.jsonl'),path.join(dir,'gold-frozen.jsonl'));
 console.log(JSON.stringify({dir,worker,label,phase:'start'}));
 try{await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[worker],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']}),begin=Date.now();let tail='',last=0;
 const timer=setTimeout(()=>{child.kill();reject(Error('Hard stop; never retry automatically'));},1810000);
 child.stdout.on('data',b=>{tail+=b;let n;while((n=tail.indexOf('\n'))>=0){const line=tail.slice(0,n);tail=tail.slice(n+1);fs.appendFileSync(path.join(dir,'events.jsonl'),line+'\n');const e=JSON.parse(line);if(e.type==='done'||Date.now()-last>30000){console.log(line);last=Date.now();}}});
 child.stderr.on('data',b=>fs.appendFileSync(path.join(dir,'stderr.log'),b));child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);save('completion',{exit_code:code,wall_sec:(Date.now()-begin)/1000,no_automatic_retry:true});resolve();});child.stdin.write(JSON.stringify(input)+'\n');});}
 finally{server.close();save('source-after',{unchanged:Object.entries(pins).every(([f,h])=>sha(path.join(root,f))===h),phase2_unchanged:sha('test-set-operating-phase2/manifest.json')===phase2});}
 console.log(JSON.stringify({dir,phase:'finished'}));
}
if(process.argv.includes('--selftest'))console.log(JSON.stringify({worker,label,api:0}));else main().catch(e=>{console.error(e.message);process.exitCode=1;});
