// API0 correctness probe: removing minimum observation time can miss quiet late content.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs');
async function main(){
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>주민 게시판</title><main><p>이용 안내</p><section id="comments"></section></main><script>setTimeout(()=>{document.querySelector("#comments").innerHTML="<p>뒤늦게 표시된 이용자 댓글입니다.</p>"},700)</script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let collector;
 try{collector=await createCollector({channel:process.env.BROWSER_CHANNEL||'msedge'});const url='http://127.0.0.1:'+server.address().port+'/';const rows=[];
 for(const minimumMs of [1000,200,200,1000]){const snap=await collector.collect(url,{entryUrl:url,scope:'/',followLinks:false,recordNavigation:true,allowLongText:true,allowEmpty:true,maxPages:1,maxNodes:10000,observeTechniques:true,readiness:{minimumMs,quietMs:300,maximumMs:5000}});rows.push({minimumMs,late_found:snap.candidates.some(c=>c.raw_text.includes('뒤늦게 표시된')),readiness:snap.pages[0].readiness});}
 assert(rows.filter(r=>r.minimumMs===1000).every(r=>r.late_found));
 const result={scope:'Controlled late DOM correctness probe, not Phase1 performance measurement',rows,decision:rows.filter(r=>r.minimumMs===200).some(r=>!r.late_found)?'Reject blanket minimum wait reduction: late text loss observed':'Inconclusive under current timing; not evidence of safety',api:0};
 const out=path.resolve('.runtime/hcx-readiness-risk-'+Date.now()+'.json');fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result}));
 }finally{await collector?.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
