const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=f=>JSON.parse(fs.readFileSync(f));
function summarize(root){const results=read(path.join(root,'results.json')),groups=['dev','eval','replica'],out={groups:{},overall:{},paired:{},flips:{}};
 for(const g of groups){out.groups[g]={};for(const m of ['A','B','C','D']){const rs=[0,1].map(r=>results[`${g}-${m}-r${r}`]);assert(rs.every(r=>r&&!r.failed));out.groups[g][m]=Object.fromEntries(['tp','fp','fn','f1','precision','recall','tokens','service_sec','normal_review'].map(k=>[k,rs.reduce((n,r)=>n+(r[k]||0),0)/2]));
 const ds=[0,1].map(r=>read(path.join(root,`${g}-${m}-r${r}-decisions.json`))),by=new Map(ds[0].map(d=>[d.node_id,d]));out.flips[g+'-'+m]=ds[1].filter(d=>d.publication_act!==by.get(d.node_id).publication_act).length;}
 const labels=read(path.join(root,g+'-labels.json'));
 for(const m of ['B','C','D'])for(let r=0;r<2;r++){const a=new Map(read(path.join(root,`${g}-A-r${r}-decisions.json`)).map(d=>[d.node_id,d])),b=new Map(read(path.join(root,`${g}-${m}-r${r}-decisions.json`)).map(d=>[d.node_id,d])),yes=d=>d.is_violation&&!d.needs_review;
 out.paired[`${g}-${m}-r${r}`]={recovered:labels.filter(l=>l.is_ad===true&&!yes(a.get(l.node_id))&&yes(b.get(l.node_id))).map(l=>l.node_id),lost:labels.filter(l=>l.is_ad===true&&yes(a.get(l.node_id))&&!yes(b.get(l.node_id))).map(l=>l.node_id),new_fp:labels.filter(l=>l.is_ad===false&&!yes(a.get(l.node_id))&&yes(b.get(l.node_id))).map(l=>l.node_id)};}}
 for(const m of ['A','B','C','D']){const x={tp:0,fp:0,fn:0,tokens:0,service_sec:0};for(const g of groups)for(const k of Object.keys(x))x[k]+=out.groups[g][m][k];x.f1=2*x.tp/(2*x.tp+x.fp+x.fn);out.overall[m]=x;}
 const candidates=['C','D'].filter(m=>out.groups.eval[m].f1>out.groups.eval.A.f1&&out.overall[m].f1>=out.overall.A.f1&&out.overall[m].fp-out.overall.A.fp<out.overall[m].tp-out.overall.A.tp);
 out.promising=candidates.sort((a,b)=>out.groups.eval[b].f1-out.groups.eval[a].f1||out.overall[b].f1-out.overall[a].f1||out.overall[a].tokens-out.overall[b].tokens);fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(out,null,2));return out;}
module.exports={summarize};if(require.main===module)console.log(JSON.stringify(summarize(path.resolve(process.argv[2]||'.runtime/jamo-context-v1')),null,2));
