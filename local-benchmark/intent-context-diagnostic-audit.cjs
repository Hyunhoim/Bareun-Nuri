const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {method}=require('./intent-context-diagnostic.cjs'),{estimate}=require('../agent/experiments/semantic-search-run.cjs');
const {parseEnvelope}=require('../agent/src/core/json-envelope.cjs');
const root='.runtime/intent-context-diagnostic-v1',read=f=>JSON.parse(fs.readFileSync(root+'/'+f+'.json')),plan=read('plan'),done=read('completion'),ev=read('evaluation'),input=read('inputs'),by=new Map(input.map(r=>[r.c.node_id,r]));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function metric(rows,ds){let tp=0,fp=0,fn=0;for(const r of rows){if(r.label===null)continue;const d=ds[r.c.node_id],p=d?.is_violation&&!d?.needs_review;tp+=r.label&&p?1:0;fp+=!r.label&&p?1:0;fn+=r.label&&!p?1:0;}return{tp,fp,fn,f1:2*tp/(2*tp+fp+fn)};}
function pool(names){const rows=names.map(n=>ev.all[n]);const sum=k=>rows.reduce((s,r)=>s+r[k],0),tp=sum('tp'),fp=sum('fp'),fn=sum('fn');return{tp,fp,fn,f1:2*tp/(2*tp+fp+fn),precision:tp/(tp+fp),recall:tp/(tp+fn),unjudged:sum('unjudged'),uncertainAd:sum('uncertainAd'),uncertainCorrect:sum('uncertainCorrect'),calls:sum('calls'),tokens:sum('tokens'),service_seconds:sum('service_seconds')};}
(async()=>{assert.equal(done.fatal,null);assert.equal(done.calls,220);let bodies=0,values=0,quarantines=0;for(const[f,h]of Object.entries(plan.pins))assert.equal(sha(fs.readFileSync(f)),h);
 for(const s of done.results){const traces=fs.readFileSync(root+'/'+s.name+'-trace.jsonl','utf8').trim().split('\n').map(JSON.parse),responses=new Map(traces.filter(t=>t.event==='llm_response').map(t=>[t.call_number,t.data]));
  for(const r of s.rows){const cs=r.ids.map(id=>by.get(id).c),expected=await estimate(cs,{provider:'hcx',temperature:0,seed:42,reasoningEffort:'none',maxTokens:512},method(s.mode));assert.deepEqual(r.body,expected.body);assert.equal(sha(JSON.stringify(r.body)),r.body_sha256);bodies++;
   const reply=responses.get(r.call_number);assert(reply);assert.equal(reply.choices[0].finish_reason,'stop');const json=parseEnvelope(reply.choices[0].message.content),got=Object.keys(json.decisions);assert(got.every(id=>r.ids.includes(id)));
   if(r.phase==='committed'){const parsed=method(s.mode).validateModelDecisions(Object.entries(json.decisions).map(([node_id,d])=>({...d,node_id})),cs);assert.deepEqual(parsed,r.decisions);values+=parsed.length;}else{assert.equal(r.phase,'quarantine');assert(got.length<r.ids.length);assert.deepEqual(r.quarantine.missing_ids,r.ids.filter(id=>!got.includes(id)));quarantines++;}
  }
 }
 const common={};for(const [name,row]of Object.entries(ev.all)){if(name==='A0')continue;const base=ev.all[name!=='A1'&&name.endsWith('1')?'A1':'A0'],rs=input.filter(r=>base.decisions[r.c.node_id]&&row.decisions[r.c.node_id]);common[name]={n:rs.length,baseline:metric(rs,base.decisions),candidate:metric(rs,row.decisions)};}
 const repeatChecks={};for(const [x,y]of [['A0','A2'],['S0','S1']]){const b=done.results.find(s=>s.name===x),s=done.results.find(s=>s.name===y),bm=new Map(b.rows.map(r=>[r.ids.join('|'),r.body]));for(const r of s.rows)assert.deepEqual(r.body,bm.get(r.ids.join('|')));repeatChecks[x+'_'+y]='identical request bodies';}
 const pooled=Object.fromEntries(['A','M','R','P','C','S'].map(m=>[m,pool([m+'0',m+'1'])]));
 const result={api:0,request_bodies_verified:bodies,decisions_verified:values,quarantines,pins_preserved:true,pooled,common,comparisons:Object.fromEntries(Object.entries(ev.comparisons).map(([k,v])=>[k,{lost:v.lost.length,gained:v.gained.length,newfp:v.newfp.length,changed:v.changed.length}]))};
 result.repeatChecks=repeatChecks;delete result.comparisons.A1; // Runner A1 self-comparison is not an order-effect estimate.
 result.repeatChanges={};for(const [x,y]of [['A0','A2'],['A0','A1'],['S0','S1']]){const rs=input.filter(r=>ev.all[x].decisions[r.c.node_id]&&ev.all[y].decisions[r.c.node_id]);result.repeatChanges[x+'_'+y]={common:rs.length,actChanged:rs.filter(r=>ev.all[x].decisions[r.c.node_id].publication_act!==ev.all[y].decisions[r.c.node_id].publication_act).length};}
 fs.writeFileSync(root+'/audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
