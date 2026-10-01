const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createCollector}=require('../agent/src/core/collect.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-scoped-context.cjs');
const root='.runtime/klue-audit-learning-v1',sha=s=>crypto.createHash('sha256').update(s).digest('hex'),esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
// New diagnostic data, not an independent real-world final set. No old contest sentences are fitted.
const banks={train:[
`동네 길 안내 고맙습니다. 덧붙여 제가 운영하는 사설 야구 배팅장 회원을 받고 있으니 돈 걸고 하실 분 연락 바랍니다.
비 때문에 집에 계시면 저희 온라인 룰렛으로 오세요. 현금 칩 사서 참여하고 남은 금액은 다시 돈으로 드립니다.
댓글 남긴 김에 알려요. 성인 사생활을 몰래 촬영한 파일을 유료로 넘길 구매자 찾고 있습니다.
오늘 제 글 내용은 간단합니다. 현금 판돈 받는 비공식 축구 승부방에 가입할 사람 모집해요.
앞부분 교통 건의는 여기까지입니다. 아래에는 제가 파는 비동의 성인 촬영물 이용권 신청창을 남깁니다.
가게 쉬는 날에 같이 하죠. 제가 소개하는 사설 카지노는 예치금을 걸고 딴 칩을 현금으로 찾는 곳입니다.
회의 잘 마쳤습니다. 다른 얘기지만 현금 환전되는 온라인 슬롯을 운영 중이니 유료 계정 만들어드릴게요.
제 연락처로 주문 남기세요. 피해자 동의 없이 촬영한 성인 영상 원본을 판매 중입니다.
판돈 걸어 경기 맞히는 사설방 초대해요. 지역 행사에 관한 의견은 다음 글에 쓰겠습니다.
추첨식 사설 게임에 돈 넣을 회원 받습니다. 당첨 번호에 따라 정산금을 계좌로 보내드립니다.
저는 온라인 도박 테이블 모집 담당입니다. 칩을 현금으로 바꾸실 고객에게 가입창 드려요.
자격 없는 사설 배팅방이지만 입금 고객은 받고 있습니다. 오늘 축구 경기부터 돈 걸어보세요.
사진 속 행사는 끝났습니다. 이제 제 현금 포커방 참가자를 받으니 판돈 충전할 분 답장하세요.
글이 길어졌네요. 마지막으로 몰래 찍힌 성인 영상의 구매자를 찾습니다. 돈 받고 보내드립니다.
주민 문의 답변은 읽었습니다. 제가 안내하는 사설 경주게임에 현금 걸고 싶으면 새 계정 신청하세요.
원하시면 성인 피해 촬영물 저장본을 팔겠습니다. 당사자의 공개 허락을 받은 자료는 아닙니다.`,
`단체 채팅에 현금 슬롯 모집 문구가 붙었습니다. 제가 작성한 안내문이 아닌데 제 이름으로 돌아다녀 경위를 알립니다.
수업 시간에 온라인 배팅 광고의 입금 유도 대목을 읽었습니다. 학생들은 광고를 분석한 보고서를 제출했습니다.
동네 신문은 사설 도박 회원을 받던 게시판이 폐쇄됐다고 전했습니다. 주민에게는 수사 진행 사실만 전달했습니다.
상담 기록에는 당첨금을 보내려면 먼저 돈을 넣으라는 연락이 적혀 있습니다. 상담사가 그 요구를 거절하도록 설명했습니다.
지난 회의에서 성인 피해 영상을 판다는 게시글을 증거 목록에 넣었습니다. 파일이나 구매 경로는 공개하지 않았습니다.
배팅장 광고 문구가 적힌 종이는 청소팀이 수거했습니다. 이 글은 수거 위치를 정리한 작업 보고입니다.
시민교육 자료에 현금 카지노 가입 권유 화면을 실었습니다. 가입 버튼은 없애고 피해 사례만 설명합니다.
방송 인터뷰의 주제는 도박 판돈을 마련하려 빚을 진 경험입니다. 출연자는 다른 사람에게 게임을 하지 말라고 말했습니다.
유출 성인 영상을 구독하라는 메시지를 받았다는 증언입니다. 기록자는 판매자가 아니라 피해 상담 담당자입니다.
수사 발표에 나온 온라인 포커방은 칩을 돈으로 바꿔줬다고 합니다. 해당 영업의 적발 경위를 알리는 기사입니다.
연구진이 사설 경기 배당 광고의 유입 경로를 조사했습니다. 보고서에서는 접속 주소를 지우고 통계만 남겼습니다.
도박 충전 혜택이라는 표현은 게시물 삭제 사유에 인용된 말입니다. 담당자는 광고를 접수한 것이 아닙니다.
학부모 회의에서는 배팅 계정 모집 문자를 함께 살폈습니다. 청소년 상담기관을 안내하는 자리였습니다.
신고 접수 내용에 비동의 성인 파일 판매 제안이 들어 있습니다. 공개 문서에서는 관련 계정을 가렸습니다.
사설 회차게임의 현금 정산을 미끼로 한 피해를 취재했습니다. 제보자는 보낸 돈을 돌려받지 못했다고 말했습니다.
전시된 화면은 카지노 광고에 속은 사람의 진술 자료입니다. 전시실에서는 광고 서비스를 신청할 수 없습니다.`,
`제 아이 이름으로 사설 배팅 계정이 생겼습니다. 가족 상담을 받으려면 보호자가 어떤 서류를 가져가야 하나요?
급하게 돈을 보내라고 해서 도박 사이트에 송금했습니다. 다시는 들어가지 않으려는데 상담 예약을 도와주세요.
제가 성인일 때 몰래 찍힌 영상이 거래되고 있습니다. 판매 글을 내릴 수 있게 지원받고 싶습니다.
현금 게임을 그만두겠다고 했는데 연락이 옵니다. 연락을 끊고 채무 상담을 받으려 합니다.
제 사진을 붙여 성인 유출 자료를 판다는 계정이 있습니다. 제 명의가 도용됐다는 접수부터 하고 싶어요.
친구가 온라인 카지노에 돈을 넣으라고 강요합니다. 청년 상담창구에서 이런 문제도 다루나요?
도박 출금이 된다며 신분증을 보냈습니다. 개인정보를 회수하려면 어디에 연락해야 하나요?
성인 피해 영상의 재유포 사실을 알게 됐습니다. 기록을 제출할 비공개 방법을 안내받고 싶습니다.
공영 주차장 기계에 현금을 냈는데 표가 안 나왔습니다. 영수증 없이도 결제 기록을 확인할 수 있나요?
교통카드 충전이 두 번 승인됐습니다. 시내버스 이용 내역에는 한 번만 나와 환불을 요청합니다.
청소년 회관 수강료를 돌려받을 계좌를 등록하려 합니다. 보호자 명의여도 되나요?
작년 봉사 보상금이 입금되지 않았습니다. 지급 담당 부서에 문의하고 싶습니다.
오늘 축구 동호회는 운동장 안에서 경기만 합니다. 돈을 걸거나 결과로 상품을 주지 않습니다.
카드 게임 확률을 배우는 모임을 도서관에서 엽니다. 참가비도 없고 실제 돈은 사용하지 않습니다.
행사 예약 확인서를 다시 발급받으려 합니다. 신청 내역이 지워진 것 같습니다.
이 버튼은 화면 읽기 프로그램에서 다음 항목으로 이동하는 기능입니다.`,
`회원 받을 건데 내용은 전화로만 알려드려요. 어떤 서비스인지는 지금 적지 않겠습니다.
신청 창은 있는데 상품 이름이나 이용 목적 설명은 없습니다. 관심 있으면 연락만 주세요.
돈을 넣을 수 있다는 안내만 받았습니다. 어떤 거래에 쓰는 계정인지 이 화면에는 없습니다.
추가 설명 없이 이용자를 받는다고만 적었습니다. 대상 서비스가 무엇인지는 아직 밝히지 않았습니다.
진행할 분을 찾습니다. 무엇을 진행하는지에 관한 내용은 지금 제공하지 않겠습니다.
조건을 맞추면 연결해드린다고 합니다. 연결되는 곳의 종류나 목적은 설명돼 있지 않습니다.
이용 신청을 받지만 서비스 명칭은 추후 알린다고 합니다. 현재는 신청 안내만 있습니다.
별도 연락으로 안내한다는 말만 남겼습니다. 판매 품목과 거래 조건은 알려져 있지 않습니다.
가입할 사람은 답장하세요. 가입 목적을 설명하는 본문은 아직 작성하지 않았습니다.
지금 참여자를 받습니다. 활동 내용은 확인할 수 없고 연결 버튼만 있습니다.
이 글에서는 신청 방법만 말하겠습니다. 어떤 서비스를 신청하는지는 나중에 밝힙니다.
결제한 분께 무언가를 보내드립니다. 보내는 물건이나 자료가 무엇인지 적지 않았습니다.
오늘 접수할 분 구합니다. 접수 대상이나 기관 안내는 별도로 하지 않았습니다.
창구를 옮겼으니 여기로 연락 주세요. 어느 업무 창구인지 확인되는 내용은 없습니다.
이용권을 드린다는 안내입니다. 무엇을 이용하는 권리인지 설명되지 않았습니다.
회원 연장을 받고 있습니다. 회원이 사용하는 서비스가 무엇인지는 이 글만으로 알 수 없습니다.`],validation:[
`산책로 얘기는 다음에 할게요. 지금은 제가 만든 무허가 현금 배팅 사이트의 이용자를 모으니 참가할 사람은 입금 안내 받아가세요.
공지 잘 읽었어요. 그와 별개로 성인 피해자가 지워 달라고 한 촬영본을 돈 받고 넘기고 있으니 구매할 분만 연락 바랍니다.
오늘 대진에 실제 판돈을 걸 분에게 제 사설 승부방을 열어드립니다. 끝난 뒤 배당금도 계좌로 받을 수 있어요.
저녁 식사는 해결했습니다. 남은 시간에 온라인 도박방 같이 하실 분, 제 소개로 현금 칩 구매하시면 됩니다.
돈을 받고 회원을 들이는 사설 숫자 게임을 운영합니다. 맞힌 번호의 배당은 현금으로 정산하니 들어오세요.
민원 답변은 기다리겠습니다. 여기서는 제가 파는 비동의 성인 촬영 파일 주문도 받습니다.
제가 온라인 룰렛방 입금을 담당하고 있어요. 실제 판돈으로 게임하고 남은 칩을 현금으로 받을 고객을 찾습니다.
이 글의 마지막 안내입니다. 유출된 성인 사생활 원본을 유료로 전송할 테니 받을 분은 신청하세요.` ,
`지역 잡지에 현금 도박방을 운영하다 적발된 사람의 재판 소식이 실렸습니다. 글쓴이는 판결 내용을 소개했습니다.
교사가 사설 배팅 권유 문자를 칠판에 보여줬습니다. 아이들은 어디서 피해가 생기는지 토론했습니다.
삭제 이력에 성인 피해 영상의 유료 전송 광고가 적혀 있습니다. 관리자는 처리 결과를 설명했습니다.
청소년이 게임 판돈을 마련한 경위를 조사한 보고입니다. 모집에 응하라는 내용은 없습니다.
회복 모임 발표자는 카지노 충전으로 돈을 잃었다고 말했습니다. 발표를 정리해 상담 자료로 남겼습니다.
성인 유출자료 판매가 어떻게 신고됐는지 보도하는 뉴스입니다. 피해자의 신원은 공개하지 않았습니다.
우편함에서 발견한 현금 배팅 광고지를 폐기했습니다. 수거 업무 일지에 적힌 기록입니다.
기관은 온라인 도박 광고 사례를 분석한 연구 결과를 공개했습니다. 실제 가입 경로는 제공하지 않았습니다.` ,
`내 돈을 찾으려면 또 넣으라는 사설 도박방의 요구를 받았습니다. 더 보내기 전에 상담원과 이야기하고 싶어요.
성인이 된 뒤 촬영된 제 사생활 영상이 허락 없이 팔립니다. 제거를 도와줄 기관 연락처가 필요합니다.
친척이 현금 카지노 가입을 권하는 메시지를 계속 보냅니다. 그만 받도록 지원받을 수 있을까요?
시립 수영장 환불금이 다른 계좌로 갔습니다. 수강 취소 기록과 함께 확인해 주세요.
마을버스 충전기에 지폐가 걸렸습니다. 기계에서 돈을 돌려받을 접수처를 알려주세요.
훔쳐 간 제 성인 사진을 판다는 연락을 받았습니다. 증거를 보존하면서 경찰 상담을 받고 싶습니다.
다음 문서로 이동하는 접근성 버튼입니다. 마우스를 쓰기 어려운 이용자도 누를 수 있습니다.
도서관 시민 강의는 무료입니다. 예약 후 참석이 어려우면 취소만 해주시면 됩니다.` ,
`신규 이용자를 모집한다는 안내만 있습니다. 이용하는 서비스의 종류는 공개하지 않았습니다.
입장할 분에게 따로 이야기하겠습니다. 어떤 장소나 활동인지는 이 글에 없습니다.
여기로 신청하면 된다는 답변입니다. 신청 대상이 무엇인지 앞선 대화는 남아 있지 않습니다.
연락하면 제공한다는 물건의 이름은 적혀 있지 않습니다. 지금은 신청 의사만 받고 있습니다.
회원에게 보내는 공지인데 어느 서비스의 회원인지 표시가 없습니다. 가입을 원하는 분의 문의를 받는다고 합니다.
예약을 받겠다고만 적혀 있습니다. 무엇을 예약하는지 알 수 있는 설명은 찾을 수 없습니다.
다음 단계로 연결해준다는 메시지입니다. 연결 대상의 내용이 빠진 상태로 신청을 받습니다.
주문하실 분을 찾지만 판매하는 항목이 무엇인지는 밝히지 않았습니다. 자세한 말은 나중에 하겠다고 합니다.`]};
async function main(){
 assert(!fs.existsSync(root));fs.mkdirSync(root);const specs=[];
 for(const [split,groups]of Object.entries(banks))groups.forEach((block,label)=>block.split('\n').forEach((text,i)=>{
  const group=split+'-'+label+'-'+i;for(let v=0;v<(split==='train'?4:2);v++){const id='n'+sha(group+'|'+v).slice(0,14),before=['주민이 남긴 의견입니다.','문의 내용을 작성했습니다.','참여 게시판의 새 글입니다.',''][v];const target='<p id="'+id+'">'+esc(text)+'</p>';let body;
   if(split==='train')body=v%2?'<div role="comment"><p>'+before+'</p>'+target+'</div>':'<article>'+target+'<p>'+before+'</p></article>';
   else body=v?'<section><div>'+target+'</div></section>':'<div class="entry"><p>내용을 확인해 주세요.</p>'+target+'</div>';
   specs.push({split,label,group,id,text,body});
  }
 }));
 const pages=[];for(let i=0;i<specs.length;i+=8)pages.push(specs.slice(i,i+8));
 const server=http.createServer((req,res)=>{const i=Number(req.url.slice(1));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="ko"><head><title>주민 소통 글</title></head><body><main>'+pages[i].map(s=>s.body).join('')+'</main></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));let collector;const rows=[],evidence=[];
 try{collector=await createCollector({channel:'msedge'});for(let i=0;i<pages.length;i++){const snap=await collector.collect('http://127.0.0.1:'+server.address().port+'/'+i,{followLinks:false,maxPages:1,maxNodes:1000});for(const spec of pages[i]){const c=snap.candidates.find(c=>c.selector==='p#'+spec.id);assert(c);assert.equal(c.raw_text,spec.text);const e=contract().initialEvidence(c);rows.push({id:spec.id,group:spec.group,split:spec.split,label:spec.label,input:{target:e.normalized_text,context:context(c,e)}});evidence.push(c);}if(i%10===0)console.log('learning pages '+i+'/'+pages.length);}}
 finally{if(collector)await collector.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 for(const split of ['train','validation'])fs.writeFileSync(root+'/'+split+'.json',JSON.stringify(rows.filter(r=>r.split===split),null,2));fs.writeFileSync(root+'/evidence.json',JSON.stringify(evidence));
 const known=JSON.parse(fs.readFileSync('test-set-contest-v1/data/private/gold.json')),old=new Set(known.map(r=>r.base_text.normalize('NFKC')));assert(rows.every(r=>!old.has(r.input.target.normalize('NFKC'))));
 const train=new Set(rows.filter(r=>r.split==='train').map(r=>r.input.target));assert(rows.filter(r=>r.split==='validation').every(r=>!train.has(r.input.target)));
 const manifest={new_train:rows.filter(r=>r.split==='train').length,new_validation:rows.filter(r=>r.split==='validation').length,semantic_train:64,semantic_validation:32,source:'new authored diagnostic HTML collected by actual collector',human_reviewed:false,independent_final:false,hashes:Object.fromEntries(['train.json','validation.json','evidence.json'].map(f=>[f,sha(fs.readFileSync(root+'/'+f))]))};fs.writeFileSync(root+'/manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
}
main().catch(e=>{console.error(e);process.exitCode=1});
