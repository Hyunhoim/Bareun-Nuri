// Offline reachability scoring only. Reaching a gold location is not detecting an advertisement.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {replay}=require('./priority.cjs'),{canonical}=require('../src/core/collect.cjs');
const read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function score(dir,labelFile){
  const graph=read(path.join(dir,'graph.json')),manifest=read(path.join(dir,'manifest.json')),capture=read(path.join(dir,'capture.json'));
  assert.equal(capture.status,'completed');assert.equal(hash(path.join(dir,'graph.json')),capture.graph_sha256);
  for(const [p,h] of Object.entries(manifest))assert.equal(hash(p),h,'Frozen source changed: '+p);
  assert.equal(hash(labelFile),manifest[labelFile],'Labels must be sealed');
  const fifo=replay(graph,'fifo'),priority=replay(graph,'priority');
  assert.deepEqual(fifo.map(p=>p.url),graph.pages.map(p=>canonical(p.url)),'Recorded FIFO differs from production snapshot order');
  assert.deepEqual(fifo.map(p=>p.url).sort(),priority.map(p=>p.url).sort(),'Page set changed');
  const source=read(Object.keys(manifest).find(p=>p.endsWith('collected-panel-v2.json')));
  const labels=read(labelFile).splits.advanced.cases;
  for(const l of labels){
    const matches=source.candidates.filter(c=>canonical(c.url)===canonical(new URL(l.page,graph.entry_url).href)&&c.selector===l.selector&&
      JSON.stringify(c.frame_urls)===JSON.stringify(l.frames.map(f=>new URL(f,graph.entry_url).href)));
    assert.equal(matches.length,1,'Gold location must resolve exactly once');
  }
  const ads=labels.filter(l=>l.is_ad),normal=labels.filter(l=>!l.is_ad);
  const pages=new Map(graph.pages.map(p=>[canonical(p.url),p]));
  const strata=Object.fromEntries([
    ...['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'].map(t=>['technique:'+t,ads.filter(l=>l.techniques.includes(t))]),
    ...[...new Set(ads.map(l=>l.surface))].map(s=>['surface:'+s,ads.filter(l=>l.surface===s)])]);
  function metrics(order){
    const ranks=new Map(order.map((p,i)=>[p.url,i+1]));
    const rank=l=>ranks.get(canonical(new URL(l.page,graph.entry_url).href))??Infinity;
    const curve=order.map((p,i)=>({pages:i+1,ad_reached:ads.filter(l=>rank(l)<=i+1).length}));
    return {first_ad_page:Math.min(...ads.map(rank)),total_pages:order.length,
      candidates:order.reduce((n,p)=>n+pages.get(p.url).candidates,0),
      points:[10,25,50,order.length].map(n=>({pages:n,ads:ads.filter(l=>rank(l)<=n).length,ad_reach:ads.filter(l=>rank(l)<=n).length/ads.length,
        normal_labels:normal.filter(l=>rank(l)<=n).length,unvisited_pages:order.length-n,
        candidates:order.slice(0,n).reduce((v,p)=>v+pages.get(p.url).candidates,0),
        strata:Object.fromEntries(Object.entries(strata).map(([k,ls])=>[k,{reached:ls.filter(l=>rank(l)<=n).length,total:ls.length,
          reach:ls.length?ls.filter(l=>rank(l)<=n).length/ls.length:null}]))})),curve,order};
  }
  const a=metrics(fifo),b=metrics(priority);
  const gaps=a.points.slice(0,3).map((p,i)=>({pages:p.pages,ad_reach_delta:b.points[i].ad_reach-p.ad_reach,
    strata_delta:Object.fromEntries(Object.entries(p.strata).filter(([,s])=>s.total).map(([k,s])=>[k,b.points[i].strata[k].reach-s.reach]))}));
  const effectPassed=gaps.filter(g=>g.ad_reach_delta>=0.05-1e-10).length>=2&&gaps.every(g=>g.ad_reach_delta>=-1e-10&&Object.values(g.strata_delta).every(v=>v>=-0.05-1e-10));
  const out={status:'completed',kind:'offline_gold_location_reach_not_detection',ad_labels:ads.length,normal_labels:normal.length,
    fifo:a,priority:b,gaps,effect_gate_passed:effectPassed,representative_holdout_available:false,live_gate_passed:false,adopt:false,
    llm_calls:0,tokens:0,precision:null,f1:null,time_budget_detection:null,
    limitations:['Existing same-author synthetic diagnostic data','Page count is not elapsed time or LLM budget',
      'Production collects all pages before judging; no early detection implemented','Stages 2 and 3 unresolved; batch order effects unmeasured']};
  fs.writeFileSync(path.join(dir,'comparison.json'),JSON.stringify(out,null,2),{flag:'wx'});
  console.log(JSON.stringify({ad_labels:ads.length,normal_labels:normal.length,points:a.points.map((p,i)=>({pages:p.pages,
    fifo_ads:p.ads,priority_ads:b.points[i].ads,fifo_candidates:p.candidates,priority_candidates:b.points[i].candidates})),gaps,
    effect_gate_passed:effectPassed,live_gate_passed:false,adopt:false},null,2));
  return out;
}
if(require.main===module){const [dir,labels]=process.argv.slice(2);if(!dir||!labels)throw Error('Usage: node priority-score.cjs RUN_DIR SEALED_LABELS');score(dir,labels);}
module.exports={score};
