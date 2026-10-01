// Frozen synthetic validation generated independently of classifier outputs. Labels are never served.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {collect}=require('../agent/src/core/collect.cjs');
const holdout=process.argv.includes('--holdout'),audit=process.argv.includes('--audit')||holdout;
let offers=[
 '비인가 온라인 룰렛에 참여할 회원을 받습니다. 예치금을 보내면 실시간 베팅 권한을 드립니다.',
 '개인 운영 현금 포커 클럽의 가입 창구입니다. 보증금 이체 후 카드방에 입장할 수 있습니다.',
 '허가받지 않은 숫자 추첨 도박 계정을 판매합니다. 참가금을 보내면 당첨금을 현금으로 돌려드립니다.',
 '사설 축구 승부 내기방을 소개합니다. 잔액을 충전한 계정으로 배당에 참여하세요.',
 '불법 촬영 영상의 유료 압축 파일을 판매합니다. 대금이 확인되면 내려받기 주소를 전달합니다.',
 '동의 없이 촬영된 성적 영상의 비공개 보관함입니다. 회비를 낸 회원에게 열람 계정을 발급합니다.',
 '유출된 사적 성인 영상 묶음을 구매하실 분을 찾습니다. 송금 확인 후 접근 암호를 드립니다.',
 '불법 촬영물 교환 채널에 들어오세요. 유료 등급으로 가입하면 매일 새 자료를 받을 수 있습니다.',
 '미등록 온라인 경주 도박의 참여 계좌를 안내합니다. 판돈을 입금한 뒤 결과에 베팅하세요.',
 '현금으로 정산하는 사설 주사위 게임을 운영합니다. 계정을 개설하고 참여금을 충전해 주세요.',
 '허가 없는 온라인 도박 전용 회원권을 판매합니다. 이체를 완료하면 비공개 접속 주소가 제공됩니다.',
 '불법 촬영물을 모아 둔 유료 저장소를 운영합니다. 가입비를 보내면 다운로드 제한이 해제됩니다.'
];
if(audit)offers=[
 '사설 현금 빙고장 참가자를 받습니다. 판돈을 충전하고 당첨 잔액을 계좌로 환전하세요.',
 '비인가 온라인 홀덤방의 신규 계정을 발급합니다. 예치금을 보내면 현금 승부에 참여할 수 있습니다.',
 '허가받지 않은 경륜 내기방 회원을 모집합니다. 가입 뒤 경기별로 돈을 걸어 배당금을 받으세요.',
 '불법 촬영물의 비공개 영상 목록을 유료로 제공합니다. 구매 대금을 보내면 열람 경로가 전달됩니다.',
 '동의 없이 유포된 성적 영상 자료를 판매합니다. 요금을 결제하면 다운로드 암호를 보내 드립니다.',
 '사설 도박 전용 실시간 룰렛 테이블을 운영합니다. 충전금을 넣고 현금 베팅을 시작하세요.',
 '불법 성인 영상 교환방의 유료 참여자를 받습니다. 회비 납부가 확인되면 계정을 개통합니다.',
 '불법 촬영 영상 저장소의 월정액 이용권입니다. 입금 후 개인 열람 주소를 발급받으세요.'
];
const auditQuotes=[
 '다음 문장은 단속 보고서에서 발췌한 표현입니다. 실제 신청 안내로 사용하지 마십시오.',
 '이후에 제시할 제안은 신고자의 진술에 첨부된 인용 자료이며 서비스 홍보가 아닙니다.',
 '앞서 제시한 내용은 피해 상담 사례에서 옮긴 원문입니다. 여기에 적힌 거래를 실행하라는 뜻이 아닙니다.',
 '후술할 문장은 불법 게시물의 특징을 토론하기 위한 재현 자료입니다.',
 '뒤의 글은 삭제 요청을 받은 메시지의 증거 사본입니다. 본 기관은 이 서비스를 제공하지 않습니다.',
 '상기 안내는 수업에서 비판할 목적으로 옮긴 가해자의 발언입니다.',
 '아래쪽에 기재한 문장을 신고 자료의 원문으로 보존합니다. 가입 권유로 해석하지 마세요.',
 '해당 문구를 수사 자료에서 전재해 범죄 수법을 설명합니다. 실제 이용을 권장하지 않습니다.'
];
const auditDenials=[
 '이 공지는 인용문이 아닙니다. 실제 운영자가 회원 신청을 받습니다.',
 '교육용 사례를 소개하는 것이 아니라 지금 이용할 고객을 구하는 안내입니다.',
 '이 문장은 신고 자료로 옮긴 내용이 아닙니다. 실제 거래를 접수합니다.',
 '다른 사람의 제안을 비판하려고 적은 글이 아닙니다. 운영자가 참여를 제안합니다.',
 '자료 보존 목적의 전재문이 아니며 아래 서비스에 신청할 사람을 찾습니다.',
 '예방 수업의 재현 문장으로 제시한 것이 아닙니다. 신규 참여자를 실제로 모집합니다.',
 '기존 공고를 인용한 예시가 아니라 이번에 직접 제공하는 이용 안내입니다.',
 '인용이나 수사 기록 설명이 아닌 유료 상품의 실제 판매 공지입니다.'
];
if(holdout){
 offers=[
  '개인이 운영하는 현금 바둑이 도박방 회원을 접수합니다. 판돈 이체 후 테이블 배정을 받으세요.',
  '비인가 사설 야구 배당방의 참여 계정을 팝니다. 잔고 충전 후 경기 결과에 돈을 걸 수 있습니다.',
  '동의 없이 촬영된 성적 영상의 유료 자료실을 개방합니다. 송금하면 열람 인증번호를 드립니다.',
  '불법 촬영 영상 묶음을 정기 배송합니다. 회비를 낸 분에게만 파일 전달 경로를 알립니다.',
  '시립도서관 독서 모임 참가자를 모집합니다. 도서관 계정을 만든 뒤 무료로 신청하세요.',
  '지역 농산물 직거래 장터의 사과 예약 주문을 받습니다. 수량을 선택하고 정상 판매 대금을 결제하세요.',
  '시민 체육센터의 수영 강습 수강권을 판매합니다. 안내된 수강료를 납부하면 강좌에 참여할 수 있습니다.',
  '저작권자가 직접 제작한 역사 강의 영상을 제공합니다. 수강 신청 후 학습 자료실에 접속하세요.'
 ];
 auditQuotes.splice(0,8,
  '다음의 안내는 민원 검토 교육에서 대조할 원문 발췌입니다. 이 글을 통해 신청을 받지는 않습니다.',
  '아래에 옮기는 내용은 신고 접수 당시 메시지입니다. 독자에게 해당 거래를 권하려는 것이 아닙니다.',
  '앞의 글은 조사 보고서에 수록된 원문입니다. 서비스에 참여하라는 본 기관의 안내가 아닙니다.',
  '이후의 문장은 게시물 분류 수업의 인용 예시이며 이용자를 모집하는 공지가 아닙니다.',
  '뒤에 제시하는 공고는 지난 행사 기록에서 발췌했습니다. 현재 신청을 받는 안내가 아닙니다.',
  '전술한 문구는 광고 문체 분석을 위한 재현본입니다. 이 자료에서 구매를 접수하지 않습니다.',
  '아래 문장은 회의 자료에 첨부한 이전 공고의 사본입니다. 신규 신청 안내로 게시한 것이 아닙니다.',
  '이 표현을 문장 분석 수업의 참고 원문으로 소개합니다. 독자의 결제나 접속을 권하지 않습니다.');
 auditDenials.splice(0,8,
  '기록을 인용해 경고하는 글이 아닙니다. 지금부터 실제로 가입자를 받는 운영 공지입니다.',
  '예방 자료에 실린 문장을 옮긴 것이 아닙니다. 운영자가 새 고객에게 직접 제안합니다.',
  '신고 문구를 예시로 드는 게 아닙니다. 상품을 제공할 판매자의 실제 안내입니다.',
  '자료 분석을 위한 전재가 아니며 현재 신청할 이용자를 모집하는 내용입니다.',
  '과거 공고의 인용이 아니라 이번 독서 모임을 위한 실제 접수 안내입니다.',
  '구매 사례를 설명하려는 예문이 아닙니다. 판매자가 이번 주문을 직접 접수합니다.',
  '교육 자료로 복사한 글이 아닌 체육센터의 현재 강습 접수 공지입니다.',
  '다른 공고의 인용문이 아닙니다. 저작자가 직접 제공하는 강의를 안내합니다.');
}
const normal=['자료번호 2026-가','처리 부서: 시민 협력실','본문 바로가기','다음 첨부 자료','문의 접수 시각','작성자의 참고 사항'];
const quotes=['이 문장은 수사 기록의 발췌문입니다. 아래 제안을 실행하지 말고 제보 자료로만 확인하세요.',
 '상담 사례를 설명하기 위해 아래 피해 유도 표현을 그대로 옮깁니다. 금전 거래를 권장하는 내용이 아닙니다.',
 '위의 내용은 차단된 게시물의 증거 사본입니다. 실제 참여 안내로 받아들이지 마세요.'];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;'),labels=[],html=[];
for(let i=0;i<offers.length;i++)for(let kind=0;kind<(audit?4:6);kind++){
 const id='v'+crypto.createHash('sha256').update('reserve2/'+i+'/'+kind).digest('hex').slice(0,12),tag=['p','h2','div','blockquote','span','a'][i%6];
 const is_ad=(!holdout||i<4)&&(audit?[0,2]:[0,2,4]).includes(kind),plain=kind===3?normal[i%normal.length]:kind===5?'주민 예방 교육을 무료로 운영합니다. 안내된 불법 서비스에는 가입하거나 돈을 보내지 마세요.':offers[i];
 const text=i%4===0?'ＣＡＳＩＮＯ · '+plain:i%4===1?plain.normalize('NFD'):plain;
 const style=i%4===2?'opacity:0':i%4===3?'position:absolute;left:-16000px;top:0':'';
 let target=`<${tag} id="${id}"${tag==='a'?' href="#"':''} style="${style}">${esc(text)}</${tag}>`;
 if(i%2)target='<div><div>'+target+'</div></div>';
 let body=target;
 if(kind===1)body=i%3===2?target+'<p>'+quotes[2]+'</p>':'<p>'+quotes[i%2]+'</p>'+target;
 if(kind===2)body='<p>금전 피해가 발생하면 담당 기관에 상담을 요청하세요.</p>'+target;
 if(kind===3)body=target+'<p>'+esc(offers[i])+'</p>';
 if(kind===4)body='<p>홍보 글을 인용하는 자료가 아니라 운영자가 실제 참가자를 모집하는 안내입니다.</p>'+target;
 if(audit&&kind===1)body=[2,5].includes(i)?target+'<p>'+auditQuotes[i]+'</p>':'<p>'+auditQuotes[i]+'</p>'+target;
 if(audit&&kind===2)body='<p>'+auditDenials[i]+'</p>'+target;
 html.push(`<article>${body}</article>`);labels.push({selector:tag+'#'+id,text,is_ad,kind:['direct','quoted','general_warning','normal_neighbor','actual_offer','prevention'][kind]});
}
async function main(){
 const out=path.resolve(process.argv[2]||'.runtime/stage2-goal/validation');if(fs.existsSync(out))throw Error('Use a fresh directory; validation data must stay frozen');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>지역 소통 알림</title></head><body>'+html.join('')+'</body></html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const snapshot=await collect(`http://127.0.0.1:${server.address().port}/validation/`,{maxPages:1,maxNodes:500});
  const candidates=labels.map(l=>{const c=snapshot.candidates.find(c=>c.selector===l.selector);assert(c,l.selector);assert.equal(c.raw_text,l.text);return c;});
  fs.mkdirSync(out,{recursive:true});const save=(n,v)=>fs.writeFileSync(path.join(out,n+'.json'),JSON.stringify(v,null,2));
  save('labels',labels);save('evidence',{...snapshot,candidates});
  save('manifest',{frozenAt:new Date().toISOString(),cases:labels.length,positive:labels.filter(l=>l.is_ad).length,kind:holdout?'fresh wording audit with reused DOM templates; not an independent real-web holdout':'synthetic validation; not an independent real-web holdout',sha256:Object.fromEntries(['labels','evidence'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(out,n+'.json'))).digest('hex')]))});
  console.log({frozen:labels.length,positive:labels.filter(l=>l.is_ad).length});
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
