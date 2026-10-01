// Research-only source overlay; production paths/relative imports remain intact.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),stage=path.join(root,'.runtime/request-quarantine-stage');
const files=new Map(Object.keys(JSON.parse(fs.readFileSync(path.join(stage,'manifest.json')))).map(f=>[path.resolve(root,f),path.join(stage,path.basename(f))]));
const original=Module._extensions['.js'];
Module._extensions['.js']=(m,f)=>files.has(f)?m._compile(fs.readFileSync(files.get(f),'utf8'),f):original(m,f);
