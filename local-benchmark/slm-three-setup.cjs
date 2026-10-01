// Isolated, revision-pinned CPU artifacts. Never imported by production.
const fs=require('node:fs'),path=require('node:path'),{pipeline}=require('node:stream/promises'),{Readable}=require('node:stream');
const {hash}=require('./qwen-cpu-setup.cjs');
const root=path.resolve(__dirname,'../.runtime/slm-three');
const assets=[
 {id:'exaone',repo:'LGAI-EXAONE/EXAONE-4.0-1.2B-GGUF',revision:'162446400ea4596377a3ce1d3ddffa32971af0a6',file:'EXAONE-4.0-1.2B-Q4_K_M.gguf',size:812437792,sha256:'7b5e753540183ae4d56e6febd9b48cdd944de53386e6faa8f51c8f98cb2b47df'},
 {id:'kanana',repo:'mradermacher/kanana-2-3b-instruct-GGUF',revision:'45a8a3e5925aa2c3615f6ed49fbc308132c9b587',file:'kanana-2-3b-instruct.Q4_K_M.gguf',size:2161793920,sha256:'d76035e014a198801ccc1d6f83f59f64a7bf6969b23773d6311e1696a828d74c'},
 {id:'bllossom',repo:'Bllossom/llama-3.2-Korean-Bllossom-3B-gguf-Q4_K_M',revision:'c07b7a0f2688d1212612b653a752a0dfe4e18bae',file:'llama-3.2-Korean-Bllossom-3B-gguf-Q4_K_M.gguf',size:2019377664,sha256:'389f380bbfbe77d9171937b3d166a26ccc3e04201f3d9fb0ca1b5e01b6787621'}
];
async function main(){fs.mkdirSync(root,{recursive:true});const results=await Promise.allSettled(assets.map(async a=>{const dir=path.join(root,a.id);fs.mkdirSync(dir,{recursive:true});const dest=path.join(dir,a.file);if(!fs.existsSync(dest)){const r=await fetch(`https://huggingface.co/${a.repo}/resolve/${a.revision}/${a.file}`,{signal:AbortSignal.timeout(1800000)});if(!r.ok)throw Error(a.id+' HTTP '+r.status);console.log('Downloading '+a.id);await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(dest+'.partial'));if(fs.statSync(dest+'.partial').size!==a.size||await hash(dest+'.partial')!==a.sha256)throw Error(a.id+' verification failed');fs.renameSync(dest+'.partial',dest);}if(await hash(dest)!==a.sha256)throw Error(a.id+' existing hash mismatch');console.log('Verified '+a.id);return a.id;}));fs.writeFileSync(path.join(root,'assets.json'),JSON.stringify(assets,null,2));for(const r of results)if(r.status==='rejected')throw r.reason;}
module.exports={root,assets};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
