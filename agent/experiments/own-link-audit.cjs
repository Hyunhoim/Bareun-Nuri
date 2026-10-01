const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {contracts}=require('./own-link.cjs'),{estimate,reordered,measured}=require('./semantic-search-run.cjs');
const root=path.resolve('.runtime/own-link-v1/live'),read=f=>JSON.parse(fs.readFileSync(f)),load=f=>read(path.join(root,f+'.json'));
const positive=d=>d.is_violation&&!d.needs_review,clean=x=>JSON.parse(JSON.stringify(x));
async function main(){global.fetch=async()=>{throw Error('Audit network disabled');};const manifest=load('manifest'),completion=load('completion'),cs=contracts();assert.equal(completion.status,'completed');let calls=0,tokens=0,reserved=0,inputs=0;
 for(const [file,h]of Object.entries(manifest.hashes)){const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');assert.equal(hash(file),h);if(path.dirname(file)!==root)assert.equal(hash(path.join(root,'source-archive',path.basename(file))),h);}
 const summary={groups:{},paired:{},flips:{},usage:{},verified:false},decisions={};
 for(const name of ['dev','eval','replica']){const base={name,labels:load(name+'-labels'),snapshot:load(name+'-evidence')};summary.groups[name]={};
  for(const mode of ['A','L']){const totals={tp:0,fp:0,fn:0,tokens:0,calls:0,service_sec:0,normal_review:0,explicit_uncertain:0,unknown_predicted_ad:0};
   for(let round=0;round<2;round++){const group=reordered(base,round),key=name+'-'+mode+'-r'+round,trace=fs.readFileSync(path.join(root,key+'-trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse),requests=trace.filter(e=>e.event==='llm_request'),responses=trace.filter(e=>e.event==='llm_response'),records=load(key+'-calls'),ds=[];
    assert.equal(requests.length,Math.ceil(base.labels.length/4));assert.equal(responses.length,requests.length);assert.equal(records.length,requests.length);
    for(let i=0;i<requests.length;i++){const batch=group.snapshot.candidates.slice(i*4,i*4+4),expected=await estimate(batch,{provider:'hcx',temperature:0,seed:42,maxTokens:512,reasoningEffort:'none'},cs[mode]);assert.deepEqual(requests[i].body,expected.body);reserved+=expected.tokens;
     const response=responses.find(r=>r.call_number===requests[i].call_number),record=records[i];assert.equal(record.status,'ok');assert.equal(record.http_status,200);assert.equal(record.model_returned,'HCX-007');assert.equal(response.data.choices[0].finish_reason,'stop');assert.deepEqual(record.usage,response.data.usage);
     const input=JSON.parse(requests[i].body.messages.find(m=>m.role==='user').content);for(let j=0;j<batch.length;j++){const actual=input.candidates[j],a=clean(cs.A.initialEvidence(batch[j]));assert.deepEqual({...actual,links:a.links},a);assert(!JSON.stringify(actual).match(/"(?:is_ad|expected|own_link_result|split)"\s*:/));if(name==='replica')assert.deepEqual(actual,a);inputs++;}
     const parsed=JSON.parse(response.data.choices[0].message.content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/,'$1'));ds.push(...cs[mode].validateModelDecisions(Object.entries(parsed.decisions).map(([node_id,d])=>({...d,node_id})),batch));calls++;tokens+=record.usage.total_tokens;
    }
    assert.deepEqual(ds,load(key+'-decisions'));decisions[key]=new Map(ds.map(d=>[d.node_id,d]));const score=measured(group,ds,records),saved=load('results')[key];for(const k of Object.keys(totals)){assert.equal(score[k],saved[k]);totals[k]+=score[k];}
   }totals.f1=2*totals.tp/(2*totals.tp+totals.fp+totals.fn)||0;summary.groups[name][mode]=totals;
   const a=decisions[name+'-'+mode+'-r0'],b=decisions[name+'-'+mode+'-r1'];summary.flips[name+'-'+mode]=base.labels.filter(l=>positive(a.get(l.node_id))!==positive(b.get(l.node_id))).map(l=>l.node_id);
  }
  for(let round=0;round<2;round++){const A=decisions[name+'-A-r'+round],L=decisions[name+'-L-r'+round],ids=(gold,a,b)=>base.labels.filter(l=>l.is_ad===gold&&positive(A.get(l.node_id))===a&&positive(L.get(l.node_id))===b).map(l=>l.node_id);summary.paired[name+'-r'+round]={recovered:ids(true,false,true),lost:ids(true,true,false),new_fp:ids(false,false,true),removed_fp:ids(false,true,false)};}
 }
 summary.newCombined={};for(const mode of ['A','L']){const ds=['dev','eval'].map(g=>summary.groups[g][mode]),o={};for(const k of ['tp','fp','fn'])o[k]=ds.reduce((n,d)=>n+d[k],0);o.f1=2*o.tp/(2*o.tp+o.fp+o.fn);summary.newCombined[mode]=o;}
 const A=summary.newCombined.A,L=summary.newCombined.L;summary.gates={eval_improves:summary.groups.eval.L.f1>summary.groups.eval.A.f1,new_combined_noninferior:L.f1>=A.f1,net_benefit:L.tp-A.tp-L.fp+A.fp>0};summary.promising=Object.values(summary.gates).every(Boolean);
 assert.equal(calls,completion.attempts);assert.equal(reserved,completion.reserved);summary.usage={calls,tokens,reserved,inputs};summary.verified=true;fs.writeFileSync(path.join(root,'audit-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
