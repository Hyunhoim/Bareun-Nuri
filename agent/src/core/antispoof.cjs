const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const root=path.resolve(__dirname,'../../..'),assets=path.join(root,'agent/models/kcelectra-antispoof-v1');
const script=path.join(root,'agent/antispoof/infer.py');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function identity(){
 const manifest=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json'),'utf8'));
 assert.equal(manifest.name,'KcElectra-AntiSpoof');assert.equal(manifest.version,'1.0');assert.equal(manifest.threshold_h,.2);
 for(const [name,hash] of Object.entries(manifest.files)){assert.equal(path.basename(name),name);assert.equal(sha(path.join(assets,name)),hash,'AntiSpoof asset mismatch: '+name);}
 return {name:manifest.name,version:manifest.version,manifest:sha(path.join(assets,'manifest.json')),service:sha(script),device:'cpu'};
}
function queries(c){
 const raw=c.raw_text,ranges=[];
 for(const m of raw.matchAll(/[\u1100-\u11ff\u3130-\u318f\uffa0-\uffdc]+(?:[\s\u200b\u200c\u200d]+[\u1100-\u11ff\u3130-\u318f\uffa0-\uffdc]+)*/gu))ranges.push({start:m.index,end:m.index+m[0].length});
 for(const m of raw.matchAll(/[\p{L}\p{N}\p{M}]+/gu))if(/[^가-힣]/u.test(m[0])&&!ranges.some(r=>r.start<=m.index&&r.end>=m.index+m[0].length))ranges.push({start:m.index,end:m.index+m[0].length});
 return ranges.sort((a,b)=>a.start-b.start).map((r,i)=>({...r,id:c.node_id+':'+i,token:raw.slice(r.start,r.end),
  collection_truncated:!!c.context_evidence?.truncated||!!c.source_node_id,
  input:{target:raw.slice(0,r.start)+'[표기]'+raw.slice(r.start,r.end)+'[/표기]'+raw.slice(r.end),
   context:[c.page_title||'',...(c.context_evidence?.units||[]).filter(u=>u.relation!=='target'&&typeof u.text==='string').map(u=>u.relation+': '+u.text)].join('\n')}}));
}
function createAntiSpoof({python,signal,deadlineAt,timeoutMs=120000}={}){
 let child,pending,serial=0,failed=false;
 function stop(error){failed=true;if(pending){const p=pending;pending=null;clearTimeout(p.timer);p.reject(error);}child?.kill();}
 const abort=()=>stop(Error('antispoof_cancelled'));signal?.addEventListener('abort',abort,{once:true});
 function request(rows){return new Promise((resolve,reject)=>{
  if(failed||signal?.aborted)return reject(Error('antispoof_unavailable'));
  assert(!pending,'Sequential AntiSpoof requests required');
  if(!child){
   const executable=python||path.join(root,'.runtime/klue-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
   child=spawn(executable,['-X','utf8',script,assets],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,HF_HUB_OFFLINE:'1',TOKENIZERS_PARALLELISM:'false'}});
   child.on('error',()=>stop(Error('antispoof_start_failed')));child.on('exit',()=>stop(Error('antispoof_process_exited')));child.stdin.on('error',()=>stop(Error('antispoof_pipe_failed')));child.stderr.on('data',()=>{});
   createInterface({input:child.stdout}).on('line',line=>{try{const data=JSON.parse(line);assert(pending&&data.id===pending.id);const p=pending;pending=null;clearTimeout(p.timer);p.resolve(data.rows);}catch{stop(Error('antispoof_invalid_response'));}});
  }
  const ms=Math.min(timeoutMs,deadlineAt?Math.max(0,deadlineAt-Date.now()):timeoutMs);
  pending={id:++serial,resolve,reject,timer:setTimeout(()=>stop(Error('antispoof_timeout')),ms)};
  child.stdin.write(JSON.stringify({id:serial,rows})+'\n');
 });}
 async function annotate(candidates,decisions){
  const by=new Map(candidates.map(c=>[c.node_id,c]));
  for(const d of decisions){
   if(!d.is_violation||d.needs_review)continue;
   const c=by.get(d.node_id),rows=queries(c);d.antispoof={model:'KcElectra-AntiSpoof',version:'1.0',observations:[],unresolved:[],predictions:[]};
   const a=d.antispoof;if(!rows.length)continue;
   try{const result=await request(rows);assert(Array.isArray(result)&&result.length===rows.length);
    for(let i=0;i<rows.length;i++){const r=rows[i],p=result[i];assert.equal(p.id,r.id);assert(Array.isArray(p.labels)&&p.labels.length===2&&p.labels.every(n=>[0,1,2].includes(n)));
     a.predictions.push({...r,input:undefined,...p});
     for(const [j,technique] of ['JAMO','HOMOGLYPH'].entries()){
      if(p.labels[j]===0&&!p.protected){let o=a.observations.find(x=>x.technique===technique);if(!o){o={technique,coverage:'text-span',evidence:[]};a.observations.push(o);}o.evidence.push({technique,reason:'KcElectra-AntiSpoof-v1.0',start:r.start,end:r.end,text:r.token});}
      if(p.labels[j]===2||p.protected)a.unresolved.push({technique,reason:p.protected||'antispoof_uncertain',start:r.start,end:r.end,text:r.token});
     }
    }
   }catch(e){a.observations=[];a.unresolved=[{technique:null,reason:e.message}];}
  }
  return decisions;
 }
 return {annotate,request,close(){signal?.removeEventListener('abort',abort);stop(Error('antispoof_closed'));}};
}
function mergeObservation(observation,decision){
 const a=decision?.antispoof;if(!a||!decision.is_violation)return observation;
 const out=structuredClone(observation);
 for(const extra of a.observations){const old=out.observations.find(o=>o.technique===extra.technique);if(old)old.evidence.push(...extra.evidence);else out.observations.push(structuredClone(extra));}
 out.unresolved=out.unresolved.filter(u=>!a.observations.some(o=>o.technique===u.technique&&o.evidence.some(e=>e.start===u.start&&e.end===u.end)));
 out.unresolved.push(...a.unresolved);return out;
}
module.exports={identity,queries,createAntiSpoof,mergeObservation};
