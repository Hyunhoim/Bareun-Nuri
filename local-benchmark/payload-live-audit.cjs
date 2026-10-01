const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir='.runtime/payload-live-v1',read=f=>JSON.parse(fs.readFileSync(dir+'/'+f)),done=read('completion.json'),evaluation=read('evaluation.json'),bodies=read('bodies.json');
assert.equal(done.fatal,null);assert.equal(done.callCount,96);let peak=0;
for(const round of done.rounds){assert.equal(round.rows.length,24);const events=[];
 for(const row of round.rows){const body=structuredClone(row.body);assert.equal(body.maxCompletionTokens,round.name.startsWith('A')?512:384);body.maxCompletionTokens=512;assert.deepEqual(body,bodies[row.index]);assert.equal(crypto.createHash('sha256').update(JSON.stringify(row.body)).digest('hex'),row.body_sha256);assert(['committed','quarantine'].includes(row.state));events.push([row.sent_at,1],[row.responded_at,-1]);}
 let active=0;for(const[t,d]of events.sort((a,b)=>a[0]-b[0]||a[1]-b[1])){active+=d;peak=Math.max(peak,active);assert(active<=3);}
 const sent=round.rows.map(r=>r.reserved_at).sort((a,b)=>a-b);for(let i=1;i<sent.length;i++)assert(sent[i]-sent[i-1]>=1000);
}
const by=Object.fromEntries(evaluation.results.map(r=>[r.name,r])),times=Object.fromEntries(done.rounds.map(r=>[r.name,r.wall_sec]));
const labels=Object.fromEntries(evaluation.labels.map(r=>[r.name,r.labels]));
const source=read('plan.json').source;
const {materialize}=require('../agent/src/core/bounded-scan-store.cjs');
const data=materialize(source+'/scan',JSON.parse(fs.readFileSync(source+'/scan/checkpoint.json')).state);
const gold=new Map(fs.readFileSync(source+'/gold-frozen.jsonl','utf8').trim().split('\n').map(JSON.parse).map(g=>[g.page_path+'|'+g.id,g]));
const known=new Map(data.work.map(c=>[c.node_id,gold.get(new URL(c.url).pathname+'|'+(c.location.match(/#n([a-f0-9]{14})(?![a-f0-9])/)?.[1]||''))]));
const pairs=[['A1','B1'],['A2','B2']].map(([a,b])=>{const ids=[...new Set([...Object.keys(labels[a]),...Object.keys(labels[b])])];return {names:[a,b],baseline_seconds:times[a],candidate_seconds:times[b],speed_gain_percent:100*(times[a]-times[b])/times[a],
 changed_ids:ids.filter(id=>labels[a][id]!==labels[b][id]),lost_tp:ids.filter(id=>known.get(id)?.is_violation&&labels[a][id]==='이용권유'&&labels[b][id]!=='이용권유'),new_fp:ids.filter(id=>known.has(id)&&known.get(id)&&!known.get(id).is_violation&&labels[a][id]!=='이용권유'&&labels[b][id]==='이용권유'),baseline:by[a],candidate:by[b]};});
const meanA=(times.A1+times.A2)/2,meanB=(times.B1+times.B2)/2;
const result={api:96,tokens:done.totalTokens,peak,mean_seconds:{output512:meanA,output384:meanB},speed_gain_percent:100*(meanA-meanB)/meanA,pairs,scope:evaluation.scope,minimum_actual_send_gap_ms:Math.min(...done.rounds.flatMap(r=>{const s=r.rows.map(x=>x.sent_at).sort((a,b)=>a-b);return s.slice(1).map((x,i)=>x-s[i]);})),full_body_preserved_except_output_cap:true};
fs.writeFileSync(dir+'/audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));

