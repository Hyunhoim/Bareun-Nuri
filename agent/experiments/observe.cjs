// Offline opt-in integration. Never reads an API key, changes intent, or imports failed rescue modes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {observeTechniques,integrateObservations}=require('../src/core/techniques.cjs');
const {outputResult}=require('../src/core/output.cjs');
const [evidenceFile,decisionsFile,destination]=process.argv.slice(2);
if(!evidenceFile||!decisionsFile||!destination)throw Error('Usage: node agent/experiments/observe.cjs EVIDENCE_JSON DECISIONS_JSON NEW_OUTPUT_DIR');
if(fs.existsSync(destination))throw Error('Output directory already exists');
const start=performance.now(),snapshot=JSON.parse(fs.readFileSync(evidenceFile)),baseline=JSON.parse(fs.readFileSync(decisionsFile));
const observations=snapshot.technique_observations||snapshot.candidates.map(c=>observeTechniques(c));
const combined=integrateObservations(snapshot,baseline,observations);
const output=outputResult(snapshot,combined.decisions,new Date().toISOString(),(performance.now()-start)/1000,'frozen-intent');
output.result.meta.tool_version+='/experimental-code-observation';
fs.mkdirSync(destination,{recursive:true});
const save=(name,data)=>fs.writeFileSync(path.join(destination,name+'.json'),JSON.stringify(data,null,2));
for(const [name,value]of Object.entries({evidence:snapshot,observations,decisions:combined.decisions,result:output.result,diagnostics:output.diagnostics,'technique-diagnostics':combined.technique_diagnostics}))save(name,value);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
save('run',{status:'completed',mode:'frozen-intent-observation',actualCalls:false,calls:[],totalTokens:0,elapsedSec:(performance.now()-start)/1000,
 sourceHashes:{evidence:hash(evidenceFile),decisions:hash(decisionsFile),observer:hash(path.join(__dirname,'../src/core/techniques.cjs'))},
 legacyEvidence:!snapshot.technique_observations,intentPreserved:combined.decisions.every((d,i)=>{
 const {techniques,observed_techniques,...a}=d,{techniques:old,observed_techniques:previous,...b}=baseline[i];return JSON.stringify(a)===JSON.stringify(b);})});
console.log(JSON.stringify({candidates:baseline.length,findings:output.result.findings.length,techniqueReviews:combined.technique_diagnostics.length,additionalCalls:0}));
