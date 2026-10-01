// Closed workload fixture only. Never used by the operating collector/frontier.
const fs=require('node:fs'),assert=require('node:assert/strict');
const file='.runtime/scale-profiles-v1.json';
const position=url=>{const u=new URL(url);u.searchParams.sort();return u.pathname+u.search;};
function load(name){const p=JSON.parse(fs.readFileSync(file)).profiles[name];assert(p,'Unknown scale');return p;}
function bound(snapshot,profile){
 const p=snapshot.pages[0];assert(profile.urls.some(u=>position(u)===position(p.url)),'Outside fixed workload');
 // Keep all DOM candidates and semantic link evidence. Only freeze the discovery inventory.
 p.navigation.links=profile.urls.filter(u=>position(u)!==position(p.url)).map(url=>({url,text:'',content_scope:false,group:'fixed-workload'}));
 return snapshot;
}
function build(){
 assert(!fs.existsSync(file),'Preserve frozen profile');
 const base='.runtime/jamo-context-live-c-v1',state=JSON.parse(fs.readFileSync(base+'/scan/checkpoint.json')).state;
 const {contract}=require('../src/core/judgment.cjs'),c=contract();
 const groups={small:[0,9,10,11],medium:[0,...Array.from({length:10},(_,i)=>9+i)],large:Array.from({length:20},(_,i)=>i)},profiles={};
 for(const [name,indices]of Object.entries(groups)){
  const snaps=indices.map(i=>JSON.parse(fs.readFileSync(base+'/snapshots/'+String(i+1).padStart(4,'0')+'.json')));
  const candidates=snaps.flatMap(s=>s.candidates),lengths=candidates.map(x=>JSON.stringify(c.initialEvidence(x)).length).sort((a,b)=>a-b);
  profiles[name]={name,indices,urls:indices.map(i=>state.pages[i].url),pages:indices.length,candidates:candidates.length,
   evidence_chars:{total:lengths.reduce((a,b)=>a+b,0),mean:lengths.reduce((a,b)=>a+b,0)/lengths.length,p50:lengths[Math.floor(lengths.length*.5)],p95:lengths[Math.floor(lengths.length*.95)],max:lengths.at(-1)},
   selection:'Stored page indices: first list plus first3/all10 detail pages; large includes all20 previously collected pages. No labels used. Fixed connected discovery inventory, original DOM and semantic evidence retained.'};
 }
 fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),profiles},null,2));console.log(JSON.stringify(profiles,null,2));
}
module.exports={load,bound,position};if(require.main===module)build();
