const fs=require('node:fs'),path=require('node:path'),{pipeline}=require('node:stream/promises'),{Readable}=require('node:stream');
const {hash}=require('./qwen-cpu-setup.cjs');
const root=path.resolve('.runtime/gemma4-cpu');
async function main(){
 fs.mkdirSync(root,{recursive:true});
 const repo='google/gemma-4-E2B-it-qat-q4_0-gguf';
 const meta=await (await fetch('https://huggingface.co/api/models/'+repo)).json();
 const files=await(await fetch('https://huggingface.co/api/models/'+repo+'/tree/'+meta.sha)).json();
 const f=files.find(x=>x.path==='gemma-4-E2B_q4_0-it.gguf');
 const assets=[{name:f.path,size:f.size,sha256:f.lfs.oid,url:'https://huggingface.co/'+repo+'/resolve/'+meta.sha+'/'+f.path},{name:'llama.zip',size:19197239,sha256:'d1ae718af63497d74caf4a012e4550bbbdfab2d9faceefbd5f06b73dacbe903a',url:'https://github.com/ggml-org/llama.cpp/releases/download/b11284/llama-b11284-bin-win-cpu-x64.zip'}];
 fs.writeFileSync(path.join(root,'assets.json'),JSON.stringify({repo,revision:meta.sha,assets},null,2));
 for(const a of assets){const file=path.join(root,a.name);if(fs.existsSync(file)){if(await hash(file)!==a.sha256)throw Error('Existing hash mismatch');continue;}const r=await fetch(a.url,{signal:AbortSignal.timeout(1800000)});if(!r.ok)throw Error('Download HTTP '+r.status);console.log('Downloading '+a.name);await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(file+'.partial'));if(fs.statSync(file+'.partial').size!==a.size||await hash(file+'.partial')!==a.sha256)throw Error('Download hash/size mismatch');fs.renameSync(file+'.partial',file);console.log('Verified '+a.name);}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
