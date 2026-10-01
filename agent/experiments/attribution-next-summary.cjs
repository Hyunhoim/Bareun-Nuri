const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=f=>JSON.parse(fs.readFileSync(f)),positive=d=>d.is_violation&&!d.needs_review;
function summarize(root){
 const results=read(path.join(root,'results.json')),manifest=read(path.join(root,'manifest.json'));
 assert.equal(read(path.join(root,'completion.json')).status,'completed');
 const groups=['dev','eval','replica'],modes=manifest.modes,out={groups:{},overall:{},paired:{},flips:{}};
 for(const g of groups){out.groups[g]={};const labels=read(path.join(root,g+'-labels.json'));
  for(const m of modes){const rs=[0,1].map(r=>results[`${g}-${m}-r${r}`]);assert(rs.every(r=>r&&!r.failed));
   out.groups[g][m]=Object.fromEntries(['tp','fp','fn','f1','precision','recall','tokens','calls','service_sec','normal_review','explicit_uncertain','unknown_predicted_ad'].map(k=>[k,rs.reduce((n,r)=>n+(r[k]||0),0)/2]));
   const ds=[0,1].map(r=>read(path.join(root,`${g}-${m}-r${r}-decisions.json`))),by=new Map(ds[0].map(d=>[d.node_id,d]));
   out.flips[g+'-'+m]={act:ds[1].filter(d=>d.publication_act!==by.get(d.node_id).publication_act).length,binary:ds[1].filter(d=>positive(d)!==positive(by.get(d.node_id))).length};
  }
  for(const m of modes.filter(m=>m!=='A'))for(let r=0;r<2;r++){
   const a=new Map(read(path.join(root,`${g}-A-r${r}-decisions.json`)).map(d=>[d.node_id,d])),b=new Map(read(path.join(root,`${g}-${m}-r${r}-decisions.json`)).map(d=>[d.node_id,d]));
   const ids=(label,p,q)=>labels.filter(l=>l.is_ad===label&&positive(a.get(l.node_id))===p&&positive(b.get(l.node_id))===q).map(l=>l.node_id);
   out.paired[`${g}-${m}-r${r}`]={recovered:ids(true,false,true),lost:ids(true,true,false),new_fp:ids(false,false,true),removed_fp:ids(false,true,false)};
  }
 }
 for(const m of modes){const x={tp:0,fp:0,fn:0,tokens:0,calls:0,service_sec:0,normal_review:0,explicit_uncertain:0,unknown_predicted_ad:0};
  for(const g of groups)for(const k of Object.keys(x))x[k]+=2*out.groups[g][m][k];
  x.f1=2*x.tp/(2*x.tp+x.fp+x.fn);x.precision=x.tp/(x.tp+x.fp)||0;x.recall=x.tp/(x.tp+x.fn)||0;out.overall[m]=x;
 }
 out.gates={};for(const m of modes.filter(m=>m!=='A')){const a=out.overall.A,b=out.overall[m];out.gates[m]={eval_improves:out.groups.eval[m].f1>out.groups.eval.A.f1,pooled_noninferior:b.f1>=a.f1,net_benefit:(b.tp>a.tp&&b.tp-a.tp>Math.max(0,b.fp-a.fp))||(b.tp>=a.tp&&b.fp<a.fp),batch2_effect:m!=='H'||out.groups.eval[m].f1-out.groups.eval.A.f1>=0.08};}
 out.promising=Object.keys(out.gates).filter(m=>Object.values(out.gates[m]).every(Boolean)).sort((a,b)=>out.groups.eval[b].f1-out.groups.eval[a].f1||out.overall[b].f1-out.overall[a].f1||out.overall[a].tokens-out.overall[b].tokens);
 fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(out,null,2));return out;
}
module.exports={summarize};if(require.main===module)console.log(JSON.stringify(summarize(path.resolve(process.argv[2]||'.runtime/attribution-next-v1')),null,2));
