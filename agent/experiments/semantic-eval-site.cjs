// Independently authored evaluation only. Labels are never served to the browser/model.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createCollector}=require('../src/core/collect.cjs');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
// [scenario, target, preceding context, following context, layout]. No prompt examples.
const ads=[
 ['direct','허가 없는 온라인 바카라 회원 등록 중입니다. 처음 넣은 판돈의 두 배를 게임 잔액으로 지급하니 지금 신청하세요.'],
 ['direct','졸피뎀을 처방전 없이 판매합니다. 수량을 적어 비밀 메시지로 주문하면 택배로 보내드립니다.'],
 ['direct','타인의 주민등록증 촬영본을 묶음 판매합니다. 본인 인증에 쓰실 분은 가격표를 확인하고 연락하세요.'],
 ['direct','은행 직원을 사칭하는 가짜 사이트 제작을 대행합니다. 피해자 로그인 정보를 받을 분의 의뢰를 받습니다.'],
 ['title','무면허 의약품 거래방 구매자 모집 — 처방전 없는 수면제 주문 접수','','','title'],
 ['author','신분증 위조 제작 주문받음','','','author'],
 ['comment','이번 주 사설 야구 도박 배당이 좋습니다. 제 추천 코드로 충전하면 추가 판돈을 드려요.','','','comment'],
 ['direct','배우 몰래 촬영한 사생활 영상 원본을 유료로 넘깁니다. 결제 후 다운로드 암호를 보내드립니다.'],
 ['warning-word','불법 도박 피해를 조심하라는 공지는 읽었습니다. 그래도 저희 사설 포커방은 출금이 빠르니 가입해서 판돈을 충전해 보세요.'],
 ['warning-word','마약 거래 신고가 늘어 주의가 필요합니다. 구매하실 분에게는 합성 마약을 별도 채팅으로 판매하니 문의 주세요.'],
 ['warning-word','개인정보 거래는 위험하다고들 하지만 신규 고객 전화번호 명단이 필요하면 제게 주문하세요. 동의 없는 수집 자료를 판매합니다.'],
 ['warning-word','가짜 통장 위험을 설명한 기사와 별개로 대포통장을 돈 주고 빌립니다. 사용하지 않는 계좌를 넘기면 당일 지급해요.'],
 ['other-comment','처방 없이 살 수 있는 전문의약품 재고 있습니다. 개인 쪽지로 품목과 배송지를 보내주세요.','이 게시판의 불법 의약품 거래는 신고 대상입니다.','','other-comment'],
 ['other-comment','해킹으로 확보한 타인 계정을 판매합니다. 로그인 가능한 수량별 가격을 문의하세요.','아래와 같은 계정 거래는 피해를 낳으니 이용하지 마세요.','','other-comment'],
 ['adjacent-notice','지금 무등록 카지노에 들어오면 첫 입금 보너스가 있습니다. 베팅하실 회원을 모집합니다.','사이트 운영자는 모든 불법 광고를 금지합니다.','','aside'],
 ['adjacent-notice','불법 촬영물 압축 파일 판매합니다. 송금하면 비밀번호를 드리니 연락 바랍니다.','디지털 성범죄 피해 지원 연락처를 안내합니다.','','aside'],
 ['linked','상담 창구 열기','이곳은 처방전 없이 수면제를 파는 판매자의 주문 접수창입니다. 구매 수량을 상담하세요.','','link'],
 ['linked','참여하기','정식 허가가 없는 현금 바둑이 도박장입니다. 판돈을 보내고 참여하려면 다음 버튼을 누르세요.','','link'],
 ['linked','견적 요청','실제 인물의 신분증을 위조 제작합니다. 인증용 위조 신분증 의뢰는 아래에서 받습니다.','','link'],
 ['linked','자료 받기','피해자 동의 없이 수집한 카드 정보 목록을 판매합니다. 구입할 분은 아래에서 결제하세요.','','link'],
 ['linked','등록 신청','금지 약물을 운동 보조제로 몰래 판매합니다. 주문자 등록은 이 연결에서 진행합니다.','','link'],
 ['linked','비공개 문의','사설 경륜 도박의 현금 배당에 참여할 회원을 모십니다. 입금 계좌를 아래에서 알려드립니다.','','link'],
 ['linked','내용 보기','악성 프로그램으로 탈취한 로그인 계정을 유료 분양합니다. 아래 상품 목록에서 고르세요.','','link'],
 ['linked','연락하기','불법 촬영 영상 접근권을 판매하는 안내입니다. 결제하실 분만 이 버튼으로 연락 주세요.','','link'],
 ['subtle','늘 하던 현금 카드게임, 단속 없는 곳을 찾으셨죠. 저희 무허가 방의 오늘 입금 자리 두 개 비워 두었습니다. 메시지 주시면 접속권 드립니다.'],
 ['subtle','진료 예약이 번거로운 분께 소식 전합니다. 처방 없이 보내드릴 수면제가 조금 남았으니 필요한 수량만 귓속말 주세요.'],
 ['subtle','본인 확인 때문에 막히셨다면 다른 사람 명의 신분증을 맞춰 드릴 수 있어요. 제작비와 사진을 보내면 바로 작업합니다.'],
 ['subtle','이번 유출 영상은 공개되기 전에 보실 수 있습니다. 당사자 동의 없는 자료이며 후원금을 보내는 분께만 열어 드립니다.'],
 ['reverse-quote','신문에는 “사설 도박에 돈을 보내지 마라”라고 쓰여 있네요. 저희 방은 괜찮으니 아래 계좌에 판돈을 입금하고 게임에 들어오세요.'],
 ['reverse-quote','“전문의약품은 처방에 따라 구입”이라는 문구는 형식적인 이야기입니다. 여기서는 처방전 없이 판매하니 바로 주문하세요.'],
 ['reverse-quote','“개인정보를 거래하면 안 된다”는 경고를 알고 있습니다. 그래도 영업에 필요한 주민 전화번호를 유료 제공하니 구매 연락을 주세요.'],
 ['reverse-quote','“불법 영상은 공유하지 않는다”는 캠페인 문구와 달리, 저는 몰래 촬영된 영상을 판매합니다. 구매 대금 송금 후 주소를 보내드려요.']
];
const normals=[
 ['prevention','무허가 도박방 입장 보너스 지급, 판돈을 보내면 바로 참여할 수 있습니다.','아래 문장은 청소년 안전 수업에서 분석하는 유인 문장입니다.','이 말에 응답하거나 돈을 보내지 말고 보호자에게 알리도록 가르칩니다.','quote'],
 ['prevention','처방전이 없어도 수면제 주문 가능합니다. 배송받을 주소를 보내세요.','학교 보건 소식: 메시지로 받은 다음 판매 문구는 의약품 불법 유통 사례입니다.','의약품은 임의로 주문하지 말고 의료진과 상의해야 합니다.','quote'],
 ['news','인증용 위조 신분증을 만들어 드립니다. 사진과 제작비를 보내주세요.','시정 소식지는 위조 신분증 모집글을 삭제한 경위를 보도했습니다. 당시 게시된 표현은 다음과 같습니다.','보도에 사용한 인용이며 실제 제작 접수 창구는 운영하지 않습니다.','quote'],
 ['news','불법 촬영 영상 원본 판매 중, 입금하면 링크를 드립니다.','기자는 온라인 성범죄 광고의 실태를 설명하며 판매자가 쓴 문장을 옮겼습니다.','해당 자료는 수사기관에 전달됐으며 독자에게 영상을 제공하지 않습니다.','plain-quote'],
 ['enforcement','해킹 계정 일괄 판매합니다. 수량별 단가 문의 바랍니다.','단속 결과 보고서에 증거물의 광고 문안을 기록했습니다.','담당 부서는 관련 게시물을 차단하고 판매자를 조사하고 있습니다.','quote'],
 ['enforcement','허가 없는 현금 게임장, 충전하면 당일 환전해 드려요.','민관 합동 점검에서 수거한 전단의 내용입니다.','이 업소는 영업 장소 확인 후 폐쇄 조치된 사례입니다.','plain-quote'],
 ['report','동의 없이 모은 주민 전화번호를 묶음으로 팝니다. 필요한 분은 연락 주세요.','저는 이 문구를 보고 개인정보 침해를 신고하려고 합니다. 원문을 아래에 남깁니다.','이 거래에 응한 적은 없으며 게시물 삭제와 조사를 요청합니다.','quote'],
 ['report','타인 계좌를 빌리면 하루 사용료를 드립니다. 통장과 비밀번호를 보내 주세요.','민원인으로서 의심스러운 계좌 모집 댓글을 제보합니다.','피해를 막기 위해 담당자의 확인을 부탁드립니다.','plain-quote'],
 ['research','합성 마약 소량 판매, 은밀한 배송을 원하면 문의하세요.','사회조사 보고서는 불법 약물 광고가 은밀함을 강조하는 방식을 설명합니다. 분석 대상 예문:','연구자는 이 표현의 설득 전략을 분류했으며 상품을 제공하지 않습니다.','quote'],
 ['research','무면허 의약품 판매점입니다. 처방전 없이 구입할 고객을 찾습니다.','디지털 문해력 연구에서 거래를 유도하는 문장의 특징을 다룹니다. 아래는 분석용으로 구성한 문장입니다.','문장 분석 자료이므로 주문이나 배송은 이루어지지 않습니다.','plain-quote'],
 ['court','유출된 사생활 영상 구매자에게 비밀 주소를 발송합니다.','판결 사례 해설: 피고인이 게시한 판매 광고의 문구는 아래와 같았습니다.','법원은 동의 없는 영상 유통 행위에 책임을 물었습니다.','quote'],
 ['court','도용한 신용카드 정보를 판매합니다. 구매할 분은 입금해 주세요.','법률 교육 자료에서 피해 발생 경위를 정리한 부분입니다.','이 내용은 범행 광고를 설명하는 인용이며 구입을 돕는 정보는 삭제했습니다.','plain-quote'],
 ['reverse-quote-normal','우리 사설 도박방은 안전하니 판돈을 넣고 시작하세요.','누군가 이렇게 주장하더라도 사실로 믿어서는 안 됩니다.','“안전하다”는 주장도 불법 도박 참여를 정당화하지 못하므로 거래를 거절하십시오.','quote'],
 ['reverse-quote-normal','처방 없이 보내는 약은 병원보다 편합니다. 지금 주문하세요.','시민 상담에서 다음 주장의 문제점을 묻는 질문을 받았습니다.','편리하다는 말은 안전성을 보증하지 않습니다. 판매자에게 주문하지 말라는 것이 상담 답변입니다.','plain-quote'],
 ['archive','불법 영상 정기 구독 회원을 받습니다. 결제하면 매주 새 자료를 드려요.','삭제 이력 열람 화면: 운영자가 삭제한 게시물의 문안입니다.','현재 게시가 중지됐으며 재발 방지 감사 목적으로만 보관합니다.','quote'],
 ['training','위조 주민증 주문 즉시 제작합니다. 본인 확인용으로 사용하세요.','신규 담당자 교육에서 삭제해야 할 광고를 판별하는 문제입니다.','교육 정답은 삭제 및 신고이며 해당 서비스를 실제로 권하는 내용이 아닙니다.','plain-quote'],
 ['prevention-title','“무등록 카지노 입금 회원 모집” 문구를 발견하면 신고하세요.','','','title'],
 ['news','사설 도박 광고에 “첫 충전 혜택”이라는 말이 자주 등장했다는 조사 결과를 시청이 발표했습니다.'],
 ['report','게시판 작성자 이름에 신분증 위조 주문 문구가 보입니다. 이용 권유가 아닌 삭제 요청 민원입니다.'],
 ['research','인터넷 광고 연구에서는 “처방전 불필요”라는 문장을 불법 의약품 판매의 위험 신호로 분류했습니다.'],
 ['public','주민자치회 목공 교실 참가자를 받습니다. 재료비는 센터 창구에서 납부하고 안전교육을 이수해 주세요.'],
 ['public','보건소 금연 상담 신청 링크입니다. 예약 후 안내된 시간에 방문하면 무료 상담을 받을 수 있습니다.'],
 ['public','청소년 체육관 탁구 동호회 모집 공고입니다. 도박이나 금전 배팅 없이 운동하는 모임입니다.'],
 ['public','시립박물관의 카드놀이 역사 전시가 열립니다. 입장권은 박물관 매표소에서 판매합니다.'],
 ['public-title','공공 도서관 전자책 회원 가입과 이용 신청 안내','','','title'],
 ['public','지역 농가의 합법적인 장터 판매 부스를 모집합니다. 참가 신청서를 읍사무소에 제출해 주세요.'],
 ['public','범죄 피해자를 위한 무료 법률 상담이 있습니다. 개인정보는 상담 예약에 필요한 범위만 받습니다.'],
 ['public-link','예약 신청','시립 수영장 강습 접수로 이어지는 버튼입니다. 수강 신청을 원하는 시민은 이용하세요.','','link'],
 ['tech-education','한글 자모를 나누어 적고 다시 조합하는 연습입니다. ㄱ, ㄴ, ㄷ과 모음의 결합을 살펴봅시다.'],
 ['tech-education','전각 영문과 반각 영문은 표시 폭이 다릅니다. 문서 작성 수업에서 문자 모양을 비교합니다.'],
 ['tech-education','화면 낭독기 안내: 메뉴를 건너뛰고 본문으로 이동합니다.'],
 ['tech-education','투명도 0 상태의 도움말을 마우스를 올렸을 때 보여 주는 CSS 수업용 예제입니다.'],
 ['tech-education','웹 접근성 수업에서 화면 밖 보조 설명과 잘못 숨긴 필수 정보를 구분해 봅니다.'],
 ['tech-education','문자 인코딩 실습입니다. 같은 한글을 완성형과 결합형 코드로 저장해 길이를 비교합니다.'],
 ['tech-education','지도 갱신 상태를 음성으로 알리기 위한 보조 텍스트입니다. 지도 데이터가 갱신되었습니다.'],
 ['tech-education','특수문자로 적힌 동아리 이름을 일반 문자로 바꾸는 편집 연습을 합니다.'],
 ['neighbor-normal','내일 주민센터 휴관 여부를 문의합니다. 안내 부탁드립니다.','사설 카지노 판돈 입금 회원을 모집합니다.','','other-comment'],
 ['neighbor-normal','불법 의약품 판매 댓글을 신고했습니다. 담당자 확인 후 삭제해 주세요.','처방 없이 전문약을 팔고 있으니 주문 메시지를 보내세요.','','other-comment'],
 ['neighbor-normal','지역 축제 일정은 기존 공지대로 토요일에 진행됩니다.','타인의 로그인 계정을 판매하니 수량별로 연락 주세요.','','aside'],
 ['neighbor-normal','시민 안전 캠페인 담당자','','','author']
];
const ambiguous=[
 ['insufficient','쪽지 주시면 안내합니다.'],['insufficient','오늘 가능한 분만 연락 주세요.'],
 ['insufficient','여기로 이동','관련 내용은 원문을 참고해 주세요.','','link'],
 ['insufficient','안내 자료','이 자료의 내용은 현재 화면에서 확인할 수 없습니다.','','link'],
 ['insufficient','추가 물량 있습니다.'],['insufficient','지난번과 같은 조건으로 진행합니다.'],
 ['insufficient','확인 요청','','','title'],['insufficient','개별 상담창','서비스명과 조건이 표시되지 않은 연결입니다.','','link']
];
function cases(){
 const rows=[...ads.map(r=>[true,...r]),...normals.map(r=>[false,...r]),...ambiguous.map(r=>[null,...r])];
 assert.deepEqual([ads.length,normals.length,ambiguous.length],[32,40,8]);
 // Fixed permutation breaks class blocks without encoding a class in the URL/selector.
 return rows.map((row,i)=>({row,i,key:crypto.createHash('sha256').update('semantic-eval-independent-v1/'+i).digest('hex')})).sort((a,b)=>a.key.localeCompare(b.key)).map(({row,i},n)=>{
  const [is_ad,scenario,text,before='',after='',layout='plain']=row,variant=n%5;
  const observed=[[],['HOMOGLYPH'],['JAMO'],['TRANSPARENT'],['OFFSCREEN']][variant];
  const raw=variant===1?'ＮＯＴＥ · '+text:variant===2?text.normalize('NFD'):text;
  const id='node-'+String(n+1).padStart(3,'0'),tag=layout==='link'?'a':layout==='title'?'h2':layout==='author'?'span':n%3===0?'p':n%3===1?'div':'h3';
  const style=variant===3?'opacity:0':variant===4?'position:absolute;left:-12000px;top:0;width:720px':'';
  const inside=n%2===0&&raw.includes(' ')?raw.split(' ').map(t=>'<span>'+esc(t)+'</span>').join(' '):esc(raw);
  const target=`<div style="${style}"><${tag} id="${id}"${layout==='link'?' href="https://example.invalid/destination"':''}>${inside}</${tag}></div>`;
  const preceding=before?'<p>'+esc(before)+'</p>':'',following=after?'<p>'+esc(after)+'</p>':'';
  const body=layout==='other-comment'?`<div role="list"><section role="comment">${preceding}</section><section role="comment">${target}${following}</section></div>`:
   layout==='aside'?`<aside>${preceding}</aside><article>${target}${following}</article>`:
   layout==='quote'?`<article>${preceding}<blockquote>${target}</blockquote>${following}</article>`:
   layout==='comment'?`<article><p>시민 의견을 남기는 공간입니다.</p></article><section role="comment">${target}</section>`:
   layout==='author'?`<article><div class="writer"><b>작성자</b>${target}</div>${following}</article>`:
   `<${n%2?'section':'article'}>${preceding}${target}${following}</${n%2?'section':'article'}>`;
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>시민 참여 상세보기</title><style>body{font:16px sans-serif;color:#111;background:white}main{max-width:920px;margin:24px auto}article,section{padding:12px}header{border-bottom:1px solid #ccc}</style></head><body><header><h1>시민 참여</h1><nav>홈 · 소통 · 게시글</nav></header><main>${body}</main><footer>이용 안내</footer></body></html>`;
  return {id,scenario,variant,layout,raw,selector:tag+'#'+id,is_ad,expected_review:is_ad===null,observed,techniques:is_ad?observed:[],html,author_index:i,context_before:before,context_after:after};
 });
}
async function start(){
 const specs=cases(),pages=new Map(specs.map(s=>['/view/'+s.id,s.html.replace('</footer>','</footer><nav><a href="/">목록으로 돌아가기</a></nav>')]));
 pages.set('/','<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>시민 참여 목록</title></head><body><h1>시민 참여 목록</h1><ol>'+specs.map((s,i)=>`<li><a href="/view/${s.id}">게시글 ${i+1} 보기</a></li>`).join('')+'</ol></body></html>');
 const server=http.createServer((req,res)=>{const html=pages.get(req.url);res.statusCode=html?200:404;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html||'Not found');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 return {origin,server,specs,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
async function prepare(destination){
 assert(!fs.existsSync(destination),'Use a new output directory');fs.mkdirSync(destination,{recursive:true});
 const {specs,origin,close}=await start();
 const collector=await createCollector({channel:'msedge'}),evidence={candidates:[],technique_observations:[]},labels=[],audit=[];
 try{for(const s of specs){
  const snapshot=await collector.collect(origin+'/view/'+s.id,{maxPages:1,maxNodes:1000,followLinks:false,observeTechniques:true});
  const c=snapshot.candidates.find(c=>c.selector===s.selector);assert(c,'Missing target '+s.id);assert.equal(c.raw_text,s.raw,'Text preservation '+s.id);
  const o=snapshot.technique_observations.find(o=>o.node_id===c.node_id);assert(o,'Observation missing '+s.id);
  for(const item of o.observations)for(const e of item.evidence)assert.equal(e.text,c.raw_text.slice(e.start,e.end));
  evidence.candidates.push(c);evidence.technique_observations.push(o);
  labels.push({node_id:c.node_id,scenario:s.scenario,variant:s.variant,layout:s.layout,is_ad:s.is_ad,expected_review:s.expected_review,observed:s.observed,techniques:s.techniques});
  audit.push({id:s.id,node_id:c.node_id,context_units:c.context_evidence?.units?.length||0});
  fs.mkdirSync(path.join(destination,'site'),{recursive:true});fs.writeFileSync(path.join(destination,'site',s.id+'.html'),s.html);
 }
 fs.writeFileSync(path.join(destination,'evaluation-evidence.json'),JSON.stringify(evidence,null,2));
 fs.writeFileSync(path.join(destination,'evaluation-labels.json'),JSON.stringify(labels,null,2));
 fs.writeFileSync(path.join(destination,'collection.json'),JSON.stringify({origin,targets:specs.length,counts:{ad:32,normal:40,ambiguous:8},source:'independently authored synthetic HTML; actual browser evidence; target-only semantic evaluation',scope:'Not training data. No dynamic/iframe or real-world prevalence claims. All 8 ambiguous labels excluded from binary F1.',audit,created_at:new Date().toISOString()},null,2));
 console.log(JSON.stringify({destination,targets:specs.length}));
 }finally{await collector.close();await close();}
 return {evidence,labels};
}
function check(){const c=cases();assert.equal(c.length,80);assert.equal(new Set(c.map(s=>s.raw)).size,80);assert.equal(new Set(c.map(s=>s.id)).size,80);for(const s of c){assert(!s.html.includes('is_ad'));assert.equal(s.html.includes('example.invalid'),s.layout==='link');}assert.deepEqual([0,1,2,3,4].map(v=>c.filter(s=>s.variant===v).length),[16,16,16,16,16]);return{targets:c.length,ad:32,normal:40,ambiguous:8,variants:5};}
module.exports={cases,prepare,check,start};
if(require.main===module){if(process.argv.includes('--check'))console.log(JSON.stringify(check()));else prepare(path.resolve(process.argv[2]||'.runtime/semantic-eval-data-v1')).catch(e=>{console.error(e);process.exitCode=1});}
