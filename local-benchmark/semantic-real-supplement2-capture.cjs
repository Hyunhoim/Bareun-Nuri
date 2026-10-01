// Actual training candidates, separate from the observed real evaluation.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-scoped-context.cjs');
const R='.runtime/semantic-real-supplement2-v1';
const sources=[["government", "https://seodong.iksan.go.kr/main/inner.php/img/sub/SmartEditorBasic/js/skin/style/common/img/file/data/thumb/inner.php?mode=view&no=1003&sMenu=qna"], ["university", "https://www.sorabol.ac.kr/sub2_2_d?page=7&sca=%ED%98%B8%ED%85%94%EA%B4%80%EA%B4%91%EA%B2%BD%EC%98%81%EA%B3%BC&spt=-411939"], ["university", "https://droneedu.tk.ac.kr/bbs/board.php?bo_table=application&page=3628&sod=asc&sop=and&sst=wr_hit"], ["government", "https://www.police.go.kr/user/bbs/BD_selectBbs.do?q_bbsCode=1013&q_bbscttSn=20250426195618279"], ["government", "https://www.police.go.kr/user/bbs/BD_selectBbs.do?q_bbsCode=1013&q_bbscttSn=20250529224350719"], ["government", "https://eng.mokpo.go.kr/www/citizen_participation/talk/free_board?idx=547895&mode=view"], ["government", "https://www.ccourt.go.kr/site/kor/ex/bbs/View.do?bcIdx=1009260&cbIdx=1115"]];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),save=(f,x)=>fs.writeFileSync(R+'/'+f,JSON.stringify(x,null,2));
async function main(){
 assert(!fs.existsSync(R));fs.mkdirSync(R);const forbidden=new Set(JSON.parse(fs.readFileSync('.runtime/semantic-encoder-real-v1/review-inputs.json')).map(r=>new URL(r.url).hostname));assert(sources.every(([,url])=>!forbidden.has(new URL(url).hostname)));
 const files=[__filename,'docs/semantic-real-supplement2-plan.md','agent/src/core/collect.cjs','agent/src/core/judgment.cjs','local-benchmark/klue-scoped-context.cjs'];const hashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]));
 save('manifest.json',{sources,purpose:'training_candidates_not_final_holdout',hashes,api_calls:0,model_predictions_used:false});
 const collector=await createCollector({channel:'msedge'}),log=[],rows=[];
 try{for(const [page,[source_kind,url]]of sources.entries()){
  const start=Date.now();try{
   for(const [f,h]of Object.entries(hashes))assert.equal(sha(fs.readFileSync(f)),h);
   const s=await collector.collect(url,{entryUrl:url,scope:'/',maxPages:1,maxNodes:10000,followLinks:false,recordNavigation:true,allowLongText:true,allowEmpty:true,observeTechniques:true,signal:AbortSignal.timeout(60000)});
   const file=`snapshot-${page}.json`;save(file,s);log.push({url,source_kind,file,sha256:sha(fs.readFileSync(R+'/'+file)),seconds:(Date.now()-start)/1000,candidates:s.candidates.length,issues:s.collection_issues});
   for(const c of s.candidates){const ev=contract().initialEvidence(c);rows.push({id:sha(url+'\n'+c.location).slice(0,24),page,source_kind,url:c.url,selector:c.selector,location:c.location,node_id:c.node_id,raw:c.raw_text,input:{target:ev.normalized_text,context:context(c,ev)},collection_truncated:!!c.context_evidence?.truncated,snapshot:file});}
  }catch(err){log.push({url,source_kind,seconds:(Date.now()-start)/1000,error:err.message});}
  save('capture.json',log);save('inputs.json',rows);console.log(JSON.stringify(log.at(-1)));
 }}finally{await collector.close();}
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);save('captured.json',{pages:log.length,snapshot_files:log.filter(r=>r.file).length,rows:rows.length,inputs_sha256:sha(fs.readFileSync(R+'/inputs.json'))});
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
