// Read-only source capture for human review, with no model labels.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs');
const {contract}=require('../agent/src/core/judgment.cjs');
const {context}=require('./klue-scoped-context.cjs');
const root='.runtime/nuri-1.2-human-review-v1';
const urls=[
 'https://sports.yeonje.go.kr/subpage/index/92/view/FREE/YEONJE/8613/0',
 'https://www.consumer.go.kr/user/ftc/consumer/cnsmrBBS/740/selectInfoCDMGCSLCDetail.do?infoId=00840005',
 'https://www.busan.go.kr/nbnews/1623079?curPage=190&srchBeginDt=2024-01-08&srchEndDt=2025-01-08&srchKey=&srchText='
];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function main(){
 assert(!fs.existsSync(root));fs.mkdirSync(root);const collector=await createCollector({channel:'msedge'}),log=[],rows=[];
 try{for(const [i,url]of urls.entries()){
  try{
   const snap=await collector.collect(url,{maxPages:1,maxNodes:20000,followLinks:false,allowLongText:true,recordNavigation:true,signal:AbortSignal.timeout(60000)});const file=`snapshot-${i}.json`;fs.writeFileSync(root+'/'+file,JSON.stringify(snap));
   log.push({url,file,sha256:sha(fs.readFileSync(root+'/'+file)),collected_at:snap.collected_at,candidates:snap.candidates.length,issues:snap.collection_issues});
   const seen=new Set();const selected=snap.candidates.filter(c=>{const text=c.raw_text.replace(/\s+/g,' ').trim();if(text.length<30||text.length>1800||seen.has(text)||!/main|content|board|view|article|sub_con|bbs/i.test(c.selector))return false;seen.add(text);return true;}).slice(0,12);
   for(const c of selected){const e=contract().initialEvidence(c),input={target:e.normalized_text,context:context(c,e)};rows.push({id:sha(c.url+'\n'+c.location).slice(0,18),url:c.url,page_title:c.page_title,selector:c.selector,frame_urls:c.frame_urls,collected_at:snap.collected_at,snapshot_file:file,snapshot_sha256:log.at(-1).sha256,raw:c.raw_text,input,input_sha256:sha(JSON.stringify(input)),page_evidence:selected.map(x=>({selector:x.selector,text:x.raw_text})),decision:null,reviewed:false});}
   console.log(JSON.stringify({url,selected:selected.length}));
  }catch(e){log.push({url,error:e.message});console.log(JSON.stringify({url,error:e.message}));}
  fs.writeFileSync(root+'/capture.json',JSON.stringify(log,null,2));fs.writeFileSync(root+'/review-items.json',JSON.stringify(rows,null,2));
 }}finally{await collector.close();}
 fs.writeFileSync(root+'/manifest.json',JSON.stringify({version:'nuri-1.2-human-review-v1',items:rows.length,source:'public live pages, unmodified content',items_sha256:sha(fs.readFileSync(root+'/review-items.json')),labels_completed:0,training_ready:false,independent_human_review:'pending',illegal_offer_samples_confirmed:0,source_selection:'targeted complaints/prevention/legitimate participation, not balanced positive gold'},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
