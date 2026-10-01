// Prepare a new synthetic boundary set once; never import its labels in the detector.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {collect}=require('../src/core/collect.cjs');
const root=path.resolve(process.argv[2]||'.runtime/stage2-routing/holdout');
if(fs.existsSync(root))throw Error('Destination exists; preserve the sealed set');
const samples=[],main=[],frame=[];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
function add(text,context,is_ad,{layout=0,after=false,framed=false,review=false,dynamic=false,extra=''}={}){
 const id='item'+samples.length,tag=['p','button','a','h4','span'][layout%5];
 const target=`<${tag} id="${id}"${tag==='a'?' href="#entry"':''}>${esc(text)}</${tag}>`;
 const note=context?`<p>${esc(context)}</p>`:'',body=(after?target+note:note+target)+extra;
 const wraps=[s=>`<article>${s}</article>`,s=>`<fieldset>${s}</fieldset>`,s=>`<div role="listitem">${s}</div>`,s=>`<aside><div class="record">${s}</div></aside>`,s=>`<div role="comment" style="display:grid">${s}</div>`];
 const html=wraps[layout%5](body);
 (framed?frame:main).push(dynamic?`<div aria-busy="true" id="slot${id}"></div><script>setTimeout(()=>{const e=document.getElementById('slot${id}');e.innerHTML=${JSON.stringify(html)};e.removeAttribute('aria-busy')},250)</script>`:html);
 samples.push({selector:tag+'#'+id,text,is_ad,expected_review:review,framed,kind:review?'insufficient':is_ad?'ad':'normal'});
}
const pairs=[
 ['접속 창구로 이동','현금을 판돈으로 거는 사설 바카라방입니다. 다음 링크는 그 방의 실제 접속 경로입니다.','구립 체육관의 배드민턴 강좌입니다. 다음 링크는 공식 강좌 신청 경로입니다.'],
 ['가입 혜택을 확인해 보세요.','이 글은 무허가 현금 도박방으로 회원을 모집하는 홍보입니다. 이어지는 문구는 신규 회원에게 제공할 베팅 금액 안내입니다.','이 글은 동네 책방의 독서 모임 모집입니다. 이어지는 문구는 신규 회원에게 제공할 책갈피 안내입니다.'],
 ['오늘 입장 가능','바로 앞의 짧은 문구는 사설 현금 카지노의 실제 영업 광고입니다. 신규 베팅 회원을 받습니다.','바로 앞의 짧은 문구는 시립 미술관의 당일 관람 안내입니다. 관람객을 받습니다.'],
 ['주문은 연결된 창구에서','당사자 동의 없이 유출된 성인 영상을 판매 중입니다. 뒤에 있는 주문 안내는 그 영상의 구매 절차입니다.','저작권자의 허락을 받은 성인 대상 미술 강좌 영상을 판매 중입니다. 뒤에 있는 주문 안내는 그 강좌의 구매 절차입니다.'],
 ['참여 절차 열기','미등록 도박방에서 현금 베팅 참여자를 모집합니다. 다음 링크가 실제 신청 절차입니다.','지역 주민이 참여하는 무료 환경 정화 활동입니다. 다음 링크가 실제 신청 절차입니다.'],
 ['신청 화면으로','아래 버튼을 누르면 동의 없이 촬영된 성적 영상의 유료 구매 신청으로 이어집니다.','아래 버튼을 누르면 시청 주최 무료 사진 교육의 수강 신청으로 이어집니다.']
];
for(const [i,[t,ad,normal]]of pairs.entries()){
 const options={layout:i,after:i===2,framed:i===4,dynamic:i===5};
 add(t,ad,true,options);add(t,normal,false,options);
}
for(const [i,t]of ['현금 베팅 사설 도박방에 새 회원으로 가입하세요.','동의 없이 촬영된 성적 영상을 유료로 구매할 수 있습니다.','무허가 카지노의 현금 게임에 지금 참여하세요.','불법 촬영 성인물의 유료 판매 계정을 등록해 드립니다.'].entries()){
 add(t,'뒤의 문장은 현재 운영하는 서비스의 실제 모집 공고이며, 신고나 교육을 위한 재현이 아닙니다.',true,{layout:i});
 add(t,'전술한 문장은 수사 교육에서 분석할 광고의 인용문입니다. 실제 접속과 거래를 권장하는 내용이 아닙니다.',false,{layout:i,after:true});
}
for(const [i,t]of ['기록 번호 731','담당: 시민소통실','의견 2건','자료실 목록','문의 처리 완료','공개 문서'].entries())
 add(t,'현금 도박방 회원을 모집합니다. 사설 베팅방의 가입은 별도 링크를 이용하세요.',false,{layout:i});
add('선택하신 상품의 결제를 진행하세요.','',false,{review:true});
add('신청하신 서비스에 가입하려면 접수해 주세요.','',false,{layout:1,review:true});
add('다음 단계','이 문서의 다음 단계는 현금 도박방에 실제로 가입하는 절차입니다.',true,{layout:2});
add('다음 단계','이 문서의 다음 단계는 도박 피해 신고서를 접수하는 절차입니다.',false,{layout:2});
add('확인 후 연결','아래 문구는 불법 촬영물 판매 창구의 접속 안내를 재현한 교육용 예시이며 실제 링크는 없습니다.',false,{layout:3});
add('확인 후 연결','아래 문구는 불법 촬영물 판매 창구로 고객을 실제 연결하는 구매 안내입니다.',true,{layout:3});
async function mainTask(){
 fs.mkdirSync(root,{recursive:true});const save=(n,v)=>fs.writeFileSync(path.join(root,n+'.json'),JSON.stringify(v,null,2));
 const page=s=>'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>주민 자료 열람</title></head><body>'+s+'</body></html>';
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');if(req.url==='/review/')res.end(page(main.join('')+'<iframe src="/review/frame"></iframe>'));else if(req.url==='/review/frame')res.end(page(frame.join('')));else{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const snapshot=await collect(`http://127.0.0.1:${server.address().port}/review/`,{maxPages:2,maxNodes:200});
  const selected=samples.map(s=>{const found=snapshot.candidates.filter(c=>c.selector===s.selector&&Boolean(c.frame_urls.length)===s.framed);assert.equal(found.length,1,s.selector);assert.equal(found[0].raw_text,s.text);return found[0];});
  const labels=samples.map((s,i)=>({...s,node_id:selected[i].node_id}));
  save('collection',snapshot);save('evidence',{...snapshot,candidates:selected});save('labels',labels);
  save('seal',{created:new Date().toISOString(),count:labels.length,ads:labels.filter(l=>l.is_ad).length,expectedReviews:labels.filter(l=>l.expected_review).length,
   hashes:Object.fromEntries(['evidence','labels'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n+'.json'))).digest('hex')])),
   note:'New wording and HTML/context combinations; synthetic, not real-site generalization. Labels for scoring only.'});
  console.log(JSON.stringify({selected:labels.length,ads:labels.filter(l=>l.is_ad).length,expectedReviews:labels.filter(l=>l.expected_review).length,collected:snapshot.candidates.length}));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
mainTask().catch(e=>{console.error(e);process.exitCode=1;});
