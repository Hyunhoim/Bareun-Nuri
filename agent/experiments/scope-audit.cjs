const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {atomic}=require('../src/core/scan.cjs');
const read=p=>JSON.parse(fs.readFileSync(p)),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function audit(root,archived=false){
 const manifest=read(path.join(root,'live-manifest.json'));
 for(const [p,h]of Object.entries(manifest)){const file=archived&&!p.startsWith(root)?path.join(root,'frozen-source',path.relative(process.cwd(),path.resolve(p))):p;assert.equal(hash(fs.readFileSync(file)),h,'Changed live source '+p);}
 const inputs={},settings=new Set(),stats=[];
 for(const id of ['mixed-0','mixed-1'])for(const mode of ['fifo','bandit','bandit-path']){
  const dir=path.join(root,id+'-'+mode),state=read(path.join(dir,'checkpoint.json')).state;
  assert.equal(state.reason,'page_budget');assert.equal(state.pages.length,12);assert.equal(state.work.length,state.decisions.length);assert(!state.inflight);
  assert(state.call_records.every(c=>c.status==='ok'&&c.http_status===200));
  const traces=fs.readFileSync(path.join(dir,'trace.jsonl'),'utf8').trim().split('\n').map(JSON.parse),map=new Map();
  for(const e of traces.filter(t=>t.event==='llm_request')){
   const {messages,...other}=e.body;settings.add(hash(JSON.stringify({system:messages[0],temperature:other.temperature,seed:other.seed,thinking:other.thinking,max:other.maxCompletionTokens})));
   const candidates=JSON.parse(messages.find(m=>m.role==='user').content).candidates;
   for(const c of candidates){assert(!('is_ad' in c));map.set(c.node_id,hash(JSON.stringify(c)));}
  }
  inputs[id+'-'+mode]=map;stats.push({id,mode,calls:state.calls,tokens:state.call_records.reduce((n,c)=>n+c.usage.total_tokens,0),judged:state.decisions.length});
 }
 assert.equal(settings.size,1);const shared=[];
 for(const id of ['mixed-0','mixed-1'])for(const mode of ['bandit','bandit-path']){
  const a=inputs[id+'-fifo'],b=inputs[id+'-'+mode],ids=[...a.keys()].filter(k=>b.has(k));for(const k of ids)assert.equal(a.get(k),b.get(k));shared.push({id,mode,identical:ids.length});
 }
 // Archive the exact live implementation before any subsequent structural correction.
 const archive=path.join(root,'frozen-source');fs.mkdirSync(archive,{recursive:true});
 if(!archived)for(const p of Object.keys(manifest).filter(p=>!p.startsWith(root))){const relative=path.relative(process.cwd(),path.resolve(p));assert(!relative.startsWith('..'));const dest=path.join(archive,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(p,dest);}
 const result={verified_sources:Object.keys(manifest).length,settings_equal:true,shared,stats,budget:read(path.join(root,'budget.json')).requests};atomic(root,'audit.json',result);
 console.log(JSON.stringify({...result,budget:{attempts:result.budget.length,confirmed:result.budget.reduce((n,r)=>n+(r.tokens||0),0),accounted:result.budget.reduce((n,r)=>n+(r.tokens??r.reserved),0)}},null,2));
}
if(require.main===module)audit(process.argv[2]||'.runtime/scope-trial-v2',process.argv.includes('--archived'));
