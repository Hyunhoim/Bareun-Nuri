const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createCollector}=require('../agent/src/core/collect.cjs'),{contract}=require('../agent/src/core/judgment.cjs'),{context}=require('./klue-context.cjs');
const root='.runtime/klue-cycle3-v1/final-dom',esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const offers=['정식 허가 없이 운영하는 온라인 배당 게임에 돈을 낼 회원을 초대합니다.','현금을 판돈으로 받는 불법 인터넷 승부방의 유료 계정을 만들어 드립니다.','당사자가 촬영에 동의하지 않은 성인 영상의 유료 판매를 시작했습니다.','불법 유출 성인 사생활 파일을 구매할 분에게 대금을 받고 넘겨 드립니다.','자격 심사 시험에 신청인 대신 참가하는 불법 대행 의뢰를 돈 받고 받습니다.','허위 경력을 기재한 위조 증명 문서를 유료로 공급할 주문자를 찾습니다.','판매 자격과 허가 없이 유통하는 불법 의약품을 돈 받고 거래합니다.','의료 면허 없이 하는 불법 시술의 유료 이용 예약을 받고 있습니다.'];
const ctas=['신청 접수로 이동','이용 의향 전달','구매 상담 창구','요청 내용 남기기','진행 신청 보내기','서비스 문의 연결','주문 접수 열기','참가 의사 제출'];
const warns=['이 모집 발언은 접근을 막기 위해 남겨 둔 증거입니다. 거래에 참여하지 마십시오.','게시판 신고 처리 사례에 포함된 원문입니다. 이곳에서는 가입이나 판매를 받지 않습니다.','피해를 피하는 방법을 설명하며 문제의 광고를 옮겼습니다. 요청에 응하지 마십시오.','시민 보호 교육에서 제시하는 잘못된 권유입니다. 결제할 대상을 안내하는 글이 아닙니다.','삭제 조치 사유를 설명하려고 보존한 내용입니다. 이용자를 모집하는 게시물이 아닙니다.','문제 행위를 예방하는 자료에서 가져온 문장입니다. 해당 거래를 금지하라는 뜻입니다.','단속된 광고의 말투를 설명하는 기록입니다. 구매할 상품을 제공하지 않습니다.','피해 신고 내용 중 권유 발언을 적은 것입니다. 참여를 요청하는 안내가 아닙니다.'];
const normal=['공공 게시판의 글자 크기를 조절하면 읽기가 쉬워집니다.','어르신을 위한 무료 스마트 기기 교육에 필요한 준비물을 안내합니다.','주민이 남긴 제안에 답변할 담당자를 확인하고 있습니다.','음성 이용자가 설명을 들을 수 있게 화면의 항목에 이름을 붙였습니다.','도서 열람실의 이용 시간이 다음 달부터 달라집니다.','공식 문서에 잘못 적힌 내용을 정정하는 절차를 문의합니다.','우리 지역 문화 수업의 신청 장소가 변경됐습니다.','시민 교육에서 동의 없는 촬영과 유포가 일으키는 피해를 다룹니다.'];
const programs=['도서관 낭독 교실','주민 디지털 배움 수업','시립 문화 해설 행사','청소년 안전 체험관','공공 정원 견학','주민 건강 걷기 행사','지역 기록 전시 관람','구민 취미 강좌'];
async function main(){
 assert(!fs.existsSync(root));fs.mkdirSync(root,{recursive:true});const specs=[];
 for(let i=0;i<8;i++)for(let k=0;k<12;k++){
  const id='target-'+sha(i+':'+k+':new-dom').slice(0,12),ad=offers[i]+' 비용과 이용 절차는 연락창에서 신청해 주세요.',warning=warns[i],cta=ctas[i];let text,content,label;const target=(s,tag='p')=>`<${tag} id="${id}"${tag==='a'?' href="#request"':''}>${esc(s)}</${tag}>`;
  if(k===0){text=ad;content=`<article>${target(text)}</article>`;label=0;}
  if(k===1){text=cta;content=`<article><p>${esc(offers[i])}</p>${target(text,'a')}</article>`;label=0;}
  if(k===2){text=ad;content=`<article><p>제가 지금 제공하는 유료 서비스의 공고를 다시 적었습니다.</p><blockquote>${target(text)}</blockquote><p>저에게 이용 신청을 남기세요.</p></article>`;label=0;}
  if(k===3){text=ad;content=`<section role="list"><div role="comment"><p>${esc(warning)}</p></div><div role="comment">${target(text)}</div></section>`;label=0;}
  if(k===4){text=ad;content=`<article><p>${esc(warning)}</p><blockquote>${target(text)}</blockquote></article>`;label=1;}
  if(k===5){text=warning+' 「'+ad+'」';content=`<article>${target(text)}</article>`;label=1;}
  if(k===6){text=normal[i];content=`<article>${target(text)}</article>`;label=2;}
  if(k===7){text=`2026-${String(i+2).padStart(2,'0')}-19`;content=`<article><div><span>작성 날짜</span>${target(text)}</div><p>${esc(ad)}</p></article>`;label=2;}
  if(k===8){text=cta;content=`<article><p>현재 안내하는 것은 ${esc(programs[i])}의 무료 예약입니다.</p>${target(text,'a')}</article>`;label=2;}
  if(k===9){text=cta;content=`<article>${target(text,'a')}</article>`;label=3;}
  if(k===10){text=cta;content=`<section role="list"><div role="comment"><p>${esc(ad)}</p></div><div role="comment">${target(text,'a')}</div></section>`;label=3;}
  if(k===11){text=['솔잎산책','저녁별빛','이른햇살','겨울하늘','푸른마당','바람동산','달빛정원','잔잔한물결'][i];content=`<article><div><span>글쓴이</span>${target(text)}</div><p>${esc(ad)}</p></article>`;label=2;}
  const tag=[1,8,9,10].includes(k)?'a':'p';const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>주민참여 열린게시판 상세 열람</title><style>body{font:16px sans-serif;color:#222;background:white}main{max-width:900px;margin:24px auto}article,[role=comment]{padding:12px}blockquote{border-left:2px solid #777}</style></head><body><header><h1>주민참여</h1><nav>홈 / 소통 / 게시글</nav></header><main>${content}</main><footer>공공 서비스 이용 안내</footer></body></html>`;
  specs.push({id,selector:tag+'#'+id,text,label,kind:k,html});
 }
 const pages=new Map(specs.map(s=>['/view/'+s.id,s.html])),server=http.createServer((req,res)=>{const v=pages.get(req.url);res.writeHead(v?200:404,{'Content-Type':'text/html; charset=utf-8'});res.end(v||'Not found');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let collector;const inputs=[],labels=[],evidence=[];
 try{collector=await createCollector({channel:'msedge'});for(const spec of specs){const snap=await collector.collect(origin+'/view/'+spec.id,{maxPages:1,maxNodes:1000,followLinks:false,observeTechniques:true}),c=snap.candidates.find(c=>c.selector===spec.selector);assert(c,'Target missing '+spec.id);assert.equal(c.raw_text,spec.text);const e=contract().initialEvidence(c);inputs.push({id:c.node_id,kind:spec.kind,input:{target:e.normalized_text,context:context(c,e)}});labels.push({id:c.node_id,label:spec.label,kind:spec.kind});evidence.push(c);fs.writeFileSync(root+'/'+spec.id+'.html',spec.html);}}
 finally{if(collector)await collector.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 const hashes={};for(const [name,obj]of [['inputs',inputs],['labels',labels],['evidence',evidence]]){const bytes=JSON.stringify(obj,null,2);fs.writeFileSync(root+'/'+name+'.json',bytes);hashes[name+'.json']=sha(bytes);}fs.writeFileSync(root+'/manifest.json',JSON.stringify({rows:inputs.length,hashes,source:'New synthetic public-board HTML, real browser collection, controlled target labels only',human_reviewed:false},null,2));console.log(JSON.stringify({root,rows:inputs.length}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
