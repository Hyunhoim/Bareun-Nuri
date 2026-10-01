// Post-run paired analysis. Repeated calls are not independent evaluation cases.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]),read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),m=read('manifest.json');
assert.equal(read('completion.json').status,'completed');
const labels=m.groups.flatMap(g=>JSON.parse(fs.readFileSync(g.labels))),names=m.sequence.map(c=>c.name),ds={};
for(const n of names)ds[n]=new Map(m.groups.flatMap(g=>read(n+'-'+g.name+'-decisions.json')).map(d=>[d.node_id,d]));
const known=labels.filter(l=>l.is_ad!==null),positive=d=>d.raw_ad_verdict==='violation';
function metric(ls,n){let tp=0,fp=0,fn=0;for(const l of ls){const p=positive(ds[n].get(l.node_id));if(l.is_ad)p?tp++:fn++;else fp+=p;}return{tp,fp,fn,f1:2*tp/(2*tp+fp+fn),recall:tp/(tp+fn),precision:tp/(tp+fp)};}
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length,group=c=>names.filter(n=>n[0]===c),means={};
for(const c of ['A','B']){const ns=group(c),rows=ns.map(n=>metric(known,n)),timing=ns.map(n=>read(n+'-summary.json'));means[c]=Object.fromEntries(['tp','fp','fn','f1','recall','precision'].map(k=>[k,avg(rows.map(r=>r[k]))]));for(const k of ['wall_sec','queue_sec','service_sec','tokens'])means[c][k]=avg(timing.map(r=>r[k]));}
const pairs=[];for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const a=names[i],b=names[j];pairs.push({a,b,same_cap:a[0]===b[0],binary_changes:known.filter(l=>positive(ds[a].get(l.node_id))!==positive(ds[b].get(l.node_id))).length,category_changes:labels.filter(l=>ds[a].get(l.node_id).publication_act!==ds[b].get(l.node_id).publication_act).length});}
let seed=42512;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const boots=[];
for(let i=0;i<10000;i++){const sample=Array.from({length:known.length},()=>known[Math.floor(rnd()*known.length)]);boots.push(avg(group('B').map(n=>metric(sample,n).f1))-avg(group('A').map(n=>metric(sample,n).f1)));}boots.sort((a,b)=>a-b);
const variable=labels.filter(l=>new Set(names.map(n=>ds[n].get(l.node_id).publication_act)).size>1).map(l=>({node_id:l.node_id,is_ad:l.is_ad,scenario:l.scenario,predictions:Object.fromEntries(names.map(n=>[n,ds[n].get(l.node_id).publication_act]))}));
const advance=means.B.f1>=means.A.f1-.01&&means.B.recall>=means.A.recall-.01&&means.B.fp<=means.A.fp+1&&means.B.wall_sec<=means.A.wall_sec*.75;
const result={means,per_repeat:Object.fromEntries(names.map(n=>[n,metric(known,n)])),variable,pairs,f1_difference:means.B.f1-means.A.f1,case_cluster_bootstrap_95:[boots[250],boots[9750]],bootstrap_scope:'Resample known cases with all repeat decisions together; reused diagnostic set, not external-generalization confidence.',advance_if_request_audit_passes:advance,api_calls:0};
fs.writeFileSync(path.join(root,'repeat-summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
