// Recover aggregation from saved predictions; no training or inference rerun.
const fs=require('node:fs'),assert=require('node:assert/strict');
const root='.runtime/klue-audit-learning-v1/run-cpu',read=p=>JSON.parse(fs.readFileSync(p)),save=(n,v)=>fs.writeFileSync(root+'/'+n+'.json',JSON.stringify(v,null,2));
const gold=read('test-set-contest-v1/data/private/gold.json'),rows=read(root+'/regression-predictions.json'),prior=read('.runtime/klue-contest-v1/candidate-predictions.json');
assert.equal(rows.length,2000);assert.equal(new Set(rows.map(r=>r.id)).size,2000);
const now=new Map(rows.map(r=>[r.id,r.prediction])),old=new Map(prior.map(r=>[r.id,r.prediction]));
function metrics(gs,p){let tp=0,fp=0,fn=0,u=0;for(const g of gs){assert(p.has(g.id));const y=p.get(g.id);if(g.is_violation){if(y===0)tp++;else fn++;}else {if(y===0)fp++;if(y===3)u++;}}return {tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null,normal_uncertain:u};}
const baseline=read(root+'/baseline-development.json').metrics,selected=read(root+'/selection.json'),before=metrics(gold,old),after=metrics(gold,now),changes={lost_tp:[],gained_tp:[],fixed_fp:[],new_fp:[]};
for(const g of gold){const x=old.get(g.id)===0,y=now.get(g.id)===0;if(x===y)continue;changes[g.is_violation?(x?'lost_tp':'gained_tp'):(x?'fixed_fp':'new_fp')].push(g.id);}
const result={development_before:baseline,development_after:selected.metrics,selected_epoch:selected.epoch,regression_before:before,regression_after:after,regression_seconds:null,regression_timing_note:'Prediction persisted before aggregation failed on missing .json suffix; duration was not persisted. No rerun.',changes:Object.fromEntries(Object.entries(changes).map(([k,v])=>[k,v.length])),by_technique:{},by_family:{},production_adoption:false};
for(const [key,name]of [['technique','by_technique'],['scenario_family','by_family']])for(const value of new Set(gold.map(g=>g[key])))result[name][value]=metrics(gold.filter(g=>g[key]===value),now);
result.promising=selected.metrics.ad_f1>=baseline.ad_f1&&after.f1>=before.f1&&after.tp>=before.tp&&after.fp<=before.fp;
save('changes',changes);save('result',result);save('completed',{complete:true,aggregation_recovered:true,extra_inference:0});console.log(JSON.stringify(result));
