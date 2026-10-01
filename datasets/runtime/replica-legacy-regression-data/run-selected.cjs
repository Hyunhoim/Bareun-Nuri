// Importing this module makes no model calls. Caller must explicitly invoke runSelected.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'../..'),read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function runSelected({selectionFile,mode,out,limits}){
 selectionFile=path.resolve(selectionFile);const selection=read(selectionFile),data=__dirname,manifestFile=path.join(data,'manifest.json'),manifest=read(manifestFile);
 assert.equal(selection.status,'frozen');assert(selection.modes.includes(mode));assert(Number.isFinite(Date.parse(selection.frozen_at))&&Date.parse(selection.frozen_at)<=Date.now());
 assert(limits&&Number.isInteger(limits.calls)&&Number.isInteger(limits.tokens)&&Number.isInteger(limits.seconds));assert(limits.seconds>0&&limits.seconds<=3600);
 const required=['agent/experiments/replica-intent-round2.cjs','agent/experiments/replica-intent-methods.cjs','agent/src/core/judgment.cjs'];
 if(mode==='reading4')required.push('.runtime/replica-jamo-stage/jamo-reading-aid.cjs','.runtime/replica-jamo-stage/jamo-baseline.cjs');
 for(const file of required)assert(selection.hashes?.[file],'Selection must freeze '+file);
 const verify=()=>{for(const [f,h]of Object.entries(selection.hashes))assert.equal(sha(path.resolve(project,f)),h);for(const [f,h]of Object.entries(manifest.panel_sha256))assert.equal(sha(path.join(data,f)),h);};verify();
 const snapshot=read(path.join(data,'evidence.json')),labels=read(path.join(data,'labels.json'));
 const options=mode==='reading4'?{readingAid:require(path.join(project,'.runtime/replica-jamo-stage/jamo-reading-aid.cjs')).readingAid}:{};
 const chosen=require(path.join(project,'agent/experiments/replica-intent-round2.cjs')).specs(options)[mode];assert(chosen,'Unknown mode');
 assert(limits.calls>=Math.ceil(snapshot.candidates.length/chosen.batchSize),'Calls cannot complete one fixed order');
 const sourceFiles=[__filename,selectionFile,...required.map(f=>path.join(project,f))];
 const hashes=Object.fromEntries(sourceFiles.map(f=>[f,sha(f)]));
 try{return await require(path.join(project,'agent/experiments/semantic-search-run.cjs')).runComparison({root:path.resolve(out),groups:[{name:'legacy615',labels,snapshot}],modes:[mode],rounds:1,maxTokens:chosen.maxTokens,methodSpecs:{[mode]:chosen},sourceFiles,limits});}
 finally{verify();for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h);}
}
module.exports={runSelected};
