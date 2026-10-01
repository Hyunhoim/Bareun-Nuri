// Load the unchanged bridge algorithm with isolated, hash-verified experiment assets.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(root,'agent/src/core/antispoof.cjs');
let source=fs.readFileSync(file,'utf8');
for(const [from,to] of [
 ["assets=path.join(root,'agent/models/kcelectra-antispoof-v1')","assets="+JSON.stringify(path.join(root,'.runtime/antispoof-typed-runtime-v1/assets'))],
 ["path.join(root,'agent/antispoof/infer.py')",JSON.stringify(path.join(root,'.runtime/antispoof-typed-runtime-v1/infer.py'))],
 ["assert.equal(manifest.version,'1.0')","assert.equal(manifest.version,'typed-research-v1')"],
 ["version:'1.0'","version:'typed-research-v1'"],
 ["reason:'KcElectra-AntiSpoof-v1.0'","reason:'KcElectra-AntiSpoof-typed-research-v1'"]]){assert.equal(source.split(from).length,2,'Bridge source drift');source=source.replace(from,to);}
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=module.paths;loaded._compile(source,file);module.exports=loaded.exports;
