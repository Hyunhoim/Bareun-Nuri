// Frozen-model evaluation capture, never follows advertiser destinations.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs');
const {contract}=require('../agent/src/core/judgment.cjs');
const {context}=require('./klue-scoped-context.cjs');
const root='.runtime/semantic-encoder-real-v1';
const urls=[
 'https://www.nongsaro.go.kr/portal/ps/psx/psxa/mlrdCurationDtl.ps?curaCnt=294&curationNo=428&menuId=PS03974&pageIndex=1&sCtgCode=&sSortType=rdcnt&sType=all&sWord=',
 'https://support.sehan.ac.kr/?mod=document&page_id=2254&pageid=28&uid=2399',
 'https://acts.ac.kr/modules/board/bd_view.asp?ListBlock=10&Pagecount=761&ca_no=&gotopage=459&id=classmate_qna&left=1&lnb_id=&mncode=&no=3860&sk=&sleft=&sv=&title=',
 'https://rise.hoseo.ac.kr/main/menu?bwrite_id=VMIASMTBXhYA&do=view&gc=831TMDN',
 'https://www.yangju.go.kr/yj1318/selectBbsNttView.do?bbsNo=156&integrDeptCode=&key=2110&nttNo=97940&pageIndex=103&searchCnd=all&searchCtgry=&searchKrwd=',
 'https://www.ddc.go.kr/health/selectBbsNttView.do?bbsNo=79&integrDeptCode=&key=1427&nttNo=105844&pageIndex=1&searchCnd=all&searchCtgry=&searchKrwd=',
 'https://www.kcg.go.kr/kcg/na/ntt/selectNttInfo.do?nttSn=29432'
];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const save=(f,x)=>fs.writeFileSync(root+'/'+f,JSON.stringify(x,null,2));
async function main(){
 assert(!fs.existsSync(root),'Do not overwrite captured evaluation');fs.mkdirSync(root);
 const files=[__filename,'docs/semantic-encoder-real-plan.md','agent/src/core/collect.cjs','agent/src/core/judgment.cjs','local-benchmark/klue-scoped-context.cjs'];
 save('manifest.json',{urls,source_selection:'targeted external search; not representative prevalence',hashes:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))])),api_calls:0,model_predictions_opened:false});
 const collector=await createCollector({channel:'msedge'}),log=[],rows=[];
 try{for(const [page,url]of urls.entries()){
  const start=Date.now();
  try{
   const s=await collector.collect(url,{entryUrl:url,scope:'/',maxPages:1,maxNodes:10000,followLinks:false,recordNavigation:true,allowLongText:true,allowEmpty:true,observeTechniques:true,signal:AbortSignal.timeout(60000)});
   const file=`snapshot-${page}.json`;save(file,s);log.push({url,file,sha256:sha(fs.readFileSync(root+'/'+file)),seconds:(Date.now()-start)/1000,candidates:s.candidates.length,issues:s.collection_issues});
   for(const c of s.candidates){const ev=contract().initialEvidence(c);rows.push({id:sha(page+'\n'+c.url+'\n'+c.location).slice(0,24),page,url:c.url,selector:c.selector,location:c.location,node_id:c.node_id,raw:c.raw_text,input:{target:ev.normalized_text,context:context(c,ev)},collection_truncated:!!c.context_evidence?.truncated,snapshot:file});}
  }catch(err){log.push({url,seconds:(Date.now()-start)/1000,error:err.message});}
  save('capture.json',log);save('inputs.json',rows);console.log(JSON.stringify(log.at(-1)));
 }}finally{await collector.close();}
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);save('captured.json',{pages:log.length,succeeded:log.filter(r=>r.file).length,rows:rows.length,inputs_sha256:sha(fs.readFileSync(root+'/inputs.json'))});
}
main().catch(e=>{console.error(e);process.exitCode=1});
