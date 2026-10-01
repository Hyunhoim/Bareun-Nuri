const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.cwd(),dir=path.resolve('.runtime/replica-legacy-regression-data'),base='.runtime/semantic-e2e-act4-v1',goldBase=base+'/source-archive/.runtime/semantic-e2e-extra-gold-v1';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),files=new Map();
const read=p=>{files.set(p,sha(p));return JSON.parse(fs.readFileSync(p));};
const cp=read(base+'/act4/checkpoint.json'),state=cp.state;
assert.equal(cp.sha256,crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex'));
const evidence=read(base+'/act4/evidence.json'),observations=read(base+'/act4/observations.json'),decisions=read(base+'/act4/semantic-decisions.json'),integrated=read(base+'/act4/integrated-decisions.json');
assert.deepEqual(evidence.candidates,state.candidates);assert.deepEqual(state.work,state.candidates);assert.deepEqual(observations,state.technique_observations);assert.deepEqual(decisions,state.decisions);
const primary=read(goldBase+'/primary-labels-unchanged.json'),extra=read(goldBase+'/extra-labels.json');assert.equal(primary.length,80);assert.equal(extra.length,535);
for(const n of ['primary-labels-unchanged.json','extra-labels.json'])assert.equal(sha(goldBase+'/'+n),sha('.runtime/semantic-e2e-extra-gold-v1/'+n));
const key=c=>JSON.stringify([new URL(c.url).pathname+new URL(c.url).search,c.selector,c.raw_text]);
const gold=new Map([...primary,...extra].map(g=>[g.key,g]));assert.equal(gold.size,615);
const ids=new Set(state.candidates.map(c=>c.node_id));assert.equal(ids.size,615);
const labels=state.candidates.map(c=>{const g=gold.get(key(c));assert(g);return {...g,gold_source_node_id:g.node_id,node_id:c.node_id};});
for(const list of [observations,decisions,integrated])assert.deepEqual(list.map(x=>x.node_id),state.candidates.map(c=>c.node_id));
for(let i=0;i<615;i++){assert.equal(observations[i].raw_text,state.candidates[i].raw_text);assert.equal(observations[i].location,state.candidates[i].location);assert.equal(observations[i].evidence.raw_text,state.candidates[i].raw_text);assert.equal(decisions[i].raw_ad_verdict,integrated[i].raw_ad_verdict);}
let tp=0,fp=0,fn=0,tn=0,ambiguous=0;for(let i=0;i<labels.length;i++){const truth=labels[i].is_ad,pred=decisions[i].raw_ad_verdict==='violation';if(truth===null){ambiguous++;continue;}assert.equal(typeof truth,'boolean');if(truth&&pred)tp++;else if(!truth&&pred)fp++;else if(truth&&!pred)fn++;else tn++;}
const score={tp,fp,fn,tn,ambiguous,positions:labels.length,known:tp+fp+fn+tn,precision:tp/(tp+fp),recall:tp/(tp+fn),f1:2*tp/(2*tp+fp+fn)};assert.deepEqual([tp,fp,fn,tn,ambiguous],[38,14,5,547,11]);
const audit=read(base+'/independent-audit.json');for(const k of ['tp','fp','fn','precision','recall','f1','known','positions'])assert.equal(score[k],audit.summary.act4.overall[k],k);
const tracePath=base+'/act4/trace.jsonl';files.set(tracePath,sha(tracePath));const requests=fs.readFileSync(tracePath,'utf8').trim().split(/\r?\n/).map(JSON.parse).filter(t=>t.event==='llm_request');
const batches=requests.map(t=>({call_number:t.call_number,node_ids:JSON.parse(t.body.messages.find(m=>m.role==='user').content).candidates.map(c=>c.node_id),request_body_sha256:crypto.createHash('sha256').update(JSON.stringify(t.body)).digest('hex')}));
assert.equal(batches.length,154);assert.deepEqual(batches.flatMap(b=>b.node_ids),state.work.map(c=>c.node_id));
const oldManifest=read(base+'/manifest.json');const archived={};for(const [original,h]of Object.entries(oldManifest.hashes)){const rel=path.relative(root,original),p=path.join(base,'source-archive',rel);assert.equal(sha(p),h,p);archived[p]=h;}
const write=(n,x)=>{const p=path.join(dir,n);assert(!fs.existsSync(p),'Never overwrite '+n);fs.writeFileSync(p,JSON.stringify(x,null,2));};
write('evidence.json',{candidates:state.candidates,technique_observations:observations});write('labels.json',labels);write('baseline-decisions.json',decisions);write('baseline-integrated-decisions.json',integrated);write('batches.json',batches);
const metadata={purpose:'Previously observed full-location regression diagnostic; not a new holdout.',baseline:'Adopted act4 semantic decisions from original FIFO end-to-end run',label_contract:'Original gold unchanged; node_id remapped by exact pathname/search + selector + raw text; original ID retained as gold_source_node_id. Null is excluded from binary F1.',original_entry:state.entry,order:'Original checkpoint candidate/work order; matches all 154 request batches',counts:{primary:80,extra:535,all:615,ads:43,normals:561,ambiguous:11,known:604,unique_raw_texts:new Set(labels.map(l=>l.raw_text)).size},score,source_sha256:Object.fromEntries(files),archived_source_sha256:archived,panel_sha256:Object.fromEntries(['evidence.json','labels.json','baseline-decisions.json','baseline-integrated-decisions.json','batches.json'].map(n=>[n,sha(path.join(dir,n))])),api_calls:0,browser_calls:0,holdout_read:false};
write('manifest.json',metadata);for(const [p,h]of files)assert.equal(sha(p),h);console.log(JSON.stringify({score,counts:metadata.counts,source_files:files.size,archived_sources:Object.keys(archived).length,batches:batches.length,manifest_sha256:sha(path.join(dir,'manifest.json'))},null,2));
