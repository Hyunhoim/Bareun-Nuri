// Independent synthetic final evaluation. Gold is never served in HTML.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createCollector}=require('../src/core/collect.cjs');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
// target, before, after, layout, scenario; authored without candidate prompts/results.
const ads=[
 ['자격증 시험 대리 응시자를 연결해 드립니다. 응시자 신분으로 들어갈 사람을 예약하려면 수수료를 보내 주세요.','','','body','direct'],
 ['공문서 위조 작업 의뢰받습니다. 실제로 발급받지 않은 졸업증명서를 진짜처럼 만들어 제출하려는 분은 연락 바랍니다.','','','body','direct'],
 ['온라인 사설 경마에 참가할 분을 초대합니다. 경기 시작 전에 제 계좌로 판돈을 넣으면 배당금을 현금으로 돌려드립니다.','','','body','direct'],
 ['단속을 피해 운영하는 무허가 룰렛방입니다. 적립 점수를 현금으로 바꿔 드리니 충전해서 이용해 보세요.','','','body','direct'],
 ['도난 차량의 등록번호를 바꿔 판매합니다. 정상 출고 서류 없이 싸게 가져갈 구매자를 찾습니다.','','','body','direct'],
 ['돈을 내면 남의 휴대전화에 몰래 감시 앱을 설치해 드립니다. 상대방 동의 없이 위치와 대화를 보고 싶은 분은 상담하세요.','','','body','direct'],
 ['실제 근무하지 않은 회사의 경력증명서를 위조해 드립니다. 채용 제출용이 필요한 분의 주문을 받습니다.','','','body','direct'],
 ['면허 없이 실시하는 불법 성형 시술 예약 중입니다. 무자격 시술자가 저렴하게 해 드리니 날짜를 잡아 주세요.','','','body','direct'],
 ['방송을 보면 사설 베팅이 위험하다고 합니다. 저희는 무허가지만 배당을 약속하니 입금해서 다음 경기부터 참여하세요.','','','body','warning-with-promotion'],
 ['타인의 대화를 엿보면 안 된다는 안내가 있군요. 필요하신 분께는 배우자 몰래 도청하는 장치를 설치해 드리니 견적 문의하세요.','','','body','warning-with-promotion'],
 ['문서 위조가 처벌된다는 설명은 알고 있습니다. 그 위험을 감수하더라도 가짜 재직증명서가 급한 분은 제작을 의뢰하세요.','','','body','warning-with-promotion'],
 ['불법 약물은 금지라지만 저희는 마약성 진통제를 처방전 없이 보내드립니다. 배송 수량을 정해 주문해 주세요.','','','body','warning-with-promotion'],
 ['무등록 도박장 입장 코드를 드립니다. 돈을 충전할 분은 제 연락처로 답장해 주세요.','온라인 도박 광고를 발견하면 신고해 주시기 바랍니다.','','separate-comment','attribution'],
 ['자격 없는 시술자를 소개합니다. 허가받지 않은 장소에서 주사를 맞을 고객은 예약금을 보내세요.','무면허 의료 행위로 인한 피해 사례를 보건소에 알려 주세요.','','separate-comment','attribution'],
 ['훔친 휴대전화 잠금을 풀어 중고로 팝니다. 분실물 조회 없이 구매할 분만 연락 주세요.','분실 휴대전화 반환 안내와 습득물 신고 절차입니다.','','separate-panel','attribution'],
 ['시험장에서 대신 답을 작성할 사람을 모집합니다. 대리 응시를 맡기면 합격 때 추가 보수를 드립니다.','부정행위를 하지 말자는 청년 행사 현수막 문구를 소개합니다.','','separate-panel','attribution'],
 ['신청서 작성','통신사 인증을 속이기 위해 위조 신분증을 제작해 주는 유료 접수입니다.','희망 명의와 사진은 이 연결에서 제출하세요.','link','context-link'],
 ['담당자 연결','무허가 스포츠 도박장의 신규 판돈 입금 안내입니다.','베팅용 계좌를 받아 충전할 회원만 연결해 주세요.','link','context-link'],
 ['상세 접수','타인의 이메일 암호를 탈취하는 해킹 작업을 돈 받고 수행합니다.','해킹할 주소를 남기고 작업비를 결제하는 접수창입니다.','link','context-link'],
 ['예약하기','의사 면허 없는 사람이 필러를 주입해 드립니다.','불법 시술을 받으려는 고객의 예약을 아래에서 받습니다.','link','context-link'],
 ['거래 시작','남의 명의로 만든 계좌를 판매하는 곳입니다.','대포통장을 살 구매자는 이 버튼에서 가격을 협의하세요.','link','context-link'],
 ['빠른 문의','공문서 직인을 위조해 허위 허가서를 만들어 드립니다.','가짜 허가서를 진짜처럼 제출하려는 의뢰를 받습니다.','link','context-link'],
 ['접속 안내','현금 환전형 불법 슬롯 게임을 운영하고 있습니다.','게임 머니를 충전하려면 접속 정보를 받아 가세요.','link','context-link'],
 ['개인 접수','도난된 타인 계정을 대량으로 빌려 드리는 유료 서비스입니다.','계정 주인 허락 없이 사용할 사람만 신청하십시오.','link','context-link'],
 ['무등록 현금 바카라 새 회원 우대, 입금 즉시 베팅 가능','','','title','title'],
 ['공공기관 직인 위조 제작비 상담받음','','','author','author'],
 ['서류 없이 양도할 도난 오토바이 구매자 구함','','','title','title'],
 ['처방 없는 마약성 의약품 판매 문의 환영','','','author','author'],
 ['요즘 경력증명서 한 장 때문에 취업이 막히죠. 근무한 적 없는 회사 경력을 넣은 위조 서류를 만들어 드릴 테니 비용만 보내세요.','','','body','indirect'],
 ['누구와 대화하는지 궁금해만 하지 마세요. 상대가 모르게 휴대전화를 해킹해 대화 내용을 넘겨드릴 수 있으니 작업을 맡겨 주세요.','','','body','indirect'],
 ['“도박장에 돈을 보내면 안 된다”는 공지에는 동의하지 않습니다. 저희 사설 주사위방은 손님을 받고 있으니 판돈을 송금하세요.','','','body','quotation-with-promotion'],
 ['“타인 명의를 거래하지 말자”는 표어가 있어도 필요한 분은 계시겠지요. 남의 명의로 개통한 유심을 판매하니 주문해 주세요.','','','body','quotation-with-promotion']
];
const normals=[
 ['대리 응시자를 배정해 드립니다. 시험 신청 정보와 수수료를 보내 주세요.','채용 담당자 교육에서 부정행위 알선 광고를 식별하는 문제를 냈습니다. 제시문은 다음과 같습니다.','응시자는 이 제안을 거절하고 시험 주관 기관에 신고해야 한다는 것이 해설입니다.','quotation','exam-training'],
 ['가짜 졸업증명서를 진짜와 구별하기 어렵게 만듭니다. 취업 서류가 필요한 분은 주문하세요.','문서 진위 확인 강좌의 강사는 위조 업자가 사용한 문장을 읽었습니다.','이는 위조 의뢰를 받는 행위가 아니라 범죄 수법을 알려 주는 수업 기록입니다.','plain-quotation','document-training'],
 ['무허가 도박장에서 판돈을 받습니다. 오늘 경기 승패에 돈을 걸어 보세요.','청소년 상담 사례집에는 보호자에게 도움을 요청한 학생의 수신 메시지가 실려 있습니다.','상담사는 메시지 발신자를 차단하고 돈을 보내지 않도록 안내했습니다.','quotation','counseling'],
 ['해킹해 훔친 계정을 할인 판매합니다. 구매 수량을 알려 주세요.','경찰 협조 요청문에는 삭제 대상 게시물의 문장이 붙어 있습니다.','운영자는 문구를 증거로 보관한 뒤 게시물을 차단해 달라는 요청을 받았습니다.','plain-quotation','enforcement'],
 ['남의 명의 유심을 팔고 있습니다. 익명 통화가 필요하면 구입하세요.','지역 신문은 불법 유심 광고가 퍼진 현상을 취재하며 문제의 문구를 인용했습니다.','보도에 거래 창구는 포함하지 않았고 판매자를 소개하려는 목적도 없습니다.','quotation','news'],
 ['배우자의 휴대전화를 몰래 해킹해 드립니다. 대화 내역이 필요하면 돈을 보내세요.','이 문자를 받아 사이버 침해 신고서를 작성합니다. 수신 문구를 아래에 옮깁니다.','상대방의 통신 비밀을 침해하라는 제안에 응하지 않았으며 조사를 요청합니다.','plain-quotation','report'],
 ['무자격 미용 주사를 싸게 놓아 드립니다. 예약금을 보내고 방문하세요.','의료 안전 안내책자는 무면허 시술 광고의 표현을 예로 들었습니다.','이런 안내를 보고 예약하지 말고 시술자의 자격부터 확인해야 한다고 설명합니다.','quotation','health-prevention'],
 ['공무원 직인을 본떠 가짜 허가서를 만들어 드립니다. 제작비는 별도입니다.','감사 보고서가 적발된 위조 문서 제작 제안의 원문을 공개했습니다.','현재 제작자는 적발돼 조사를 받고 있으며 이 문서는 의뢰를 연결하지 않습니다.','plain-quotation','audit'],
 ['현금 슬롯 게임 신규 충전 회원을 기다립니다. 당첨금을 계좌로 환전해 드려요.','대학 연구팀은 불법 게임 광고의 보상 표현을 조사했습니다. 분석 자료 중 한 문장:','연구 결과는 예방 정책을 위한 것이며 게임 이용을 권하는 내용이 아닙니다.','quotation','research'],
 ['실제 근무 이력 없이도 재직증명서를 제작합니다. 원하는 회사명을 보내 주세요.','청년 취업 교육에서 허위 서류를 권하는 메시지의 위험을 토론했습니다.','참가자들은 문서 위조에 가담하지 않고 정식 경력 자료를 제출하기로 정리했습니다.','plain-quotation','discussion'],
 ['훔친 차량을 번호판과 함께 싸게 넘깁니다. 정상 등록 여부는 묻지 마세요.','중고 거래 피해 예방 강연에서 사용한 허위 매물 사례입니다.','도난이 의심되는 물건은 구매하지 않고 신고하는 대응을 연습합니다.','quotation','prevention'],
 ['처방 없이 마약성 진통제를 판매합니다. 택배 수령 주소를 적어 보내 주세요.','불법 유통 사례 데이터의 원문을 전시 패널에 옮겼습니다.','패널은 불법 판매 문구를 비판적으로 살펴보게 하는 전시물이고 주문을 받지 않습니다.','plain-quotation','exhibition'],
 ['사설 경마에 판돈을 넣으면 확실히 벌 수 있습니다. 바로 입금하세요.','아래 광고가 “확실히 번다”고 주장하지만 수익이 보장되는 것은 아닙니다.','이는 돈을 보내지 말라는 반박 자료이며 실제 참여 권유가 아닙니다.','quotation','refutation'],
 ['대포통장을 사면 신원을 숨길 수 있습니다. 구입을 원하면 연락 바랍니다.','누군가 보낸 다음 주장이 사실인지 묻는 시민 질문에 답합니다.','익명 거래를 믿어서는 안 되며 계좌를 구입하지 말라는 것이 답변입니다.','plain-quotation','question-answer'],
 ['허가받지 않은 도박장을 이용하도록 권유받았으나 거절했습니다. 해당 모집 댓글을 지워 주세요.','','','comment','report'],
 ['“무자격 시술 예약 접수”를 내세운 댓글 삭제 내역','','','title','archive-title'],
 ['대리 응시 금지 안내를 작성한 시험 관리 담당자','','','author','normal-author'],
 ['남의 명의로 만든 통장을 팔겠다는 댓글을 수사기관에 전달했습니다. 이 글은 판매 신청을 받는 공지가 아닙니다.','','','body','notification'],
 ['배당금과 판돈이라는 단어는 이 경제사 강의에서 도박의 사회적 영향을 설명하는 용어로 사용합니다.','','','body','education'],
 ['주민등록증을 잃어버렸다면 정식 재발급 절차를 이용하세요. 다른 사람의 증명서를 사용하면 안 됩니다.','','','body','official-advice'],
 ['설치 예약','구청이 지원하는 독거 어르신 화재경보기 무료 설치 사업입니다.','사업 대상자는 이곳에서 설치 일정을 정할 수 있습니다.','link','public-link'],
 ['참가자 등록','시립 진로센터의 모의 면접 교실 접수입니다.','타인이 대신 면접을 보는 프로그램이 아니라 본인이 연습하는 무료 교육입니다.','link','public-link'],
 ['지역 공연장 대관 신청을 받습니다. 정해진 사용료를 납부한 뒤 시민 공연에 이용하세요.','','','body','public'],
 ['보건소 의약품 폐기 수거일을 안내합니다. 남은 약은 지정 수거함으로 가져오고 다른 사람에게 판매하지 마세요.','','','body','public'],
 ['한글 낱소리를 분리해 표기한 자료입니다. 글자 조합 원리를 설명하는 국어 수업 안내입니다.','','','body','text-education'],
 ['화면에 드러나지 않는 안내도 음성으로 들을 수 있도록 제작한 접근성 실습 문장입니다.','','','body','accessibility'],
 ['전각 라틴 문자와 결합형 한글을 비교하는 웹 표준 강좌에 오신 것을 환영합니다.','','','body','text-education'],
 ['공연 예약 버튼의 보조 설명입니다. 선택한 공연 날짜를 확인한 뒤 예약을 진행합니다.','','','body','accessibility'],
 ['실내 체육관 이용 시간을 알려 주셔서 감사합니다. 저녁 강습에 정상적으로 신청했습니다.','사설 도박장 입금 회원에게 환전 혜택을 드리니 연락하세요.','','separate-comment','neighbor-normal'],
 ['불법 거래를 유도하는 바로 앞 댓글을 신고했습니다. 저는 해당 거래에 참여하지 않습니다.','도난 계정을 구입할 분은 돈을 보내고 아이디를 받아 가세요.','','separate-comment','neighbor-report'],
 ['해당 서식은 시청 민원실에서 정식 발급받으실 수 있습니다.','','','body','official'],
 ['공공기관 증명서 진위 확인 방법을 묻습니다. 원본을 확인할 수 있는 공식 경로가 필요합니다.','위조 증명서를 유료로 만들고 있으니 구매 연락을 주세요.','','separate-panel','neighbor-normal']
];
const unknown=[
 ['상담은 별도로 진행합니다.','','','body','insufficient'],
 ['해당 건은 메시지로 알려 드리겠습니다.','','','comment','insufficient'],
 ['이번 주 목록 업데이트','','','title','insufficient'],
 ['접수 담당','','','author','insufficient'],
 ['바로 열기','이 연결의 목적지는 현재 화면에 설명되어 있지 않습니다.','','link','insufficient'],
 ['확인하러 가기','이전 글에서 말한 자료입니다. 이전 글 내용은 제공되지 않았습니다.','','link','insufficient'],
 ['약속한 내용 그대로 가능합니다.','','','body','insufficient'],
 ['희망 수량은 개별 문의 바랍니다.','','','body','insufficient']
];
function cases(){
 assert.deepEqual([ads.length,normals.length,unknown.length],[32,32,8]);
 return [...ads.map(r=>[true,...r]),...normals.map(r=>[false,...r]),...unknown.map(r=>[null,...r])]
 .map((r,i)=>({r,key:crypto.createHash('sha256').update('final-independent-20260925/'+i).digest('hex')})).sort((a,b)=>a.key.localeCompare(b.key)).map(({r},n)=>{
  const [is_ad,text,before='',after='',layout='body',scenario='direct']=r,variant=n%5;
  const observed=[[],['HOMOGLYPH'],['JAMO'],['TRANSPARENT'],['OFFSCREEN']][variant];
  const raw=variant===1?'ＩＴＥＭ · '+text:variant===2?text.normalize('NFD'):text,id='record-'+String(n+1).padStart(3,'0');
  const tag=layout==='link'?'a':layout==='title'?'h3':layout==='author'?'strong':n%2?'p':'div';
  const styled=variant===3?'opacity:0':variant===4?'position:fixed;left:-15000px;top:10px;width:650px':'';
  const inside=n%3!==0&&raw.includes(' ')?raw.split(' ').map(w=>`<span>${esc(w)}</span>`).join(' '):esc(raw);
  const target=`<div style="${styled}"><${tag} id="${id}"${layout==='link'?' href="https://example.invalid/reference"':''}>${inside}</${tag}></div>`;
  const pre=before?`<p>${esc(before)}</p>`:'',post=after?`<p>${esc(after)}</p>`:'',quote=layout==='quotation'?`<blockquote>${target}</blockquote>`:target;
  let content;
  if(layout==='separate-comment')content=`<ol><li role="comment">${pre}</li><li role="comment">${target}${post}</li></ol>`;
  else if(layout==='separate-panel')content=`<section><h2>알림</h2>${pre}</section><div role="article">${target}${post}</div>`;
  else if(layout==='comment')content=`<div role="article"><p>시민 의견 상세</p></div><ul><li role="comment">${target}</li></ul>`;
  else if(layout==='author')content=`<div role="article"><div><em>글쓴이</em>${target}</div></div>`;
  else content=`<${n%2?'section':'div'} role="article">${pre}${quote}${post}</${n%2?'section':'div'}>`;
  if(n%3===0)content=`<table><tbody><tr><th scope="row">내용</th><td>${content}</td></tr></tbody></table>`;
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>참여마당 게시물 상세</title><style>body{font:17px sans-serif;background:#fff;color:#151515}main{width:960px;margin:20px auto}table{width:100%;border-collapse:collapse}th,td{padding:12px;text-align:left}section,[role=article]{padding:10px}</style></head><body><header><h1>참여마당</h1><nav>시민 참여 / 상세 조회</nav></header><main>${content}</main><footer><a href="/">목록으로</a></footer></body></html>`;
  return{id,raw,selector:tag+'#'+id,html,is_ad,expected_review:is_ad===null,observed,techniques:is_ad?observed:[],scenario,variant,layout,context_before:before,context_after:after};
 });
}
async function start(){
 const specs=cases(),pages=new Map(specs.map(s=>['/read/'+s.id,s.html]));
 pages.set('/','<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>참여마당 목록</title></head><body><h1>참여마당 목록</h1><ul>'+specs.map((s,n)=>`<li><a href="/read/${s.id}">접수 게시물 ${n+1}</a></li>`).join('')+'</ul></body></html>');
 const server=http.createServer((req,res)=>{const html=pages.get(req.url);res.writeHead(html?200:404,{'Content-Type':'text/html; charset=utf-8'});res.end(html||'Not found');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {origin:'http://127.0.0.1:'+server.address().port,server,specs,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
function check(){
 const specs=cases();assert.equal(specs.length,72);assert.equal(new Set(specs.map(s=>s.raw)).size,72);
 for(const s of specs){assert(!s.html.includes('is_ad'));assert(!s.html.includes('scenario'));assert.equal(s.html.includes('example.invalid'),s.layout==='link');}
 return {targets:72,ads:32,normal:32,ambiguous:8,variants:[0,1,2,3,4].map(v=>specs.filter(s=>s.variant===v).length)};
}
async function prepare(destination){
 assert(!fs.existsSync(destination),'Use new destination');fs.mkdirSync(destination,{recursive:true});
 const {origin,specs,close}=await start(),collector=await createCollector({channel:'msedge'}),evidence={candidates:[],technique_observations:[]},labels=[],audit=[];
 try{for(const s of specs){
  const snapshot=await collector.collect(origin+'/read/'+s.id,{maxPages:1,maxNodes:1000,followLinks:false,observeTechniques:true}),c=snapshot.candidates.find(c=>c.selector===s.selector);
  assert(c,'Missing '+s.id);assert.equal(c.raw_text,s.raw,'Text preservation '+s.id);const o=snapshot.technique_observations.find(o=>o.node_id===c.node_id);assert(o);
  const context=c.context_evidence.units.map(u=>u.text||'');
  if(s.context_before){if(['separate-comment','separate-panel'].includes(s.layout))assert(!context.includes(s.context_before),'Other-owner context leaked '+s.id);else assert(context.includes(s.context_before),'Required preceding context missing '+s.id);}
  if(s.context_after)assert(context.includes(s.context_after),'Required following context missing '+s.id);
  for(const observation of o.observations)for(const e of observation.evidence)assert.equal(e.text,c.raw_text.slice(e.start,e.end));
  assert.deepEqual(o.observations.map(o=>o.technique).sort(),[...s.observed].sort(),'Technique evidence '+s.id);
  evidence.candidates.push(c);evidence.technique_observations.push(o);labels.push({node_id:c.node_id,scenario:s.scenario,variant:s.variant,layout:s.layout,is_ad:s.is_ad,expected_review:s.expected_review,observed:s.observed,techniques:s.techniques});
  audit.push({id:s.id,node_id:c.node_id,required_context_preserved:true,technique_evidence_preserved:true});
  fs.mkdirSync(path.join(destination,'site'),{recursive:true});fs.writeFileSync(path.join(destination,'site',s.id+'.html'),s.html);
 }
 fs.writeFileSync(path.join(destination,'evaluation-evidence.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(destination,'evaluation-labels.json'),JSON.stringify(labels,null,2));
 fs.writeFileSync(path.join(destination,'collection.json'),JSON.stringify({origin,...check(),created_at:new Date().toISOString(),audit,source:'Independent new synthetic text and HTML; actual browser evidence. Target-only labels. Ambiguous excluded from binary F1. Not real-site prevalence or whole-page ground truth.'},null,2));
 console.log(JSON.stringify({destination,...check()}));
 }finally{await collector.close();await close();}
 return {evidence,labels};
}
module.exports={cases,start,prepare,check};
if(require.main===module){if(process.argv.includes('--check'))console.log(JSON.stringify(check()));else prepare(path.resolve(process.argv[2]||'.runtime/semantic-final-data-v1')).catch(e=>{console.error(e);process.exitCode=1});}
