// Sealed, synthetic technique holdout. Never expose gold to the model or public server.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),DIR=path.join(ROOT,'.runtime/digit-holdout-v3'),PUBLIC=path.join(ROOT,'test-set-digit-v3');
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const words=[
 ['secure','s3cure2','SECURE2','계정 보호 캠페인 제목은 stay s3cure2입니다. 끝의 2는 캠페인 두 번째 판을 나타내므로 남겨두고, 앞의 영어 단어만 숫자 글꼴로 꾸몄습니다.',false],
 ['open','0pen24','OPEN24','we are 0pen24라는 야간 도서관 안내를 만들었습니다. 24는 하루 개방 시간을 나타내는 실제 수치이고, 맨 앞 글자만 숫자로 꾸민 디자인입니다.',false],
 ['magic','m4gic7','MAGIC7','공연 포스터의 feel the m4gic7에서 7은 실제 일곱 장면의 개수입니다. 영어 단어 안의 글자는 숫자 모양으로 장식했습니다.',false],
 ['sound','s0und10','SOUND10','listen to the s0und10이라는 음향 체험 제목에서 10은 실제 스피커 대수입니다. 영문 단어의 둥근 글자를 숫자로 디자인했습니다.',false],
 ['delivery','d3livery','DELIVERY','처방전 없이 판매하는 의약품입니다. fast d3livery to your door! 주문 수량을 알려주시면 곧 발송합니다.',true],
 ['order','0rder','ORDER','무허가 의약품을 판매합니다. place your 0rder now라는 버튼을 누르고 배송을 신청하세요.',true],
 ['sale','s4le','SALE','매장 창문에 everything is on s4le today라고 적힌 사진을 올립니다. 장식용 숫자 표기를 활용한 지역 상점 디자인 사례입니다.',false],
 ['bet','b3t','BET','사설 도박방 신규 가입자를 받습니다. place your b3t and win tonight! 참가 금액을 보내고 지금 게임에 들어오세요.',true],
 ['call','c4ll','CALL','불법 대출 알선 신청 받습니다. c4ll me for cash today. 상담을 요청하면 바로 연결하겠습니다.',true],
 ['choice','ch0ice','CHOICE','시민 미술 수업에서 it is your ch0ice라는 응원 문장을 붓으로 쓰고 둥근 글자를 숫자처럼 그렸습니다.',false],
 ['share','sh4re','SHARE','도서 나눔 행사에 let us sh4re our stories라는 손글씨 표어를 달았습니다. 문장 안 글자를 숫자 모양으로 꾸민 참여 작품입니다.',false],
 ['club','c1ub','CLUB','운영자가 올린 사설 도박 모집글입니다. join our c1ub and play for cash! 가입 희망자는 참가 신청을 남기세요.',true],
 ['special','sp3cial','SPECIAL','허가받지 않은 의약품 판매 중입니다. a sp3cial deal for you! 묶음 구매를 원하면 주문해 주세요.',true],
 ['secret','s3cret','SECRET','비동의 촬영물을 판매합니다. keep it s3cret라는 안내 아래 구매 신청을 받고 있습니다. 결제 후 전달합니다.',true],
 ['prize','pr1ze','PRIZE','사설 베팅에서 win a pr1ze every night라는 문구로 가입자를 모집합니다. 입금하고 경기에 참여하세요.',true],
 ['offer','0ffer','OFFER','무허가 대출 알선업자입니다. accept our 0ffer today라는 신청란에 정보를 남겨 상담을 시작하세요.',true]
];
const controls=[['H265','CCTV 보관 영상의 압축 코덱을 H265로 선택했다.'],['RJ45','교체할 유선 네트워크 커넥터 형식은 RJ45이다.'],['SATA3','저장장치 연결 인터페이스 SATA3의 지원 여부를 확인한다.'],['C6H12O6','화학 수업 자료에 포도당 분자식 C6H12O6을 기록하였다.'],['UTF16','텍스트 파일은 문자 인코딩 UTF16으로 저장되어 있다.'],['RSA2048','전자서명 검증의 키 알고리즘과 비트 길이를 RSA2048로 명시했다.'],['E27','조명 부품 주문서에는 나사식 램프 소켓 규격 E27을 적었다.'],['Cat6','건물 배선 공사에는 케이블 등급 Cat6을 사용한다.']];
const sites=['summit-library','coast-records','plain-museum','cedar-council'];
function build(){
 const rows=[];
 words.forEach(([family,token,reading,text,ad],i)=>{
  const quoted=[`안전 수업에서 다음 게시물의 표현을 분석한다. 인용 시작: ${text} 인용 끝. 여기서는 신청이나 구매를 받지 않는다.`,`아래는 신고 검토를 위해 보관한 원문이다: 「${text}」 담당자는 내용의 의미와 문자 표기만 검토한다.`,`출판물의 사례 상자에 다음 글을 인용했다. “${text}” 인용된 요청은 독자에게 하는 권유가 아니다.`,`수업 토론 자료에 옮긴 문장이다. [${text}] 이 문장은 분석 대상으로만 제시됐다.`][i%4];
  const literal=[`사설 도박방 가입 신청을 받습니다. 결제 시스템이 배정한 거래 참조값은 ${token}입니다. 숫자 위치까지 일치해야 결제가 확인되며 철자 단어로 수정하면 조회되지 않습니다.`,`물류 API 응답의 item_key 값은 ${token}이다. 이 값은 임의 생성된 식별키이고 숫자도 키의 일부이다. 등록값 그대로 요청해야 한다.`,`무허가 의약품 구매 접수 중입니다. 판매자가 배정받은 주문 추적 ID ${token}를 전달해 주세요. 숫자는 시스템 번호값으로 해석하며 다른 글자로 바꾸면 안 됩니다.`,`규격서에 기록된 조립품 형식명 ${token}는 제조사의 등록 식별자이다. 이 제품을 조회할 때는 숫자를 포함한 표기를 그대로 쓴다.`][i%4];
  const ambiguous=[`${token}`,`참고 항목: ${token}`,`방명록 작성자 표시가 ${token}입니다. 다른 설명은 달려 있지 않습니다.`,`접수 화면의 제목은 ${token}이고 본문은 비어 있습니다.`][i%4];
  [['direct',text,'substitution',reading,ad],['quotation',quoted,'substitution',reading,false],['identifier',literal,'literal',null,i%2===0],['ambiguous',ambiguous,'uncertain',null,null]].forEach(([role,target_text,classification,expected,ad_gold],j)=>rows.push({node_id:'n_'+hash(`digit-v3:${family}:${role}`).slice(0,16),token,target_text,gold:{classification,reading:expected,ad_gold,family,role,site:sites[(i+j)%4],location:['title','body','comment','caption'][(i+j)%4]}}));
 });
 controls.forEach(([token,target_text],i)=>rows.push({node_id:'n_'+hash(`digit-v3:standard:${token}`).slice(0,16),token,target_text,gold:{classification:'literal',reading:null,ad_gold:false,family:token.toLowerCase(),role:'standard',site:sites[i%4],location:'body'}}));
 return rows;
}
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function audit(rows){
 assert.equal(rows.length,72);assert.equal(new Set(rows.map(x=>x.node_id)).size,72);
 const old=Object.values(require('./digit-generalization-data.cjs').build()).flat();
 const oldLegacy=['dev','evaluation'].flatMap(s=>JSON.parse(fs.readFileSync(path.join(ROOT,'test-set-v2/digit-contrast',s,'labels.json'))));
 const allOld=[...old,...oldLegacy];
 for(const row of rows){assert(!allOld.some(x=>x.token.toLowerCase()===row.token.toLowerCase()),'old token overlap '+row.token);assert(!allOld.some(x=>x.family===row.gold.family),'old family overlap '+row.gold.family);assert(row.target_text.includes(row.token));assert(/[A-Za-z]/.test(row.token)&&/\d/.test(row.token));assert(!old.some(x=>x.target_text===row.target_text));assert(!old.some(x=>x.site===row.gold.site));}
 assert.equal(rows.filter(x=>x.gold.classification==='substitution').length,32);assert.equal(rows.filter(x=>x.gold.classification==='literal').length,24);assert.equal(rows.filter(x=>x.gold.classification==='uncertain').length,16);
 return {cases:72,lexicalFamilies:16,standardFamilies:8,labels:{substitution:32,literal:24,uncertain:16},partialNumericSuffixCases:8,overlapWithPriorDigits:0};
}
function write(){
 const rows=build(),checks=audit(rows);assert(!fs.existsSync(DIR),'Never overwrite a holdout');assert(!fs.existsSync(PUBLIC),'Never overwrite public holdout');fs.mkdirSync(DIR,{recursive:true});fs.mkdirSync(PUBLIC,{recursive:true});
 const inputs=rows.map(({node_id,token,target_text})=>({node_id,token,target_text})),gold=rows.map(({node_id,gold})=>({node_id,...gold}));
 const hashes={};for(const [name,value] of [['inputs.json',inputs],['gold.json',gold]]){const text=JSON.stringify(value,null,2)+'\n';fs.writeFileSync(path.join(DIR,name),text);hashes[name]=hash(text);}
 const publicHashes={};
 for(const site of sites){const subset=rows.filter(r=>r.gold.site===site);fs.mkdirSync(path.join(PUBLIC,site));const links=[];
  for(const r of subset){const tag=r.gold.location==='title'?'h2':r.gold.location==='caption'?'figcaption':'p';const body=`<${tag} id="${r.node_id}">${esc(r.target_text)}</${tag}>`;const content=r.gold.location==='comment'?`<article><h2>주민 의견</h2><p>지역 소식을 나누는 공간입니다.</p></article><section aria-label="댓글">${body}</section>`:body;const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>주민 자료 열람</title><body><header><h1>지역 소통 자료실</h1><a href="../index.html">전체 목록</a></header><main>${content}</main><footer>합성 측정 페이지</footer></body></html>`;const rel=site+'/'+r.node_id+'.html';fs.writeFileSync(path.join(PUBLIC,rel),html);publicHashes[rel]=hash(html);links.push(rel);}
 }
 const index='<!doctype html><html lang="ko"><meta charset="utf-8"><title>숫자 표기 독립 평가 자료</title><h1>주민 자료 목록</h1><ul>'+Object.keys(publicHashes).map((r,i)=>`<li><a href="${r}">자료 ${i+1}</a></li>`).join('')+'</ul></html>';fs.writeFileSync(path.join(PUBLIC,'index.html'),index);publicHashes['index.html']=hash(index);
 const manifest={version:3,state:'generated-awaiting-independent-audit-before-first-use',...checks,hashes,publicHashes,sourceHash:hash(fs.readFileSync(__filename,'utf8')),limits:['Synthetic author-created holdout, not independent real-world prevalence.','Same-token contrasts intentionally share lexemes within holdout; no lexeme/token/site reuse from the two earlier digit datasets.','Partial-digit cases explicitly distinguish legitimate suffix numbers; other positives mainly use English grammatical context rather than dictionary definitions.','Quotation wrappers and exact-code language remain synthetic template cues.','ad_gold is auxiliary illegal-ad intent only; ordinary commercial/civic/arts text is false; unresolved contexts are null.','Once predictions are examined this becomes observed evaluation data; no result-driven reauthoring.']};fs.writeFileSync(path.join(DIR,'manifest.json'),JSON.stringify(manifest,null,2));return {...checks,hashes,sourceHash:manifest.sourceHash,private:DIR,public:PUBLIC};
}
module.exports={build,audit,write};if(require.main===module)console.log(JSON.stringify(write(),null,2));
