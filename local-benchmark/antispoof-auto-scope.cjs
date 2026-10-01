// Existing diagnostic material, now using actual automatic span extraction.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createAntiSpoof}=require('../agent/src/core/antispoof.cjs');
const {observeTechniques,integrateObservations}=require('../agent/src/core/techniques.cjs');
const {guard}=require('./antispoof-evidence-integration.cjs');
async function main(){
 const source=JSON.parse(fs.readFileSync('.runtime/antispoof-jamo-audit-v2/predictions.json'));
 const rows=source.filter(r=>['normal_neighbor','digit_neighbor'].includes(r.context));
 const cs=rows.map((r,i)=>({node_id:'auto'+i,url:'https://example.test/',location:'#auto'+i,raw_text:r.target.replace('[표기]','').replace('[/표기]',''),page_title:r.side,context_evidence:{units:[],truncated:false}}));
 const ds=cs.map(c=>({node_id:c.node_id,is_violation:true,needs_review:false,techniques:[],reason:'controlled intent; diagnostic only'}));
 const service=createAntiSpoof(),start=performance.now();let before;
 try{before=await service.annotate(cs,ds);}finally{service.close();}
 assert(before.every(d=>d.antispoof.predictions.length===2));
 const after=before.map((d,i)=>guard(cs[i],d)),obs=cs.map(c=>observeTechniques(c));
 const fb=integrateObservations({candidates:cs},before,obs).decisions,fa=integrateObservations({candidates:cs},after,obs).decisions;
 const summary={n:cs.length,elapsedMs:performance.now()-start,api_calls:0,independent_evaluation:false,controlled_intent:true};
 for(const mode of ['normal_neighbor','digit_neighbor']){
  const ix=rows.map((r,i)=>r.context===mode?i:-1).filter(i=>i>=0);
  summary[mode]={n:ix.length,H_before:ix.filter(i=>fb[i].techniques.includes('HOMOGLYPH')).length,H_after:ix.filter(i=>fa[i].techniques.includes('HOMOGLYPH')).length,J_before:ix.filter(i=>fb[i].techniques.includes('JAMO')).length,J_after:ix.filter(i=>fa[i].techniques.includes('JAMO')).length,H_removed:ix.filter(i=>fb[i].techniques.includes('HOMOGLYPH')&&!fa[i].techniques.includes('HOMOGLYPH')).length};
 }
 const dir=path.join('.runtime','antispoof-auto-scope-'+Date.now());fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({summary,rows,candidates:cs,before,after,fb,fa},null,2));console.log(JSON.stringify({dir,...summary}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
