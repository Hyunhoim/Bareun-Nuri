// API0 preparation. Running without --authorize-collect never opens holdout content.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'../..'),data=path.join(project,'.runtime/replica-intent-data-v1');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function prepareHoldout(selectionPath){
 const selectionFile=path.resolve(selectionPath),selection=read(selectionFile);
 assert.equal(selection.status,'frozen');assert(Number.isFinite(Date.parse(selection.frozen_at))&&Date.parse(selection.frozen_at)<=Date.now());
 assert(Array.isArray(selection.modes)&&selection.modes.length);assert([1,2].includes(selection.rounds));
 assert.equal(selection.dataset_manifest_sha256,sha(path.join(data,'manifest.json')));
 for(const file of ['agent/experiments/replica-intent-round2.cjs','agent/experiments/replica-intent-methods.cjs','agent/experiments/replica-intent-site.cjs'])assert(selection.hashes?.[file],'Selection must seal '+file);
 for(const [file,h]of Object.entries(selection.hashes))assert.equal(sha(path.resolve(project,file)),h,'Selected source drift '+file);
 const {verifyDataset,verifyEvidence}=require(path.join(project,'agent/experiments/replica-intent-run.cjs'));
 const seal=verifyDataset(data),generator=path.join(project,'agent/experiments/replica-intent-site.cjs');
 for(const suffix of ['evidence','labels','full-evidence','collection-checks'])assert(!fs.existsSync(path.join(data,'holdout-'+suffix+'.json')),'Never overwrite prior collection');
 const auth=path.join(data,'holdout-authorized.json');assert(!fs.existsSync(auth),'Authorization already exists; inspect prior attempt rather than retry silently');
 fs.writeFileSync(auth,JSON.stringify({authorized_at:new Date().toISOString(),selection_file:selectionFile,selection_sha256:sha(selectionFile),dataset_manifest_sha256:seal,purpose:'Explicit caller authorized offline holdout collection after candidate freeze; zero model calls'},null,2),{flag:'wx'});
 await require(generator).prepareEvidence(data,'holdout');
 assert.equal(verifyDataset(data),seal);for(const [file,h]of Object.entries(selection.hashes))assert.equal(sha(path.resolve(project,file)),h);
 const checksFile=path.join(data,'holdout-collection-checks.json'),checks=read(checksFile);
 Object.assign(checks,{dataset_manifest_sha256:seal,evidence_sha256:sha(path.join(data,'holdout-evidence.json')),labels_sha256:sha(path.join(data,'holdout-labels.json')),generator_sha256:sha(generator),full_evidence_sha256:sha(path.join(data,'holdout-full-evidence.json')),selection_sha256:sha(selectionFile),freshness_checked_at:new Date().toISOString()});
 fs.writeFileSync(checksFile,JSON.stringify(checks,null,2));verifyEvidence(data,'holdout');
 return {api_calls:0,targets:checks.targets,technique_matches:checks.technique_matches,dataset_manifest_sha256:seal,checks_sha256:sha(checksFile)};
}
module.exports={prepareHoldout};
if(require.main===module){if(process.argv[2]!=='--authorize-collect'||!process.argv[3])console.log('API0 only. Future authorized use: node .runtime/replica-legacy-regression-data/prepare-holdout.cjs --authorize-collect FROZEN_SELECTION.json');else prepareHoldout(process.argv[3]).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e);process.exitCode=1;});}
