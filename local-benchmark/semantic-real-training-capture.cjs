// Actual training candidates, separate from the observed real evaluation.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-scoped-context.cjs');
const R='.runtime/semantic-real-training-v1';
const sources=[
 ['university','https://park.jejunu.ac.kr/bbs/board.php?bo_table=free&page=1745&wr_id=40921'],
 ['association','https://gysaemaul.or.kr/%EA%B2%8C%EC%8B%9C%ED%8C%90/%EC%9E%90%EC%9C%A0%EA%B2%8C%EC%8B%9C%ED%8C%90/?mod=document&uid=17999'],
 ['government','https://www.mfds.go.kr/brd/m_227/view.do?Data_stts_gubun=C9999&company_cd=&company_nm=&itm_seq_1=0&itm_seq_2=0&multi_itm_seq=0&page=1&seq=24689&srchFr=&srchTo=&srchTp=0&srchWord=%EC%95%BD%EA%B3%BC+%EC%9D%8C%EC%8B%9D'],
 ['government','https://www.mfds.go.kr/brd/m_220/view.do?seq=32783'],
 ['government','https://www.moel.go.kr/news/enews/explain/enewsView.do?news_seq=15660'],
 ['government','https://www.cheongju.go.kr/heungdeok/selectBbsNttView.do?bbsNo=40&integrDeptCode=&key=1886&nttNo=235727&pageIndex=1&searchCnd=all&searchCtgry=&searchKrwd='],
 ['university','https://ebook.pusan.ac.kr/ebook/detail/?goods_id=122853203']
];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),save=(f,x)=>fs.writeFileSync(R+'/'+f,JSON.stringify(x,null,2));
async function main(){
 assert(!fs.existsSync(R));fs.mkdirSync(R);const forbidden=new Set(JSON.parse(fs.readFileSync('.runtime/semantic-encoder-real-v1/review-inputs.json')).map(r=>new URL(r.url).hostname));assert(sources.every(([,url])=>!forbidden.has(new URL(url).hostname)));
 const files=[__filename,'docs/semantic-real-training-plan.md','agent/src/core/collect.cjs','agent/src/core/judgment.cjs','local-benchmark/klue-scoped-context.cjs'];const hashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]));
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
