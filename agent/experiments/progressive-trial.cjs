const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{setTimeout:delay}=require('node:timers/promises');
const phase=process.argv[2];if(!['dry','live'].includes(phase))throw Error('dry or live');
const root=process.argv[3]||'.runtime/progressive-'+phase;fs.mkdirSync(root);
const files=['docs/progressive-mixed-plan.md','docs/progressive-input-budget-plan.md','agent/src/worker.cjs','agent/src/core/collect.cjs','agent/src/core/llm.cjs','agent/src/core/output.cjs','agent/src/core/jamo.cjs','agent/src/core/techniques.cjs','agent/src/core/confusables-latin.json','agent/experiments/priority.cjs','local-benchmark/serve.py','test-set-v3/build.cjs','test-set-v3/private/routes.json','test-set-v3/private/labels.json',
 ...['progressive.cjs','progressive-run.cjs','progressive-score.cjs','progressive-trial.cjs','progressive.test.cjs','progressive-browser.test.cjs','progressive-recovery.test.cjs','request-budget.cjs','request-budget.test.cjs'].map(p=>'agent/experiments/'+p),
 ...fs.readdirSync('test-set-v3/public',{recursive:true}).map(p=>path.join('test-set-v3/public',p)).filter(p=>fs.statSync(p).isFile())];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const manifest={at:new Date().toISOString(),phase,files:Object.fromEntries(files.map(p=>[p,hash(p)]))};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
const python=process.env.PYTHON_EXE||path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const log=fs.openSync(path.join(root,'server.log'),'wx');
const server=spawn(python,['-X','utf8','local-benchmark/serve.py','--dataset-root','test-set-v3','--entry','/dev/','--port','8787'],{windowsHide:true,stdio:['ignore',log,log]});
const child=(args)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{windowsHide:true,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('Child failed '+code)));});
(async()=>{
 try{
  let ready=false;for(let i=0;i<40;i++){await delay(100);if(server.exitCode!==null)throw Error('Server stopped');try{const r=await fetch('http://127.0.0.1:8787/dev/');await r.arrayBuffer();if(r.ok){ready=true;break;}}catch{}}if(!ready)throw Error('Server unavailable');
  for(const split of ['dev','confirmation'])for(const mode of phase==='dry'?['fifo']:['fifo','priority','filter']){
   console.log('BEGIN '+phase+' '+split+' '+mode);
   await child(['agent/experiments/progressive-run.cjs','http://127.0.0.1:8787/'+split+'/',path.join(root,split+'-'+mode),mode,phase==='dry'?'40':'20',phase==='dry'?'60':'12',phase==='dry'?'600':'600',phase==='dry'?'mock':'hcx']);
  }
  for(const [p,h]of Object.entries(manifest.files))if(hash(p)!==h)throw Error('Frozen file changed '+p);
  console.log('DONE '+phase);
 }finally{server.kill();fs.closeSync(log);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
