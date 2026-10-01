// API0 paired attribution: distinguish changed evidence from identical-body variability.
const fs=require('node:fs'),assert=require('node:assert/strict'),ROOT='.runtime/digit-complete-live-v1';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),loadTrace=dir=>fs.readFileSync(dir+'/trace.jsonl','utf8').trim().split(/\r?\n/).map(JSON.parse).filter(x=>x.event==='llm_request');
assert.equal(read(ROOT+'/completion.json').status,'completed');
const audit=read(ROOT+'/audit.json'),pairs=[];
for(const split of ['dev','evaluation'])for(const reverse of [false,true]){
 const controls=['D','F'].map(mode=>audit.conditions.find(c=>c.split===split&&c.reverse===reverse&&c.mode===mode));
 const [dr,fr]=controls.map(c=>read(ROOT+'/'+c.condition+'/decisions.json')),[dt,ft]=controls.map(c=>loadTrace(ROOT+'/'+c.condition));
 const gold=new Map(read('.runtime/digit-generalization-data-v1/'+split+'-gold.json').map(g=>[g.node_id,g])),groups={},changes=[];
 for(let i=0;i<dr.length;i++){
  const sameBody=JSON.stringify(dt[i].body)===JSON.stringify(ft[i].body),dc=JSON.parse(dt[i].body.messages[1].content).candidates,fc=JSON.parse(ft[i].body.messages[1].content).candidates;
  const fp=new Map(fr[i].decisions.map(d=>[d.node_id,d]));assert.deepEqual(dr[i].decisions.map(d=>d.node_id).sort(),[...fp.keys()].sort());
  for(const d of dr[i].decisions){const f=fp.get(d.node_id),g=gold.get(d.node_id),ownChanged=JSON.stringify(dc.find(x=>x.node_id===d.node_id))!==JSON.stringify(fc.find(x=>x.node_id===d.node_id));
   assert(!sameBody||!ownChanged);const key=sameBody?'identical_request':ownChanged?'own_candidates_changed':'companion_candidates_changed';
   const a=groups[key]??={n:0,classification_changes:0,restoration_changes:0,lost_tp:0,gained_tp:0,new_fp:0,resolved_fp:0,exact_lost:0,exact_gained:0,ambiguous_more_certified:0,ambiguous_less_certified:0};a.n++;
   const dcHit=d.classification==='substitution',fcHit=f.classification==='substitution',dExact=dcHit&&d.restored?.toUpperCase()===g.reading,fExact=fcHit&&f.restored?.toUpperCase()===g.reading;
   a.classification_changes+=d.classification!==f.classification;a.restoration_changes+=d.restored?.toUpperCase()!==f.restored?.toUpperCase();
   if(g.classification==='substitution'){a.lost_tp+=dcHit&&!fcHit;a.gained_tp+=!dcHit&&fcHit;a.exact_lost+=dExact&&!fExact;a.exact_gained+=!dExact&&fExact;}
   if(g.classification==='literal'){a.new_fp+=!dcHit&&fcHit;a.resolved_fp+=dcHit&&!fcHit;}
   if(g.classification==='uncertain'){a.ambiguous_more_certified+=d.classification==='uncertain'&&f.classification!=='uncertain';a.ambiguous_less_certified+=d.classification!=='uncertain'&&f.classification==='uncertain';}
   if(d.classification!==f.classification||d.restored?.toUpperCase()!==f.restored?.toUpperCase())changes.push({node_id:d.node_id,group:key,gold:g.classification,expected:g.reading,D:{classification:d.classification,reading:d.restored},F:{classification:f.classification,reading:f.restored}});
  }
 }
 pairs.push({split,reverse,groups,changes});
}
fs.writeFileSync(ROOT+'/paired-diagnostic.json',JSON.stringify(pairs,null,2),{flag:'wx'});console.log(JSON.stringify(pairs,null,2));
