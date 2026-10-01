const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {canonical}=require('../src/core/collect.cjs');
const {local}=require('./navigation-live.cjs');
const read=p=>JSON.parse(fs.readFileSync(p));
function metrics(tp,fp,fn){return {tp,fp,fn,precision:tp+fp?tp/(tp+fp):0,recall:tp+fn?tp/(tp+fn):0,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):0};}
function score(root,id,mode){
 const dir=path.join(root,id+'-'+mode),run=read(path.join(dir,'run.json'));assert.equal(run.status,'completed','Incomplete run cannot be ranked');
 const evidence=read(path.join(dir,'evidence.json')),decisions=read(path.join(dir,'decisions.json')),order=read(path.join(dir,'order.json'));
 assert.equal(decisions.length,evidence.candidates.length);const ds=new Map(decisions.map(d=>[d.node_id,d])),ids=new Set();
 const site=read('test-set-v4/private/catalog.json').find(s=>s.id===id),labels=read('test-set-v4/private/labels.json')[id].cases;
 const rows=labels.map(l=>{
  const url=canonical(local(site,l.page)),cs=evidence.candidates.filter(c=>canonical(c.url)===url&&c.selector===l.selector);assert(cs.length<=1);
  const c=cs[0],d=c&&ds.get(c.node_id);if(c)ids.add(c.node_id);
  return {...l,page:url,collected:!!c,visited:order.visits.some(v=>v.url===url),predicted:!!d?.is_violation&&!d.needs_review,decision:d,node_id:c?.node_id};
 });
 const extra=evidence.candidates.filter(c=>!ids.has(c.node_id)&&ds.get(c.node_id)?.is_violation&&!ds.get(c.node_id).needs_review).map(c=>({...c,decision:ds.get(c.node_id)}));
 const intentFor=rs=>metrics(rs.filter(r=>r.is_ad&&r.predicted).length,rs.filter(r=>!r.is_ad&&r.predicted).length,rs.filter(r=>r.is_ad&&!r.predicted).length);
 let tp=0,fp=0,fn=0;for(const r of rows){const expected=new Set(r.techniques),predicted=new Set(r.predicted?r.decision.techniques:[]);
  for(const t of predicted)if(expected.has(t))tp++;else fp++;for(const t of expected)if(!predicted.has(t))fn++;}
 const intent=intentFor(rows),result={site:id,split:site.split,mode,intent,final:metrics(tp,fp,fn),
  conservative_intent:metrics(intent.tp,intent.fp+extra.length,intent.fn),conservative_final:metrics(tp,fp+extra.reduce((n,c)=>n+c.decision.techniques.length,0),fn),
  visited_ads:rows.filter(r=>r.is_ad&&r.visited).length,collected_ads:rows.filter(r=>r.is_ad&&r.collected).length,
  deep:intentFor(rows.filter(r=>r.category==='deep_user')),deep_visited:rows.filter(r=>r.category==='deep_user'&&r.is_ad&&r.visited).length,
  strata:Object.fromEntries([...new Set(rows.map(r=>r.category))].map(k=>[k,intentFor(rows.filter(r=>r.category===k))])),
  missing_collected_on_visited:rows.filter(r=>r.visited&&!r.collected).length,unlabeled_positives:extra,
  calls:run.calls.length,tokens:run.calls.every(c=>Number.isFinite(c.usage?.total_tokens))?run.calls.reduce((n,c)=>n+c.usage.total_tokens,0):null,
  elapsed_sec:run.elapsed_sec,review:decisions.filter(d=>d.needs_review).length,rows};
 fs.writeFileSync(path.join(dir,'score.json'),JSON.stringify(result,null,2));return result;
}
function compare(root,baseline,variant){
 const pairs=['dev-101','confirmation-201'].map(id=>({a:score(root,id,baseline),b:score(root,id,variant)}));
 const aggregate=k=>Object.fromEntries(['intent','final','conservative_intent','conservative_final'].map(metric=>[metric,metrics(...['tp','fp','fn'].map(n=>pairs.reduce((s,p)=>s+p[k][metric][n],0)))]));
 const a=aggregate('a'),b=aggregate('b'),retention=p=>p.a.rows.filter(r=>r.is_ad&&r.predicted&&!p.b.rows.find(x=>x.page===r.page&&x.selector===r.selector)?.predicted);
 const lostFinal=p=>p.a.rows.flatMap(r=>r.is_ad&&r.predicted?r.techniques.filter(t=>r.decision.techniques.includes(t)).filter(t=>{const v=p.b.rows.find(x=>x.page===r.page&&x.selector===r.selector);return !v?.predicted||!v.decision.techniques.includes(t);}).map(t=>({page:r.page,selector:r.selector,technique:t})):[]);
 const sites=pairs.map(p=>({site:p.a.site,baseline:{...p.a,rows:undefined,unlabeled_positives:p.a.unlabeled_positives.length},variant:{...p.b,rows:undefined,unlabeled_positives:p.b.unlabeled_positives.length},lost_final:lostFinal(p),
  lost_positive_locations:retention(p).map(r=>({page:r.page,selector:r.selector,category:r.category,variant:p.b.rows.find(x=>x.page===r.page&&x.selector===r.selector)}))}));
 const tokens=pairs.reduce((s,p)=>s+p.b.tokens,0)/pairs.reduce((s,p)=>s+p.a.tokens,0),time=pairs.reduce((s,p)=>s+p.b.elapsed_sec,0)/pairs.reduce((s,p)=>s+p.a.elapsed_sec,0);
 const gates={nondecrease:pairs.every(p=>p.b.intent.f1>=p.a.intent.f1&&p.b.final.f1>=p.a.final.f1&&p.b.conservative_intent.f1>=p.a.conservative_intent.f1&&p.b.conservative_final.f1>=p.a.conservative_final.f1),
  gain:b.final.f1-a.final.f1>=.02&&b.conservative_final.f1-a.conservative_final.f1>=.02,
  precision:pairs.every(p=>p.b.intent.precision>=p.a.intent.precision-.02&&p.b.final.precision>=p.a.final.precision-.02&&p.b.conservative_intent.precision>=p.a.conservative_intent.precision-.02&&p.b.conservative_final.precision>=p.a.conservative_final.precision-.02),
  fp:pairs.every(p=>p.b.intent.fp<=p.a.intent.fp+1&&p.b.final.fp<=p.a.final.fp+1&&p.b.conservative_intent.fp<=p.a.conservative_intent.fp+1&&p.b.conservative_final.fp<=p.a.conservative_final.fp+1),
  retained:pairs.every(p=>retention(p).length===0&&lostFinal(p).length===0),tokens:pairs.every(p=>Number.isFinite(p.a.tokens)&&Number.isFinite(p.b.tokens))&&tokens<=1.15,time:time<=1.15};
 const result={baseline,variant,aggregate:{baseline:a,variant:b},ratios:{tokens,time},gates,pass:Object.values(gates).every(Boolean),sites};
 fs.writeFileSync(path.join(root,baseline+'-vs-'+variant+'.json'),JSON.stringify(result,null,2));return result;
}
if(require.main===module){const [root,a='fifo',b='bandit']=process.argv.slice(2);const r=compare(root,a,b);console.log(JSON.stringify({...r,sites:r.sites.map(s=>({...s,lost_positive_locations:s.lost_positive_locations.length}))},null,2));}
module.exports={metrics,score,compare};
