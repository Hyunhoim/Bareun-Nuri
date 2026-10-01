// Fresh authored contrasts, collected through the production browser. No model calls.
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createCollector}=require('../agent/src/core/collect.cjs');
const pairs=[
 ['피해 얘기도 많지만 저는 사설 승부 배팅 회원을 받고 있습니다. 참여할 분은 제 안내로 가입해 주세요.','사설 승부 배팅 회원을 받는다며 가입하라는 연락을 받았습니다. 아직 돈은 안 보냈는데 차단만 하면 될까요?'],
 ['후원 모임인 줄 알았죠? 실은 현금 걸고 하는 사설 게임방입니다. 신규 참여자 모집합니다.','현금 걸고 하는 사설 게임방을 후원 모임이라고 소개받았습니다. 더는 참여하지 않겠다고 했는데 계속 연락이 와요.'],
 ['연락 주세요.','연락 주세요.','처방전 없이 향정신성 의약품을 팔고 있습니다. 구매하실 분에게 전달 방법을 안내합니다.','처방전 없이 향정신성 의약품을 판다는 쪽지를 받았습니다. 신고를 접수한 담당자께 답변을 요청합니다.'],
 ['단속 글이 올라와 있어도 거래는 진행합니다. 불법 마약 판매, 구매 희망자는 판매자인 제게 문의하세요.','단속 글 밑에도 불법 마약 판매 댓글이 붙습니다. 구매 희망자는 문의하라는 문구까지 있는데 삭제가 안 됐습니다.'],
 ['제 계좌를 빌려드립니다. 대포통장으로 쓸 분은 대여료 제시해 주세요.','제 계좌를 빌려달라며 대여료를 제시한 사람이 있습니다. 대포통장으로 쓰려는 것 같아 거절했는데 신고가 되나요?'],
 ['공지 읽었습니다. 그래도 타인 명의 통장 매입은 계속합니다. 넘기실 분 연락 바랍니다.','공지에서 타인 명의 통장 매입 광고를 신고하라고 읽었습니다. 어느 메뉴로 접수하는지 알려 주세요.'],
 ['소개 가능합니다.','소개 가능합니다.','대가를 받는 성매매를 알선합니다. 예약할 분에게 시간과 비용을 안내해 드립니다.','성매매 피해자 지원기관을 찾는 분께 상담 창구를 소개하는 자원봉사 글입니다.'],
 ['이런 게시판에 쓰면 안 되는 건 알지만 유료 성매매 예약 받습니다. 안내는 제게 문의하세요.','유료 성매매 예약 받는다는 게시글을 캡처했습니다. 문의하라는 연락처도 있는데 캡처는 어디로 제출하나요?'],
 ['당사자 동의 없이 찍힌 성적 영상을 유료로 공유합니다. 구매할 분을 모집합니다.','당사자 동의 없이 찍힌 성적 영상을 유료로 공유한다는 광고를 봤습니다. 당사자가 아닌 저도 신고할 수 있나요?'],
 ['피해 예방은 중요하죠. 하지만 여기서는 불법촬영 영상 구매를 연결해 드립니다. 원하는 분 연락 주세요.','피해 예방 수업에서 불법촬영 영상 구매를 연결한다는 광고를 다루려 합니다. 원본 영상을 보이지 않고 설명해도 되나요?'],
 ['ㅅㅏㅅㅓㄹ 도박 회원 모집합니다. 실제 돈을 걸고 참여할 분은 가입 안내를 보세요.','ㅅㅏㅅㅓㄹ 도박 회원 모집이라는 자모 문구를 교육자료에서 발견했습니다. 붙여 읽는 법을 설명해 주실 수 있나요?'],
 ['ｍｅｇａ BET 사설 도박 가입 안내입니다. 입금하고 게임에 참여하세요.','ｍｅｇａ BET라는 표기가 있는 도박 광고를 삭제 요청합니다. 저는 가입하려는 사람이 아닙니다.']
];
async function main(){const out='.runtime/phase2-new-context24';assert(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});const rows=pairs.flatMap((p,i)=>[true,false].map((label,j)=>({id:crypto.createHash('sha256').update('fresh-context-'+i+'-'+j).digest('hex').slice(0,14),text:p[j],after:p[j+2]||'',label,group:i})));
 const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');const html='<!doctype html><html lang="ko"><meta charset="utf-8"><title>시민 의견 게시판</title><body><main>'+rows.map(r=>`<article><p id="n${r.id}">${esc(r.text)}</p>${r.after?'<p>'+esc(r.after)+'</p>':''}</article>`).join('')+'</main></body></html>';
 fs.writeFileSync(out+'/site.html',html);const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const collector=await createCollector({channel:'msedge'});
 try{const url='http://127.0.0.1:'+server.address().port+'/';const ev=await collector.collect(url,{entryUrl:url,scope:'/',followLinks:false,recordNavigation:true,allowLongText:true,allowEmpty:true,maxPages:1,maxNodes:10000,observeTechniques:true});const inputs=rows.map(r=>{const c=ev.candidates.find(c=>c.location.includes('#n'+r.id));assert(c,'Target not collected');assert.equal(c.raw_text,r.text);return{c,label:r.label,role:r.after?'short_target':'mixed_or_report',panel:'fresh_authored24',group:r.group};});fs.writeFileSync(out+'/inputs.json',JSON.stringify(inputs,null,2));fs.writeFileSync(out+'/evidence.json',JSON.stringify(ev));console.log(JSON.stringify({fresh:inputs.length,independent_human_review:false,api:0}));}finally{await collector.close();server.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
