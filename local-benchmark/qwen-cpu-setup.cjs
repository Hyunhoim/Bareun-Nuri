// Portable files only; no global installation and no production imports.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pipeline}=require('node:stream/promises'),{Readable}=require('node:stream');
const root=path.resolve(__dirname,'../.runtime/qwen-cpu');
const assets=[
 {name:'llama-b11217-bin-win-cpu-x64.zip',url:'https://github.com/ggml-org/llama.cpp/releases/download/b11217/llama-b11217-bin-win-cpu-x64.zip',sha256:'6e2c2151162d2850204f515cfb1e015a10153755d4c72933ce28f7c3b6650790',size:19154722},
 {name:'Qwen3.5-2B-Q4_K_M.gguf',url:'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf',sha256:'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',size:1280835840}
];
async function hash(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
async function main(){fs.mkdirSync(root,{recursive:true});for(const a of assets){const file=path.join(root,a.name);if(fs.existsSync(file)){if(await hash(file)!==a.sha256)throw Error('Existing file hash mismatch: '+a.name);continue;}const r=await fetch(a.url,{signal:AbortSignal.timeout(1800000)});if(!r.ok)throw Error('Download HTTP '+r.status);console.log('Downloading '+a.name);await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(file+'.partial'));if(fs.statSync(file+'.partial').size!==a.size||await hash(file+'.partial')!==a.sha256)throw Error('Downloaded asset verification failed');fs.renameSync(file+'.partial',file);console.log('Verified '+a.name);}fs.writeFileSync(path.join(root,'assets.json'),JSON.stringify(assets,null,2));}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={root,assets,hash};
