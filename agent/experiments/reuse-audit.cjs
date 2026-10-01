// Read-only stage-4 measurement. No candidate filtering or production cache is installed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const vm=require('node:vm'),{createRequire}=require('node:module');
const sourceFile=path.resolve(__dirname,'../src/core/llm.cjs');
// Read the actual private projection without changing the frozen production module.
const project=vm.runInNewContext(fs.readFileSync(sourceFile,'utf8')+'\ninitialEvidence;',{require:createRequire(sourceFile),module:{exports:{}}});
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
const key=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function candidateEvidence(c){
 const {node_id,url,location,selector,...evidence}=c;
 return evidence;
}
function observationEvidence(o){
 if(!o)return null;
 const {node_id,url,location,...rest}=structuredClone(o);
 // Only explicit provenance fields are removed; raw offsets, styles and unknown evidence stay.
 if(rest.evidence){
  delete rest.evidence.selector;
  for(const run of rest.evidence.runs||[]){delete run.owner;for(const style of run.chain||[]){delete style.location;delete style.document_url;}}
 }
 return rest;
}
function profile(keys,batchSize=16){
 const groups=new Map();keys.forEach((k,i)=>{if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);});
 const batches=[];for(let i=0;i<keys.length;i+=batchSize)batches.push(key(keys.slice(i,i+batchSize)));
 const duplicateCandidates=keys.length-groups.size,originalCalls=batches.length,repackedCalls=Math.ceil(groups.size/batchSize);
 return {candidates:keys.length,unique:groups.size,duplicateCandidates,duplicateRate:duplicateCandidates/keys.length,
  originalCalls,repackedCalls,optimisticSavedCalls:originalCalls-repackedCalls,optimisticCallReduction:(originalCalls-repackedCalls)/originalCalls,
  unchangedBatchSavedCalls:batches.length-new Set(batches).size,
  groups:[...groups.values()].filter(g=>g.length>1)};
}
function audit(snapshot){
 const cs=snapshot.candidates;assert(Array.isArray(cs)&&cs.length);assert.equal(new Set(cs.map(c=>c.node_id)).size,cs.length);
 const sidecar=snapshot.technique_observations,byId=new Map((sidecar||[]).map(o=>[o.node_id,o]));
 if(sidecar)assert.equal(byId.size,cs.length,'Observation coverage mismatch');
 const raw=[],model=[],collected=[],safe=[];
 for(const c of cs){
  assert.equal(typeof c.raw_text,'string');assert(Array.isArray(c.ancestors)&&c.context_evidence&&c.own_style&&c.links&&c.frame_urls,'Missing required collected evidence');
  const {node_id,...input}=project(c);raw.push(key(c.raw_text));model.push(key(input));
  const evidence=candidateEvidence(c);collected.push(key(evidence));
  const observation=byId.get(c.node_id);if(sidecar){assert(observation);for(const f of ['node_id','url','location','raw_text'])assert.equal(observation[f],c[f]);}
  safe.push(key({candidate:evidence,observation:observationEvidence(observation)}));
 }
 const profiles={rawText:profile(raw),modelInput:profile(model),collectedEvidence:profile(collected),withObservation:profile(safe)};
 const groups=profiles.withObservation.groups;
 return {pages:snapshot.pages?.length||0,hasObservations:!!sidecar,profiles,
  passesEfficiencyGate:profiles.withObservation.duplicateRate>=.05&&profiles.withObservation.optimisticCallReduction>=.05,
  examples:groups.slice(0,5).map(g=>({count:g.length,raw_text:cs[g[0]].raw_text,locations:g.slice(0,4).map(i=>({node_id:cs[i].node_id,url:cs[i].url,location:cs[i].location}))}))};
}
module.exports={audit,key,profile,candidateEvidence,observationEvidence};
if(require.main===module){
 const [manifestFile,out]=process.argv.slice(2);if(!manifestFile||!out||fs.existsSync(out))throw Error('Usage: reuse-audit.cjs MANIFEST NEW_OUTPUT_JSON');
 const manifest=JSON.parse(fs.readFileSync(manifestFile));
 const verify=()=>{for(const[f,h]of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),h,'Frozen file changed: '+f);};verify();
 const results=manifest.inputs.map(file=>({file,...audit(JSON.parse(fs.readFileSync(file)))}));verify();
 fs.writeFileSync(out,JSON.stringify({generated:new Date().toISOString(),sourceManifest:manifestFile,results},null,2));
 for(const r of results)console.log(JSON.stringify({file:r.file,pages:r.pages,passesEfficiencyGate:r.passesEfficiencyGate,profiles:Object.fromEntries(Object.entries(r.profiles).map(([k,{groups,...v}])=>[k,v]))}));
}
