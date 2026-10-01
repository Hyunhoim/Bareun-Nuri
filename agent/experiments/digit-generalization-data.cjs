// Synthetic technique-only diagnostic. Gold and split metadata never enter public HTML or model inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),PUBLIC=path.join(ROOT,'test-set-digit-v2'),PRIVATE=path.join(ROOT,'.runtime/digit-generalization-data-v1');
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const WORDS={
 dev:[['v0ucher','VOUCHER','할인권'],['ca5hback','CASHBACK','현금 환급'],['dep0sit','DEPOSIT','입금'],['rew4rd','REWARD','보상'],['1nvite','INVITE','초대'],['cred1t','CREDIT','적립금'],['w4llet','WALLET','지갑'],['pr3mium','PREMIUM','상위 회원'],['51lver','SILVER','은 등급'],['90lden','GOLDEN','황금 등급'],['7oken','TOKEN','교환권'],['partn3r','PARTNER','제휴 회원']],
 evaluation:[['j4ckp0t','JACKPOT','최고 당첨금'],['w3lc0me','WELCOME','신규 환영'],['1ucky','LUCKY','행운'],['tran5fer','TRANSFER','이체'],['pay0ut','PAYOUT','당첨금 지급'],['m3mber','MEMBER','회원'],['t1cket','TICKET','참가권'],['4ccess','ACCESS','접속'],['d1scount','DISCOUNT','할인'],['f0rtune','FORTUNE','재운'],['pr1vate','PRIVATE','비공개'],['r3deem','REDEEM','교환 신청']]
};
const CONTROLS={
 dev:[['USB3','자료 전송 장치의 인터페이스 규격은 USB3입니다.'],['WiFi6','민원실 무선 공유기는 WiFi6 규격을 지원합니다.'],['IPv6','정보통신 교육은 IPv6 주소 체계를 다룹니다.'],['H264','영상 보관 장치의 코덱 설정은 H264입니다.'],['B2B','기업 간 거래를 뜻하는 B2B 통계 보고서입니다.'],['5G','통신 방식 5G의 기지국 현황을 공개합니다.'],['A4','복사용지는 A4 용지 크기로 제출합니다.'],['R2D2','영화 속 로봇 캐릭터 R2D2의 이름을 그대로 적었습니다.']],
 evaluation:[['UTF8','문서 파일의 문자 인코딩 UTF8을 선택한 뒤 저장하십시오.'],['SHA256','다운로드 파일 검증에 사용하는 해시 알고리즘 이름은 SHA256이다.'],['HTTP2','서버 점검표에는 통신 프로토콜 HTTP2 사용 여부를 기록한다.'],['PCIe4','구매 사양에서 확장 버스의 세대를 나타내는 표기는 PCIe4로 지정됐다.'],['DDR5','장비 목록의 메모리 규격 칸에 DDR5가 기재되어 있다.'],['IEC61850','변전소 통신 규격 IEC61850의 적용 범위를 기술 문서에서 열람할 수 있다.'],['M8','도면에서 나사의 호칭 지름 규격을 M8로 표시하였다.'],['x86','이 프로그램은 프로세서 아키텍처 x86용으로 배포됐다.']]
};
const roles=['offer','prevention','identifier','ambiguous'];
function textFor(split,role,token,meaning,index){
 if(split==='dev'){
  const offer=[`온라인 불법 도박방에서 ${meaning} 혜택을 드립니다. ${token} 신청 후 바로 참여하세요.`,`사설 베팅 회원에게 ${meaning} 서비스를 제공합니다. 지금 ${token} 이용을 신청하면 됩니다.`,`불법 카지노 모집 안내: ${meaning} 항목을 ${token}으로 표기했습니다. 참여 희망자는 연락하세요.`];
  const prevention=[`피해 예방 자료입니다. 불법 도박 광고의 '${token}'은 ${meaning}을 내세운 유인 문구입니다. 이 광고를 따라 가입하지 마세요.`,`사설 베팅 신고 사례를 설명합니다. '${token}'이라는 ${meaning} 제안을 받았다면 거래를 멈추고 신고하세요.`,`단속 교육의 인용 예시: '${token}'으로 ${meaning}을 제안하며 불법 카지노에 모집하는 글에 주의하십시오.`];
  const literal=[`물품 대장의 관리번호는 ${token}입니다. 숫자는 발급 시 부여된 번호의 일부이므로 영문으로 바꾸지 말고 원문 그대로 조회합니다.`,`입찰 규격서의 제품 모델명은 ${token}이며 숫자도 모델 식별자의 일부입니다. 주문서에는 이 식별자를 변경 없이 적습니다.`,`전산 창고에서 발급한 자산코드 ${token}를 안내합니다. 해당 숫자는 코드값이며 다른 글자로 대체하면 다른 물품이 됩니다.`];
  const literalContext=Math.floor(index/2)%2===0?`사설 도박 신규 참가자를 모집합니다. 가입 때 시스템이 부여한 회원 식별번호 ${token}를 입력하세요. 숫자는 등록 코드의 일부이므로 영문으로 고치지 않습니다.`:literal[index%3];
  return role==='offer'?offer[index%3]:role==='prevention'?prevention[index%3]:role==='identifier'?literalContext:Math.floor(index/2)%2===1?`문의: ${token}`:`게시판에 '${token}'이라는 문자열만 남아 있습니다. 작성자가 무엇을 가리킨 것인지 알 수 있는 설명이나 앞뒤 글은 보관되지 않았습니다.`;
 }
 const offer=[`새 사설 카지노 참가자를 받습니다. ${token} 혜택으로 ${meaning}을 제공하니 지금 입장 신청을 남기십시오.`,`가입자를 모집하는 불법 베팅 운영자입니다. ${meaning} 서비스를 뜻하는 ${token} 항목을 선택하고 이용 절차를 시작하세요.`,`오늘의 사설 도박 모집: ${meaning}을 원하시는 분은 ${token}으로 접수하고 게임에 참여할 수 있습니다.`];
 const prevention=[`경찰 예방 강의에 실린 광고 인용이다. '${token}'으로 ${meaning}을 약속하는 사설 카지노에 응하지 말고 증거를 보관할 것.`,`상담원이 수집한 불법 베팅 권유의 표현 '${token}'은 ${meaning}을 내세운다. 이는 피해 예방을 위한 인용이며 신청 안내가 아니다.`,`학교 안전신문은 ${meaning}을 홍보하는 '${token}' 같은 사설 도박 광고를 사례로 분석하고 이용을 금지할 것을 알렸다.`];
 const literal=[`회계 시스템 조회 키 '${token}'의 숫자 자리는 등록 당시 배정된 값이다. 납품 내역을 대조할 때 키를 철자 단어로 고치면 안 된다.`,`제조사에서 정한 고유 형식명 '${token}'로 장비가 등록되어 있다. 숫자를 포함한 이 이름 자체가 제품 식별자다.`,`기록물 식별 기호 '${token}'을 검색창에 정확히 입력한다. 숫자는 문서 번호 구성값이고 영문자의 변형 표기가 아니다.`];
 const literalContext=Math.floor(index/2)%2===0?`불법 카지노 이용 신청을 받는다. 결제 대조를 위해 발급된 고유 고객 코드 '${token}'을 제출하면 입장할 수 있다. 해당 숫자 자리는 전산 식별값으로, 다른 문자로 바꾸면 조회가 되지 않는다.`:literal[index%3];
 return role==='offer'?offer[index%3]:role==='prevention'?prevention[index%3]:role==='identifier'?literalContext:Math.floor(index/2)%2===1?`항목 ${token}`:`남은 캡처에는 '${token}'만 보인다. 이것이 코드인지 이름인지 일반 단어를 꾸민 것인지 판단할 만한 출처와 설명은 모두 없다.`;
}
function build(){
 const out={dev:[],evaluation:[]};
 for(const split of Object.keys(out)){
  WORDS[split].forEach(([token,reading,meaning],index)=>roles.forEach(role=>{
   const site=(split==='dev'?['harbor-civic','grove-office']:['ridge-county','lake-service'])[index%2];
   out[split].push({node_id:'n_'+hash(`${split}:${index}:${role}`).slice(0,16),token,target_text:textFor(split,role,token,meaning,index),site,split,family:reading.toLowerCase(),role,template:`${split}-${role}-${role==='ambiguous'?0:index%3}`,gold:{classification:role==='offer'||role==='prevention'?'substitution':role==='identifier'?'literal':'uncertain',reading:role==='offer'||role==='prevention'?reading:null}});
  }));
  CONTROLS[split].forEach(([token,target_text],index)=>out[split].push({node_id:'n_'+hash(`${split}:control:${index}`).slice(0,16),token,target_text,site:(split==='dev'?['harbor-civic','grove-office']:['ridge-county','lake-service'])[index%2],split,family:token.toLowerCase(),role:'standard',template:`${split}-standard-${index}`,gold:{classification:'literal',reading:null}}));
 }
 return out;
}
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function html(title,body,layout=0){return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:17px/1.8 system-ui;margin:0;color:#233143}header,main,footer{padding:24px;max-width:1000px;margin:auto}header{border-bottom:4px solid #24648e}a{color:#146192}article,.content{padding:24px;border:1px solid #d6dfe8}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #ddd}aside{background:#eef4f8;padding:15px}</style><header><h1>${escape(title)}</h1><nav><a href="../index.html">시민 소통</a> · 기관 안내 · 민원 서비스</nav></header><main>${layout===0?body:layout===1?`<section><aside>열린 의견 · 이용 안내</aside>${body}</section>`:layout===2?`<div class="content">${body}</div>`:`<section aria-label="주민 참여">${body}</section>`}</main><footer>공공기관형 합성 측정 사이트 · 실제 기관 서비스가 아닙니다.</footer></html>`;}
function audit(data){
 const a=data.dev,b=data.evaluation;assert.equal(a.length,56);assert.equal(b.length,56);
 for(const key of ['family','template','site'])assert.equal(a.filter(x=>new Set(b.map(y=>y[key])).has(x[key])).length,0,`split overlap: ${key}`);
 const templateTexts=split=>new Set(WORDS[split].flatMap((_,index)=>roles.map(role=>textFor(split,role,'TOKEN','MEANING',index))));
 const devTemplates=templateTexts('dev'),evaluationTemplates=templateTexts('evaluation');assert.equal([...devTemplates].filter(x=>evaluationTemplates.has(x)).length,0,'actual template text overlap');
 assert.equal(a.filter(x=>new Set(b.map(y=>y.token.toLowerCase())).has(x.token.toLowerCase())).length,0,'token overlap');
 assert.equal(new Set([...a,...b].map(x=>x.node_id)).size,112);
 for(const rows of [a,b]){
  assert.equal(rows.filter(x=>x.gold.classification==='substitution').length,24);assert.equal(rows.filter(x=>x.gold.classification==='literal').length,20);assert.equal(rows.filter(x=>x.gold.classification==='uncertain').length,12);
  for(const site of new Set(rows.map(x=>x.site))){const group=rows.filter(x=>x.site===site);for(const role of roles)assert.equal(group.filter(x=>x.role===role).length,6);assert.equal(group.filter(x=>x.role==='standard').length,4);}
  for(const r of rows){assert.ok(r.target_text.includes(r.token));assert.match(r.token,/[0-9]/);assert.match(r.token,/[A-Za-z]/);assert.equal(r.gold.reading!==null,r.gold.classification==='substitution');}
 }
 return {rows:112,perSplit:56,perSplitLabels:{substitution:24,literal:20,uncertain:12},disjoint:['family','template','actual template text','site','token'],siteRoleBalanced:true,limits:['Synthetic explicit-context benchmark, not natural-web prevalence.','Paired tokens intentionally recur within each split, never across split families.','Literal identifiers are explicitly exact codes; half are in illegal-ad contexts. Half uncertain examples have only a short neutral wrapper.','All positive examples concern gambling with Korean meaning cues; no proof of latent interpretation on naturally ambiguous names.','Same generator and author; lexical/template/site separation does not establish real-site generalization.']};
}
function write(){
 const data=build(),checked=audit(data);fs.mkdirSync(PUBLIC,{recursive:true});fs.mkdirSync(PRIVATE,{recursive:true});
 const files={};
 for(const [split,rows] of Object.entries(data)){
  const inputs=rows.map(({node_id,token,target_text})=>({node_id,token,target_text})),gold=rows.map(({node_id,site,split,family,role,template,gold})=>({node_id,site,split,family,role,template,...gold}));
  for(const [name,value] of [[`${split}-inputs.json`,inputs],[`${split}-gold.json`,gold]]){const text=JSON.stringify(value,null,2)+'\n';fs.writeFileSync(path.join(PRIVATE,name),text);files[name]=hash(text);}
 }
 const all=[...data.dev,...data.evaluation],sites=[...new Set(all.map(x=>x.site))],publicHashes={};
 for(const [siteIndex,site] of sites.entries()){
  const dir=path.join(PUBLIC,site);fs.mkdirSync(path.join(dir,'posts'),{recursive:true});const rows=all.filter(x=>x.site===site);
  for(const row of rows){const familyIndex=WORDS[row.split].findIndex(x=>x[0]===row.token),inComment=familyIndex>=0&&Math.floor(familyIndex/2)%2===1;const body=inComment?`<article><h2>주민 의견 수렴</h2><p>이번 주 지역 소식을 나눕니다.</p></article><section aria-label="댓글"><h3>등록된 댓글</h3><div id="${row.node_id}">${escape(row.target_text)}</div></section>`:siteIndex%2===0?`<article><h2>게시글 내용</h2><p id="${row.node_id}">${escape(row.target_text)}</p></article>`:`<section><h2>접수된 의견</h2><div id="${row.node_id}"><span>${escape(row.target_text)}</span></div></section>`;const text=html('시민 참여 게시글',body,siteIndex);const rel=`${site}/posts/${row.node_id}.html`;fs.writeFileSync(path.join(PUBLIC,rel),text);publicHashes[rel]=hash(text);}
  const text=html('주민 게시판',`<table><thead><tr><th>번호</th><th>제목</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td><a href="posts/${r.node_id}.html">주민 의견 ${i+1}</a></td></tr>`).join('')}</tbody></table>`,siteIndex);fs.writeFileSync(path.join(dir,'index.html'),text);publicHashes[`${site}/index.html`]=hash(text);
 }
 const home=html('공공 웹 숫자 표기 측정 사이트',`<ul>${sites.map((s,i)=>`<li><a href="${s}/index.html">지역 ${i+1} 주민 게시판</a></li>`).join('')}</ul>`);fs.writeFileSync(path.join(PUBLIC,'index.html'),home);publicHashes['index.html']=hash(home);
 const manifest={version:1,...checked,history:{developmentControls:'Standard identifiers may overlap prior diagnostic controls; do not present these as unseen.',evaluation:'Lexical families and standard controls checked against prior digit contrast sources before live execution.'},sourceHash:hash(fs.readFileSync(__filename,'utf8')),inputsAndGold:files,publicFiles:publicHashes};fs.writeFileSync(path.join(PRIVATE,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return {public:PUBLIC,private:PRIVATE,...checked,publicFiles:Object.keys(publicHashes).length};
}
module.exports={build,audit,write};if(require.main===module)console.log(JSON.stringify(write(),null,2));
