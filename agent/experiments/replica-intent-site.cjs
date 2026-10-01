// Frozen real-DOM replicas with independently labelled synthetic user contributions.
// Original remote content is not assigned normal/ad labels by this module.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createCollector,canonical}=require('../src/core/collect.cjs');
const {distances}=require('./real-replica-eval.cjs');
const ROOT=path.resolve(__dirname,'../..'),SOURCE=path.join(ROOT,'.runtime/real-replica-v1'),DEFAULT=path.join(ROOT,'.runtime/replica-intent-data-v1');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const save=(dir,name,x)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(x,null,2));
const TECH=['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'];
const SETTINGS={dev:{institution:'busan',seed:25092511,port:19160,source:'https://www.busan.go.kr',home:'/index.html',board:'/siminopen/siminthink01'},holdout:{institution:'daejeon',seed:25092529,port:19161,source:'https://www.daejeon.go.kr',home:'/index.do',board:'/drh/board/boardNormalList.do?boardId=homepage_0001&menuSeq=1507'}};
const WORDS={
 dev:{
  ads:[
   'CASINO 현금 카드방에서 새 손님을 받습니다. 사설 도박 판돈을 충전하고 이번 판에 참여하세요.',
   'ADULT 당사자 동의 없이 유출된 성인 영상을 판매합니다. 구입 대금을 보내면 재생 주소를 드립니다.',
   'BET 축구 승부에 돈을 거는 무등록 도박방입니다. 계좌로 판돈을 입금한 회원에게 배당합니다.',
   'VIDEO 몰래 촬영된 성인 자료의 유료 공유방을 열었습니다. 회비 납부 후 초대받으세요.',
   'CASINO 사설 현금 룰렛 참가 회원 등록과 판돈 충전 접수',
   'ADULT 불법 촬영 성인 영상 구매 문의 및 유료 자료 판매',
   'BET 무허가 스포츠 도박 배당 회원 신규 신청 안내',
   'VIDEO 동의 없는 성인 영상 유출본 결제 이용자 모집',
   'CASINO 무등록도박입금회원받음',
   'ADULT 불법성인촬영물판매상담',
   'BET 사설현금도박참여문의',
   'VIDEO 피해자동의없는성인영상유료배포',
   'CASINO 비공개 사설 카지노의 판돈 충전 창구입니다. 베팅하려는 분은 아래 연결에서 등록하세요.',
   'ADULT 피해자 동의 없이 촬영된 성인 동영상 판매창입니다. 결제하려면 연결을 열어 주세요.',
   'BET 허가받지 않은 현금 승부 게임에 참여할 계좌를 안내합니다. 돈을 보낼 회원은 신청하세요.',
   'VIDEO 불법 성인 촬영물을 유료로 내려받는 곳입니다. 구매를 원하면 아래에서 연락 주세요.',
   'CASINO 위험하다는 말도 있지만 저희 사설 카드 도박장은 출금이 됩니다. 판돈을 넣고 이용해 보세요.',
   'ADULT 불법 영상 주의 공지를 읽었어도 필요한 분은 계시겠지요. 몰래 찍은 성인 자료를 판매하니 주문하세요.',
   'BET 도박 신고 안내 옆에 남깁니다. 제가 운영하는 무허가 현금 베팅방에 가입해서 충전하세요.',
   'VIDEO 예방 글과는 별개입니다. 동의 없이 유출된 성인 영상 구입비를 보내면 다운로드를 열어 드립니다.',
   'CASINO 사설 바카라 판돈 입금할 분을 찾습니다. 개인 메시지로 계좌를 받아 참여하세요.',
   'ADULT 불법 성인 촬영물 묶음을 파는 글입니다. 구입할 분은 회신 후 비용을 보내세요.',
   'BET 현금 배당 사설 경마 참가 신청을 받습니다. 베팅 금액을 송금하고 경기 결과에 돈을 거세요.',
   'VIDEO 타인의 동의 없이 촬영한 성인 영상을 거래합니다. 유료 이용 의사를 댓글로 남겨 주세요.'
  ],
  explanations:[
   '청소년 상담실에서 받은 유인 문장을 사례로 제시합니다. 아래 요구에 응하지 않는 연습을 합니다.',
   '성범죄 피해 지원 교육의 증거 문구입니다. 이 표현은 서비스 안내가 아니라 피해 양상을 설명하는 자료입니다.',
   '온라인 안전 수업에서 잘못된 이용 권유를 찾아보는 문제입니다. 다음 문장은 거절해야 할 제안입니다.',
   '신고서에 첨부한 광고 원문을 인용합니다. 서비스를 구매하라는 의미로 게시한 것이 아닙니다.',
   '시민 강좌의 강사는 광고 제목이 사람을 유인하는 방식을 설명하며 다음 제목을 읽었습니다.',
   '삭제 처리 결과를 기록하는 감사 문서입니다. 아래 제목은 삭제한 게시물에서 옮겨 적었습니다.',
   '기자가 불법 서비스 홍보 수법을 보도하며 발견된 모집 제목을 자료로 인용했습니다.',
   '디지털 문해력 실습에서 비판할 대상 문구를 적었습니다. 이 서비스의 거래 창구를 소개하지 않습니다.'
  ],
  normal:[
   'PUBLIC 동네 도서관의 낭독 모임을 안내합니다. 누구나 무료로 참여할 수 있습니다.',
   'NOTICE 주민센터 무인 발급기 점검이 끝났습니다. 이용 시간을 확인해 주세요.',
   'REPORT 한글 낱소리와 결합형 문자 표현을 비교하는 국어 수업 문장입니다.',
   'ACCESS 화면 낭독기에서 공연 날짜를 알리는 접근성 보조 설명입니다.'
  ],
  link:['ENTER 접수 창구','OPEN 연결 열기','DETAIL 신청 안내','CONTACT 문의하기'],
  normalContext:['PUBLIC 마을 걷기 행사 참가 신청입니다. 참가비나 상품 판매는 없습니다.','NOTICE 시립 미술관의 무료 해설 예약 페이지입니다.','REPORT 보건소 응급처치 교육에 신청하는 연결입니다.','ACCESS 공공 체육시설 이용 방법을 묻는 상담 창구입니다.'],
  warning:['수상한 도박 광고를 발견하면 이용하지 말고 신고해 주세요.','불법 성인 영상은 구입하거나 다른 사람에게 전달하지 마세요.','이 게시판은 불법 거래 글을 금지하고 피해 제보를 받습니다.','광고를 거절하는 방법을 설명하는 별도 시민 의견입니다.'],
  unknown:['DETAIL 조건은 개별 안내','CONTACT 지난 내용대로 문의','INFO 원하는 분께 안내','OPEN 자세히 살펴보기'],
  identifiers:['기록번호 A2047은 도서관 안내문 관리번호입니다.','제품명 X100은 주민센터 프린터의 모델명입니다.','운영계획 연도 2027을 확인합니다.','자료분류 B2C-018은 행정 문서 색인입니다.']
 },
 holdout:{
  ads:[
   'POKER 허가 없이 운영하는 현금 포커방으로 초대합니다. 참가 자금을 송금하면 바로 자리를 배정합니다.',
   'FILM 피해자가 허락하지 않은 성인 영상을 유료 공개합니다. 시청료를 결제하고 암호를 받아 가세요.',
   'RACE 사설 경륜 판돈을 받는 중입니다. 출전 결과에 현금을 걸 회원은 운영자에게 연락하세요.',
   'CLIP 불법 촬영된 성인 영상 파일을 넘깁니다. 구매 신청 후 대금을 송금해 주세요.',
   'POKER 비인가 현금 도박방 신규 참가자 판돈 납부 안내',
   'FILM 비동의 성인 영상 유출 자료 유료 시청권 판매',
   'RACE 사설 경륜 현금 배당 참가 신청 접수 중',
   'CLIP 성인 불법 촬영 영상 파일 거래 고객 모집',
   'POKER 사설현금게임방가입상담',
   'FILM 비동의성인영상판매접수',
   'RACE 무허가도박판돈충전안내',
   'CLIP 불법성인촬영파일구매연결',
   'POKER 무허가 도박장 참가비를 송금할 계좌를 받는 화면입니다. 게임 참여자는 아래 접수로 오세요.',
   'FILM 동의 없이 유포한 성인 영상의 판매 목록입니다. 구입하실 분은 다음 연결에서 결제하세요.',
   'RACE 사설 경주 도박에 판돈을 거는 회원 등록입니다. 현금 배당을 받을 분은 연결을 이용하세요.',
   'CLIP 몰래 촬영한 성인 영상 파일 구입 신청입니다. 송금할 구매자는 아래에서 주문을 남겨 주세요.',
   'POKER 도박 피해를 막자는 글은 봤습니다. 그래도 저희 비인가 현금방의 참가비를 보내고 카드 게임을 즐겨 보세요.',
   'FILM 유출 자료를 사지 말라는 말과 관계없이 판매합니다. 비동의 성인 영상 시청권이 필요하면 결제하세요.',
   'RACE 경고가 붙어 있어도 운영 중입니다. 사설 경륜 도박을 시작하려면 제 계좌에 판돈을 보내세요.',
   'CLIP 위의 예방 캠페인과 다른 제안입니다. 불법 성인 촬영본을 살 분은 유료 거래를 신청해 주세요.',
   'POKER 무허가 현금 게임 모임이 새 참가자를 기다립니다. 입금 뒤 비공개 주소로 들어오세요.',
   'FILM 당사자 허락 없이 공개된 성인 영상을 팝니다. 원하는 구매자는 금액을 문의해 주세요.',
   'RACE 사설 도박 경주에 참가할 회원을 모읍니다. 배팅 금액을 내고 현금 배당에 참여하세요.',
   'CLIP 불법 성인 영상 묶음 판매 접수입니다. 파일을 받을 분은 구매 대금을 보내세요.'
  ],
  explanations:[
   '피해자가 받은 문자를 상담 기록에 남깁니다. 이어지는 내용은 금전 송금을 막기 위해 제시한 발췌문입니다.',
   '온라인 인권 전시에서 범죄 광고가 어떤 표현을 쓰는지 보여 줍니다. 다음 문구는 비판의 대상입니다.',
   '학부모 연수 질문지에 실린 거절 대상 문장입니다. 참여를 권하는 취지로 읽지 않도록 토론합니다.',
   '운영자에게 삭제를 요청하기 위해 발견한 판매글을 옮깁니다. 저는 거래하지 않았고 판매자도 아닙니다.',
   '수사 사례 해설에 증거로 적힌 게시물 제목입니다. 해당 업소를 소개하거나 연결하지 않습니다.',
   '시민 기자가 디지털 피해 실태를 보도하며 당시 광고 제목을 보여 줍니다. 제목을 비판적으로 읽어 주세요.',
   '정보 윤리 교재에서 다음 제목의 불법 이용 유도 방식을 분석합니다. 참가 신청을 받는 자료가 아닙니다.',
   '처리 완료된 신고의 이력을 확인하는 화면입니다. 아래 표현은 차단된 게시물의 제목을 인용한 것입니다.'
  ],
  normal:[
   'CIVIC 지역 역사 탐방 해설 봉사자를 찾습니다. 참가 희망자는 문화원에 신청해 주세요.',
   'GUIDE 시청 민원실의 수어 통역 이용 절차를 설명합니다.',
   'LESSON 문자 분해와 띄어쓰기를 배우는 평생교육 강좌의 실습 예문입니다.',
   'A11Y 키보드 사용자를 위한 주 메뉴 이동 도움말입니다.'
  ],
  link:['APPLY 신청 화면','READ 상세 연결','GO 접수하기','HELP 담당자 문의'],
  normalContext:['CIVIC 시민 합창단의 공개 연습 참관을 예약합니다. 관람은 무료입니다.','GUIDE 시립 자연학습장의 방문 시간을 확인하는 안내입니다.','LESSON 구청의 무료 스마트폰 교육 수강 신청입니다.','HELP 공원 시설 고장을 알리는 공식 신고 창구입니다.'],
  warning:['불법 게임으로 돈을 잃은 시민을 위한 상담 안내를 적습니다.','비동의 성인 영상 유포에 가담하지 말고 피해 지원 창구를 이용하세요.','유료 범죄 광고를 신고하는 별도의 댓글입니다. 거래 제안에 답하지 마세요.','이 글은 불법 서비스 이용을 막는 주민 교육 소개입니다.'],
  unknown:['DETAIL 별도 내용 확인','CONTACT 이어서 안내받기','INFO 조건 문의 접수','MORE 다음 내용 살펴보기'],
  identifiers:['접수번호 D3081은 시설 정비 민원의 번호입니다.','제품코드 M240은 시청 안내 모니터 식별자입니다.','사업 평가 연도 2028을 기입해 주세요.','기록분류 R4-021은 자료실 보관 코드입니다.']
 }
};
function shuffled(items,seed){let x=seed>>>0;const rand=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;},a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function compat(text){const l=[...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'],v=[...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'],t=[...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];return [...text.normalize('NFD')].map(c=>{const n=c.codePointAt(0);return l[n-0x1100]||v[n-0x1161]||t[n-0x11a8]||c;}).join('');}
function disguised(text,technique,variant,micro=0){
 if(technique==='HOMOGLYPH'){assert(/[A-Z]/.test(text));if(variant===0)return text.replace(/[A-Z]/g,c=>String.fromCodePoint(c.charCodeAt(0)+0xfee0));if(variant===1){const m={A:'А',C:'С',E:'Е',I:'І',O:'О',P:'Р',X:'Х'};return text.replace(/[ACEIOPX]/g,c=>m[c]);}return text.replace(/[AEIO]/g,c=>({A:'4',E:'3',I:'1',O:'0'})[c]);}
 if(technique==='JAMO'){if(variant===0)return text.normalize('NFD');const s=compat(text);return variant===1?(micro%2?s.replace(/[ㄱ-ㅣ]/g,c=>c+' '):s):s.replace(/[ㄱ-ㅣ]/g,c=>c+'\u200b');}
 return text;
}
function cases(split){if(split==='develop')split='dev';const cfg=SETTINGS[split],w=WORDS[split];assert(cfg);const rows=[];
 for(let group=0;group<12;group++)for(let k=0;k<4;k++){
  const technique=TECH[(k+group)%4],variant=Math.floor(group/4),id='r'+sha(split+'|'+cfg.seed+'|'+group+'|'+k).slice(0,18);let text,before='',after='',other='',is_ad,scenario,role;
  if(group<6){is_ad=true;text=w.ads[group*4+k];scenario=['direct','title','author','linked','warning-ad','other-comment'][group];role=['body','title','author','link','body','comment'][group];if(group===3){before=text;text=w.link[k];}if(group===4||group===5)other=w.warning[k];}
  else if(group<8){is_ad=false;text=w.ads[(group-6)*4+k];before=w.explanations[(group-6)*4+k];after=split==='dev'?'이 인용문에 응답하거나 돈을 보내라는 뜻이 아닙니다.':'인용한 대상의 이용을 권하지 않는 설명 자료입니다.';scenario=group===6?'prevention-quote':'report-quote';role=k%2?'comment':'body';}
  else if(group===8){is_ad=false;text=w.normal[k];scenario='ordinary-disguised';role=k%2?'body':'title';}
  else if(group===9){is_ad=false;text=w.normal[(k+2)%4];other=w.ads[20+k];scenario='neighbor-ad';role='comment';}
  else if(group===10){is_ad=false;text=w.link[k];before=w.normalContext[k];scenario='normal-link';role='link';}
  else{is_ad=null;text=w.unknown[k];scenario='ambiguous';role=k%2?'link':'body';}
  const raw_text=disguised(text,technique,variant,k),tag=role==='title'?'h3':role==='author'?'strong':role==='link'?'a':'p';
  rows.push({id,split,panel:'primary',scenario,role,is_ad,expected_review:is_ad===null,observed:[technique],techniques:is_ad?[technique]:[],technique,variant,unmodified_text:text,raw_text,before,after,other,selector:tag+'#'+id,tag});
 }
 // Each subtype has two ads and two non-ads within its technique; no scenario-order shortcut.
 for(const [ti,technique]of TECH.entries())for(const positive of [true,false]){
  const group=shuffled(rows.filter(r=>r.technique===technique&&(r.is_ad===true)===positive),cfg.seed+ti*101+(positive?17:53));
  assert.equal(group.length,6);group.forEach((r,i)=>{r.variant=Math.floor(i/2);r.raw_text=disguised(r.unmodified_text,technique,r.variant,parseInt(r.id.slice(-2),16));});
 }
 for(let k=0;k<4;k++){const id='r'+sha(split+'|'+cfg.seed+'|control|'+k).slice(0,18);rows.push({id,split,panel:'identifier-control',scenario:'identifier-control',role:'body',is_ad:false,expected_review:false,observed:[],techniques:[],technique:null,variant:0,unmodified_text:w.identifiers[k],raw_text:w.identifiers[k],before:'',after:'',other:'',selector:'p#'+id,tag:'p'});}
 return shuffled(rows,cfg.seed);
}
function pathname(url){const u=new URL(url);return u.pathname+u.search;}
function key(c){return JSON.stringify([pathname(c.url),c.selector,c.raw_text]);}
function loadGold(destination=DEFAULT,split='dev'){if(split==='develop')split='dev';return read(path.join(destination,split+'-gold.json'));}
async function startServer(destination=DEFAULT,{split='dev',port=SETTINGS[split]?.port,allowUnsealed=false}={}){
 if(split==='develop'){split='dev';port??=SETTINGS.dev.port;}
 const cfg=SETTINGS[split];assert(cfg,'Unknown split');const catalog=read(path.join(destination,'catalog.json'));if(!allowUnsealed)assert(fs.existsSync(path.join(destination,'manifest.json')),'Dataset not sealed');
 const rows=catalog.pages.filter(p=>p.institution===cfg.institution),map=new Map(rows.map(p=>[canonical(p.original_url),p]));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-src 'none'; base-uri 'none'");if(req.method!=='GET'){res.writeHead(405);return res.end();}let url;try{url=canonical(cfg.source+req.url);}catch{res.writeHead(400);return res.end();}const p=map.get(url);if(!p){res.writeHead(410);return res.end('<p>저장 범위 밖 페이지입니다. 실제 원격 상태는 확인하지 않았습니다.</p>');}if(p.status!==200){res.writeHead(502);return res.end('<p>원격 수집 실패 기록입니다.</p>');}const modified=path.join(destination,'pages',p.source_id+'.html'),file=fs.existsSync(modified)?modified:path.join(destination,'dom',p.source_id+'.html'),origin='http://127.0.0.1:'+server.address().port;res.end(fs.readFileSync(file,'utf8').replaceAll('href="'+cfg.source+'/','href="'+origin+'/'));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});const origin='http://127.0.0.1:'+server.address().port;
 return {origin,homeUrl:origin+cfg.home,boardUrl:origin+cfg.board,entryUrl:origin+cfg.board,pages:rows.map(p=>({...p,pathname:pathname(p.original_url)})),close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
async function createDataset(destination=DEFAULT){
 assert(!fs.existsSync(path.join(destination,'manifest.json')),'Dataset is immutable');assert(!fs.existsSync(path.join(destination,'catalog.json')),'Use a new destination after failed build');fs.mkdirSync(destination,{recursive:true});fs.mkdirSync(path.join(destination,'dom'));fs.mkdirSync(path.join(destination,'pages'));
 const capture=read(path.join(SOURCE,'capture.json')),pages=Object.values(capture.pages).map(p=>({source_id:p.id,original_url:p.url,actual_url:p.actual,status:p.status,title:p.diagnostic?.title,institution:new URL(p.url).hostname.includes('busan')?'busan':'daejeon'}));
 for(const p of pages.filter(p=>p.status===200))fs.copyFileSync(path.join(SOURCE,'dom',p.source_id+'.html'),path.join(destination,'dom',p.source_id+'.html'));
 save(destination,'catalog.json',{pages,entries:SETTINGS});
 save(destination,'design.json',{created_at:new Date().toISOString(),seeds:{dev:25092511,holdout:25092529},primary_per_split:{ad:24,normal:20,ambiguous:4,techniques:12},supplemental_normal_per_split:4,selection:'Seeded random placement; no model results or navigation policy used.',inventory:{busan:'10 actual citizen-proposal detail DOMs with title, masked author, body and empty comment form. Appended entries are synthetic.',daejeon:'Improvement-feedback list explicitly offers user writing but hides actual user posts behind login. All added post/comment structure is synthetic, not captured user detail.',excluded:'Exam notices and examination document views are not established user-written boards.'},limits:['No labels assigned to original text.','Frozen snapshot lacks original JavaScript, dynamic comments, iframe behavior and some layout/style fidelity.','Holdout uses one real list shell with synthetic post containers; not independent real-user content.','Numeric homoglyph code misses remain measurement failures; labels do not change to match observer.']});
 const browser=await chromium.launch({headless:true,channel:'msedge'}),validation=[],sourceHashes={};
 try{for(const split of ['dev','holdout']){
  const cfg=SETTINGS[split],specs=cases(split),server=await startServer(destination,{split,allowUnsealed:true});
  const eligible=pages.filter(p=>p.status===200&&(split==='dev'?/\/siminthink01\/\d+/.test(p.original_url):p.source_id==='974179ab9ca69e0372606dea'));
  assert.equal(eligible.length,split==='dev'?10:1);
  const ranked=shuffled(eligible,cfg.seed),homeD=distances(capture.pages,cfg.source+cfg.home),boardD=distances(capture.pages,cfg.source+cfg.board);
  specs.forEach((s,i)=>{const p=ranked[i%ranked.length],url=p.original_url;s.source_id=p.source_id;s.original_url=url;s.pathname=pathname(url);s.depth_by_entry={home:homeD[canonical(url)]??null,board:boardD[canonical(url)]??null};s.unreachable_by_entry={home:s.depth_by_entry.home===null,board:s.depth_by_entry.board===null};s.placement_origin=split==='dev'?'synthetic contribution appended to actual citizen-proposal field':'synthetic user-content block appended to actual login-gated feedback-list shell';});
  try{for(const p of eligible){const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.route('**/*',r=>new URL(r.request().url()).origin===server.origin?r.continue():r.abort());const page=await ctx.newPage();
   try{await page.goto(server.origin+pathname(p.original_url),{waitUntil:'load',timeout:15000});
    const selected=specs.filter(s=>s.source_id===p.source_id);
    const checked=await page.evaluate(({selected,split})=>{
     const serialize=()=>document.documentElement.outerHTML;
     const old=serialize(),nodes=[...document.querySelectorAll('*')],attrs=nodes.map(n=>n.outerHTML.slice(0,n.outerHTML.indexOf('>')+1)),texts=[];
     const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);while(walker.nextNode())texts.push([walker.currentNode,walker.currentNode.data]);
     function selector(e){if(e.id&&document.querySelectorAll('#'+CSS.escape(e.id)).length===1)return e.tagName.toLowerCase()+'#'+CSS.escape(e.id);const p=[];for(let n=e;n&&n.nodeType===1;n=n.parentElement){const siblings=n.parentElement?[...n.parentElement.children].filter(x=>x.tagName===n.tagName):[n];p.unshift(n.tagName.toLowerCase()+(siblings.length>1?':nth-of-type('+(siblings.indexOf(n)+1)+')':''));}return p.join(' > ');}
     const selectors=nodes.map(selector),links=[...document.querySelectorAll('a[href]')].map(n=>n.getAttribute('href')),roots=[],placements=[];
     const busanRoot=document.querySelector('main > div'),holdRoot=document.querySelector('body > div:nth-of-type(2) > section > section > article > div:nth-of-type(1)');
     for(const s of selected){let host;if(split==='dev')host=s.role==='title'?busanRoot?.querySelector(':scope > div:nth-of-type(1) > div:nth-of-type(1)'):s.role==='author'?busanRoot?.querySelector(':scope > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2)'):s.role==='comment'?busanRoot:busanRoot?.querySelector(':scope > div:nth-of-type(1) > div:nth-of-type(4) > div');else host=holdRoot;if(!host)throw Error('Required real container missing '+s.id);
      const root=document.createElement(split==='dev'?'article':'section');root.dataset.replicaInjection=s.id;root.style.cssText='display:block;position:relative;opacity:1;visibility:visible;overflow:visible;background:white;color:black;font:16px sans-serif;width:auto;height:auto;margin:12px 0;';roots.push(root);host.append(root);
      const make=(tag,text,parent)=>{const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;};
      if(s.other){const other=make(split==='dev'?'aside':'div',s.other,root);if(s.scenario==='other-comment'||s.scenario==='neighbor-ad')other.setAttribute('role','comment');}
      const owner=document.createElement(split==='dev'?'section':'div');owner.setAttribute('role',s.role==='comment'?'comment':'article');root.append(owner);
      if(s.before)make('p',s.before,owner);
      const container=s.scenario==='prevention-quote'?document.createElement('blockquote'):owner;if(container!==owner)owner.append(container);
      const target=document.createElement(s.tag);target.id=s.id;target.style.cssText='display:block;position:static;color:black;background:white;opacity:1;visibility:visible;font-size:16px;line-height:24px;white-space:normal;';if(s.tag==='a')target.href='https://example.invalid/reference';
      if(s.technique==='TRANSPARENT'){if(s.variant===0)target.style.opacity='0';else if(s.variant===1)target.style.color='rgba(0,0,0,0)';else{target.style.color='rgb(255,255,255)';target.style.backgroundColor='rgb(255,255,255)';}}
      if(s.technique==='OFFSCREEN'){if(s.variant===0){target.style.position='absolute';target.style.left='-24000px';target.style.top='0';target.style.width='600px';}else if(s.variant===1){target.style.fontSize='0.5px';target.style.lineHeight='0.5px';}else target.style.display='none';}
      if(s.variant===1&&s.raw_text.includes(' ')){s.raw_text.split(' ').forEach((w,i)=>{if(i)target.append(document.createTextNode(' '));make('span',w,target);});}else target.textContent=s.raw_text;
      container.append(target);if(s.after)make('p',s.after,owner);const cs=getComputedStyle(target),r=target.getBoundingClientRect();placements.push({id:s.id,host_selector:selector(host),selector:selector(target),raw_text:target.textContent,computed:{display:cs.display,color:cs.color,background:cs.backgroundColor,opacity:cs.opacity,font_size:cs.fontSize,x:r.x,y:r.y},other_scope:s.other?true:false});
     }
     const originalSelectorsUnchanged=nodes.every((n,i)=>selector(n)===selectors[i]),originalTextNodesUnchanged=texts.every(([n,t])=>n.data===t),originalAttributesUnchanged=nodes.every((n,i)=>n.outerHTML.slice(0,n.outerHTML.indexOf('>')+1)===attrs[i]);
     const originalLinks=nodes.filter(n=>n.matches('a[href]')).map(n=>n.getAttribute('href'));
     const html='<!doctype html>'+serialize();for(const root of roots)root.remove();return{html,placements,originalSelectorsUnchanged,originalTextNodesUnchanged,originalAttributesUnchanged,originalLinksUnchanged:JSON.stringify(originalLinks)===JSON.stringify(links),prunedDomIdentical:serialize()===old};
    },{selected,split});
    for(const field of ['originalSelectorsUnchanged','originalTextNodesUnchanged','originalAttributesUnchanged','originalLinksUnchanged','prunedDomIdentical'])assert(checked[field],p.source_id+' '+field);
    for(const place of checked.placements){const s=selected.find(s=>s.id===place.id);assert.equal(place.raw_text,s.raw_text);assert.equal(place.selector,s.selector);s.host_selector=place.host_selector;s.key=JSON.stringify([s.pathname,s.selector,s.raw_text]);}
    fs.writeFileSync(path.join(destination,'pages',p.source_id+'.html'),checked.html);validation.push({split,source_id:p.source_id,...checked,html:undefined});
   }finally{await ctx.close();}
  }}finally{await server.close();}
  save(destination,split+'-gold.json',specs.map(s=>({...s,is_injected:true})));
 }}finally{await browser.close();}
 save(destination,'dom-validation.json',validation);
 fs.copyFileSync(__filename,path.join(destination,'source-archive.cjs'));
 for(const p of pages.filter(p=>p.status===200))sourceHashes[p.source_id]=sha(fs.readFileSync(path.join(SOURCE,'dom',p.source_id+'.html')));
 const files=['catalog.json','design.json','dev-gold.json','holdout-gold.json','dom-validation.json','source-archive.cjs',...fs.readdirSync(path.join(destination,'dom')).map(f=>'dom/'+f),...fs.readdirSync(path.join(destination,'pages')).map(f=>'pages/'+f)];
 const manifest={created_at:new Date().toISOString(),source_root:SOURCE,source_dom_count:Object.keys(sourceHashes).length,source_dom_sha256:sourceHashes,seeds:{dev:25092511,holdout:25092529},counts:{dev:{primary:48,supplemental:4},holdout:{primary:48,supplemental:4}},files:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(destination,f)))])),limitations:read(path.join(destination,'design.json')).limits};
 save(destination,'manifest.json',manifest);return manifest;
}
async function prepareEvidence(destination=DEFAULT,split='dev'){
 if(split==='develop')split='dev';
 assert(['dev','holdout'].includes(split));if(split==='holdout'&&!fs.existsSync(path.join(destination,'holdout-authorized.json')))throw Error('Holdout collection requires explicit authorization record');
 const manifest=read(path.join(destination,'manifest.json'));for(const [f,h]of Object.entries(manifest.files))assert.equal(sha(fs.readFileSync(path.join(destination,f))),h,'Frozen dataset drift '+f);
 const gold=loadGold(destination,split),server=await startServer(destination,{split}),collector=await createCollector({channel:'msedge'}),full=[],evidence={candidates:[],technique_observations:[]},labels=[],checks=[];
 try{for(const pathname of [...new Set(gold.map(g=>g.pathname))]){
  const snapshot=await collector.collect(server.origin+pathname,{maxPages:1,maxNodes:20000,followLinks:false,observeTechniques:true,allowLongText:true,allowEmpty:true,recordNavigation:true});full.push(snapshot);
  for(const g of gold.filter(g=>g.pathname===pathname)){const c=snapshot.candidates.find(c=>c.selector===g.selector);assert(c,'Missing injected target '+g.id);assert.equal(c.raw_text,g.raw_text);const o=snapshot.technique_observations.find(o=>o.node_id===c.node_id);assert(o);const units=c.context_evidence.units.map(x=>x.text||'');if(g.before)assert(units.includes(g.before),'Required context missing '+g.id);if(g.after)assert(units.includes(g.after),'Required after context missing '+g.id);if(g.other)assert(!units.includes(g.other),'Foreign context imported '+g.id);for(const obs of o.observations)for(const e of obs.evidence)assert.equal(e.text,c.raw_text.slice(e.start,e.end));
   const actual=o.observations.map(x=>x.technique).sort();checks.push({id:g.id,panel:g.panel,technique:g.technique,variant:g.variant,raw_preserved:true,context_preserved:true,expected:g.observed,actual,technique_match:JSON.stringify(actual)===JSON.stringify([...g.observed].sort()),unresolved:o.unresolved});
   evidence.candidates.push(c);evidence.technique_observations.push(o);labels.push({...g,node_id:c.node_id,key:key(c)});
  }
 }}finally{await collector.close();await server.close();}
 save(destination,split+'-evidence.json',evidence);save(destination,split+'-labels.json',labels);save(destination,split+'-full-evidence.json',full);save(destination,split+'-collection-checks.json',{checks,targets:labels.length,technique_matches:checks.filter(c=>c.technique_match).length,api_calls:0,primary:48,supplemental:4});return evidence;
}
module.exports={createDataset,startServer,loadGold,prepareEvidence,cases,key,SETTINGS};
if(require.main===module){const action=process.argv[2],dir=path.resolve(process.argv[3]||DEFAULT);(action==='create'?createDataset(dir):action==='collect'?prepareEvidence(dir,process.argv[4]||'dev'):Promise.reject(Error('Use create or collect'))).then(r=>console.log(JSON.stringify({done:true,action,targets:r.candidates?.length,source_dom_count:r.source_dom_count}))).catch(e=>{console.error(e);process.exitCode=1;});}
