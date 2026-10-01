// Synthetic diagnostics. Gold is private and is never sent to the inference runner.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const splits={
 dev:{positive:[['house','H0USE','사람이 사는 집을 뜻하는 표기 {t}가 주거 안내문에 쓰였습니다.'],['river','R1VER','강물이 흐르는 하천을 {t}라고 적었습니다.'],['park','P4RK','나무와 산책로가 있는 공원을 {t}라고 적었습니다.'],['media','M3DIA','뉴스를 전달하는 매체를 가리키는 말로 {t}를 사용했습니다.'],['field','F1ELD','넓게 펼쳐진 들판을 설명하면서 {t}라고 적었습니다.'],['garden','G4RDEN','꽃과 나무를 가꾸는 정원을 {t}로 표기했습니다.'],['star','5TAR','밤하늘에 빛나는 별을 {t}라고 표현했습니다.'],['gifts','GIFT5','상자에 포장해 건네는 여러 선물을 {t}라고 적었습니다.']],
 literal:[['water','H2O','물 분자의 화학식은 {t}입니다.'],['business','B2B','기업 간 거래 방식을 {t}라고 표기했습니다.'],['robot','R2D2','로봇 캐릭터의 공식 이름은 {t}입니다.'],['aircraft','A320','항공기 기종은 {t}입니다.'],['quality','ISO9001','품질경영 인증 규격은 {t}입니다.'],['audio','MP3','음원 파일 형식은 {t}입니다.'],['graphics','RX7800','그래픽 장치의 모델 번호는 {t}입니다.'],['period','2026Q','년도별 장부 분류 코드는 {t}입니다.'],['river','R1VER','장치의 고정된 제품 식별번호는 {t}이며 영문과 숫자를 그대로 등록합니다.'],['field','F1ELD','업무 시스템에서 부여한 고유 관리번호는 {t}입니다.']],
 ambiguous:[['nova','N0VA'],['line','L1NE'],['mode','M0DE'],['vibe','V1BE']]},
 evaluation:{positive:[['coffee','C0FFEE','볶은 원두로 내린 음료를 {t}라고 적었습니다.'],['market','M4RKET','상인이 모여 물건을 파는 시장을 {t}라고 표현했습니다.'],['desert','D3SERT','비가 적고 모래가 넓게 펼쳐진 사막을 {t}라고 적었습니다.'],['window','W1NDOW','벽에 달아 빛과 공기가 통하게 하는 창문을 {t}라고 표현했습니다.'],['planet','PL4NET','별 주위를 도는 행성을 {t}라고 적었습니다.'],['fresh','FR3SH','갓 수확해 신선한 상태를 나타내는 말로 {t}를 썼습니다.'],['tree','7REE','줄기와 가지가 있는 나무를 {t}라고 적었습니다.'],['books','B00K5','여러 권의 책을 묶어 소개하는 목록에 {t}라고 적었습니다.']],
 literal:[['carbon','CO2','이산화탄소의 화학식은 {t}입니다.'],['consumer','B2C','기업과 소비자 사이의 거래 방식을 {t}라고 적었습니다.'],['certificate','X509','디지털 인증서 규격은 {t}입니다.'],['network','IPv6','인터넷 프로토콜 버전은 {t}입니다.'],['connector','USB3','장치 연결 인터페이스 규격은 {t}입니다.'],['paper','A4','문서 출력 용지 규격은 {t}입니다.'],['fiscal','2027R','회계년도별 기록 묶음의 분류 코드는 {t}입니다.'],['display','GTX1080','그래픽 장치의 모델 번호는 {t}입니다.'],['window','W1NDOW','장치의 고정된 제품 식별번호는 {t}이며 영문과 숫자를 그대로 등록합니다.'],['planet','PL4NET','업무 시스템에서 부여한 고유 관리번호는 {t}입니다.']],
 ambiguous:[['form','F0RM'],['solo','S0LO'],['pine','P1NE'],['rise','R1SE']]}
};
const families=x=>new Set(Object.values(x).flat().map(r=>r[0]));
if([...families(splits.dev)].some(f=>families(splits.evaluation).has(f)))throw Error('Family leakage');
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(const [split,groups]of Object.entries(splits)){
 const dir=path.join(__dirname,split);if(fs.existsSync(dir))throw Error('Do not overwrite a sealed dataset');fs.mkdirSync(dir,{recursive:true});
 const rows=[];
 for(const [kind,items]of Object.entries(groups))for(const [family,token,template]of items)for(const context of ['ad','prevention']){
  const text=(template||'게시물에 표시된 이름은 {t}입니다.').replace('{t}',token)+(context==='ad'?' 이 표기를 내건 사설 도박방에 가입하고 현금을 입금하세요.':' 이 표기는 불법 광고 예방 교육 자료에서 다루는 예시입니다.');
  const id='d'+crypto.createHash('sha256').update(split+'|'+family+'|'+kind+'|'+context).digest('hex').slice(0,12);
  rows.push({family,token,context,text,classification:kind==='positive'?'substitution':kind==='literal'?'literal':'uncertain',selector:'p#'+id,id,pair:family+'|'+kind});
 }
 rows.sort((a,b)=>a.id.localeCompare(b.id));
 const html='<!doctype html><html lang="ko"><meta charset="utf-8"><title>표기 대조 게시판</title><body><header><h1>공공 사이트 표기 대조 게시판</h1></header><main>'+rows.map((r,i)=>`<article><header>게시물 ${i+1}</header><p id="${r.id}">${esc(r.text)}</p></article>`).join('')+'</main></body></html>';
 fs.writeFileSync(path.join(dir,'index.html'),html);fs.writeFileSync(path.join(dir,'labels.json'),JSON.stringify(rows,null,2));
}
console.log('Created 44 development and 44 evaluation cases; word families disjoint. No API calls.');
