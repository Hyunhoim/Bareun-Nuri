// Same-author synthetic development/confirmation sites. Private labels are never served.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,12);
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const routes={},labels={};fs.mkdirSync(path.join(root,'public/assets'),{recursive:true});fs.mkdirSync(path.join(root,'private'),{recursive:true});
const corpora={dev:[
 '사설 카지노 신규 회원을 모집합니다. 가입하고 첫 입금 혜택을 받으세요.',
 '불법 스포츠 베팅방 이용자를 받습니다. 지금 충전하고 현금 환전을 신청하세요.',
 '성인 도박 슬롯 참여자를 모집합니다. 아래 안내로 회원 등록 후 베팅하세요.',
 '사설 바카라 방에서 함께 게임할 회원을 구합니다. 입금 후 바로 이용하세요.'
],confirmation:[
 '허가받지 않은 온라인 경마 서비스를 홍보합니다. 계정을 만들고 참가금을 보내 주세요.',
 '불법 토토 운영방에서 이용자를 찾습니다. 유료 회원으로 등록하고 배당금을 받아 가세요.',
 '사설 현금 도박 게임장 접속 회원을 모집 중입니다. 예치금을 충전하고 참여하세요.',
 '불법 카지노 전용방을 소개합니다. 회원 가입과 송금 후 현금 배당 게임을 시작하세요.'
]};
for(const split of ['dev','confirmation']){
 const confirmation=split==='confirmation',url=i=>i===0?'/'+split+'/':'/'+split+'/'+hash(split+':route:'+i),cases=[];
 labels[split]={entry:url(0),cases,pages:[]};
 const types=i=>i<10?'navigation':i<20?'user':i<26?'normal_board':i<32?'guide':i<36?'admin':'deep_user';
 const links=i=>i===0?(confirmation?[1,9,5,2,3]:[2,3,5,1,9]):i===1?[4,6]:i===2?[26,27,28,29,30,31]:i===3?[32,33,34,35]:
  i===4?[10,11,12,13,14,8]:i===5?[20,21,22,23,24,25]:i===6?[7]:i===7?[36,37,38,39]:i===8?[15,16,17,18,19]:[];
 function field(i,j,ad,surface,long=false){
  const id='e'+hash(split+':element:'+i+':'+j),tech=long?(confirmation?'OFFSCREEN':'TRANSPARENT'):['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'][(i+j+(confirmation?1:0))%4];
  const invitation=corpora[split][(i+j)%4];
  let text=ad?invitation:(i+j)%2?'예방 교육 자료입니다. 다음 광고를 신고하고 이용하지 마세요: 「'+invitation+'」':'지역 도서관과 공원 이용 시간을 안내합니다. 행사 참여는 무료이며 담당 부서에서 운영합니다.';
  if(long)text=('시설 개선 의견을 정리합니다. 주민 편의와 접근성을 함께 고려합니다. ').repeat(340)+text;
  if(tech==='HOMOGLYPH')text='ＡＢＣ · '+text;
  if(tech==='JAMO')text=text.normalize('NFD');
  const style=tech==='TRANSPARENT'?'opacity:0':tech==='OFFSCREEN'?'position:absolute;left:-9999px':'';
  const tag=surface==='title'?(confirmation?'h3':'h2'):'p';
  let inside=esc(text);
  if(i%5===0&&!long){const cut=Math.floor(text.length/2);inside='<span>'+esc(text.slice(0,cut))+'</span><em>'+esc(text.slice(cut))+'</em>';}
  cases.push({case_id:split+'-'+i+'-'+j,page:url(i),selector:tag+'#'+id,is_ad:ad,techniques:ad?[tech]:[],observed:[tech],surface,category:types(i),long,text});
  return `<${tag} id="${id}" style="${style}">${inside}</${tag}>`;
 }
 for(let i=0;i<40;i++){
  const type=types(i),neighbors=links(i),isList=[2,3,4,5,7,8].includes(i);
  let heading=i===0?'시민 생활 포털':i===3?'기관 알림':i===2?'생활 서비스':i===5?'주민 소식':i<10?'참여 안내':'생활 의견';
  let intro=[4,5,7,8].includes(i)?'시민 누구나 글을 작성할 수 있습니다.':i===3?'이 게시판에는 기관 담당자만 공지사항을 작성합니다.':'지역 생활과 행정 서비스 정보를 제공합니다.';
  let body='';
  if(i>=10){
   const k=type==='user'?i-10:type==='guide'?i-26:type==='admin'?i-32:i-36;
   const ad1=type==='user'?k%3!==1:type==='normal_board'?false:k%2===0;
   const ad2=type==='user'?k%4===1:type==='deep_user'?k%3===0:type==='admin'&&k===3;
   const title=i%3===0;
   body=field(i,0,ad1,title?'title':'body',[26,36].includes(i));
   body+=`<section ${confirmation?'role="comment"':'class="feedback"'}><h2>주민 의견</h2>${field(i,1,ad2,'comment')}</section>`;
   if(type==='user'||type==='normal_board'||type==='deep_user'||i===35)intro='의견 남기기: 로그인 후 댓글 작성이 가능합니다.';
   if(type==='admin'&&i!==35)intro='이 자료는 기관 담당자만 작성하는 공지입니다.';
  }
  const anchor=n=>`<a href="${url(n)}">${n===4?'시민 게시판':n===8?'다음 목록':n===6?'소통 창구':n<10?'이용 메뉴':'생활 자료 '+(n+1)}</a>`;
  const nav=isList?`<table><caption>자료 목록</caption><tbody>${neighbors.map(n=>'<tr><td>'+anchor(n)+'</td></tr>').join('')}</tbody></table>`:
   `<nav>${neighbors.map(anchor).join(' ')}</nav>`;
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${heading}</title><link rel="stylesheet" href="/assets/site.css"></head><body><header><a href="${url(0)}">시민 포털</a></header><main><h1>${heading}</h1><p>${intro}</p>${body}${nav}</main><footer>가상의 기관 · 소프트웨어 검증용 합성 자료</footer></body></html>`;
  const file=hash(split+':file:'+i)+'.html';fs.writeFileSync(path.join(root,'public',file),html);routes[url(i).replace(/\/$/,'')]=file;
  labels[split].pages.push({url:url(i),category:type});
 }
}
fs.writeFileSync(path.join(root,'public/assets/site.css'),'body{font:16px sans-serif;margin:24px}main{max-width:960px}header,footer{padding:12px;background:#eef2f5}td{padding:8px}p{white-space:pre-wrap}');
fs.writeFileSync(path.join(root,'private/routes.json'),JSON.stringify(routes,null,2));
fs.writeFileSync(path.join(root,'private/labels.json'),JSON.stringify(labels,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(labels).map(([s,x])=>[s,{pages:x.pages.length,labels:x.cases.length,ads:x.cases.filter(c=>c.is_ad).length,long:x.cases.filter(c=>c.long).length}]))));
