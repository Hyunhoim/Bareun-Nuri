// Synthetic public-site structures. Labels stay outside the served directory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {shuffle}=require('../agent/experiments/navigation.cjs');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,16);
const configs=[
 ['dev-a',41,24,32,16,[4,6],[5,7,9],0],['dev-b',53,36,40,12,[3,5],[6,8],1],
 ['dev-c',67,16,28,24,[5,7],[4,8,10],2],['dev-d',79,22,36,20,[4,8],[6,7,9],3],
 ['check-e',103,30,44,16,[5,7],[7,10],4],['check-f',127,18,32,28,[4,6],[5,8,11],5],
 ['check-g',149,26,40,20,[6,8],[4,7,9],6],['check-h',173,20,28,32,[5,9],[6,8,10],7]
];
const offers=[
 '사설 카지노 신규 회원을 모집합니다. 충전금을 입금하고 유료 배팅에 참여하세요.',
 '불법 온라인 경마 회원 가입을 받습니다. 참가금을 보내고 배당 게임을 시작하세요.',
 '불법 스포츠 도박 이용자를 모집합니다. 가입 후 돈을 충전하면 추가 배팅금을 드립니다.',
 '허가 없는 온라인 슬롯에 접속하세요. 현금 입금 후 유료 게임에 참여할 회원을 모집합니다.'
];
function build(){
 const catalog=[],labels={};fs.mkdirSync(path.join(__dirname,'public'),{recursive:true});fs.mkdirSync(path.join(__dirname,'private'),{recursive:true});
 for(const [idx,c]of configs.entries()){
  const [id,seed,breadth,concentrated,normalCount,lengths,deadLengths,variant]=c,origin='http://127.0.0.1:'+(19010+idx);
  const pages=[],map=new Map(),cases=[];let serial=0;
  function route(section,n,list=false){
   if(variant===4)return `/cms/${section}/index.do?mode=${list?'list':'view'}&${list?'pageNo':'seq'}=${n}`;
   if(variant===5)return `/city/bbs/${list?'index':'detail'}/${n}?category=${section}`;
   if(variant===6)return `/service.do?menu=${section}&${list?'page':'document'}=${n}`;
   if(variant===7)return `/${section}/${list?'pages':'documents'}/${n}/detail.html`;
   switch(variant%4){
    case 0:return `/board/${list?'list':'view'}?board=${section}&${list?'page':'id'}=${n}`;
    case 1:return `/portal/${section}/${list?'list':'view'}.do?${list?'pageIndex':'nttId'}=${n}&menuSeq=${seed}`;
    case 2:return `/${section}/${list?'index':'record'}/${n}`;
    default:return `/content${variant>3?'.do':''}?section=${section}&${list?'page':'item'}=${n}`;
   }
  }
  function add(key,title,kind='guide',section='service',url){
   const no=seed*1000+(++serial)*17,p={key,title,kind,section,url:url||route(section,no),no,links:[],nodes:[],parent:'root',scenario:'normal'};
   pages.push(p);map.set(key,p);return p;
  }
  const root=add('root','온누리시 시민 서비스','home','home','/');
  const hub=add('hub','분야별 생활 안내','hub','service',route('service',1,true));
  const admin=add('admin','시정 소식과 알림','hub','notice',route('notice',1,true));
  const archive=add('archive','지역 자료 안내','hub','resources',route('resources',1,true));
  const participation=add('participation','시민 참여','hub','community',route('community',1,true));
  const link=(a,b,text)=>{const p=typeof a==='string'?map.get(a):a,q=typeof b==='string'?map.get(b):b;p.links.push({to:q.key,text:text||q.title});};
  for(const p of [hub,admin,archive,participation])link(root,p);
  for(let i=0;i<breadth;i++){const p=add('guide'+i,['생활 서비스','시설 이용','지원 안내','공공 자료'][i%4]+' '+(i+1),i%5===0?'notice':'guide','service');link(variant%2&&i%3===0?hub:root,p);p.parent=variant%2&&i%3===0?hub.key:root.key;}
  for(let i=0;i<4;i++){const p=add('front'+i,['문화 행사 안내','주민 소통 안내','이용 시간 안내','시설 예약 안내'][i],i%2?'guide':'notice','service');link(root,p);p.scenario='shallow';p.adCount=1;}
  function board(prefix,count,parent,section){
   const lists=[];for(let n=0;n<Math.ceil(count/8);n++){const p=add(prefix+'list'+n,section==='opinion'?'주민 의견':section==='records'?'지역 활동 기록':'시민 참여 자료','list',section,route(section,n+1,true));p.parent=parent.key;lists.push(p);}
   link(parent,lists[0]);
   const posts=[];for(let n=0;n<count;n++){const p=add(prefix+'post'+n,'생활 환경 개선 의견 '+(n+1),'post',section);p.parent=lists[Math.floor(n/8)].key;link(lists[Math.floor(n/8)],p);posts.push(p);}
   for(let n=0;n<lists.length;n++){
    if(n)link(lists[n],lists[n-1],'이전 목록');if(n+1<lists.length)link(lists[n],lists[n+1],'다음 목록');
    if(variant%3===1)for(const p of lists)if(p!==lists[n])link(lists[n],p,'목록 '+(lists.indexOf(p)+1));
   }
   if(variant>=4)for(let n=0;n<posts.length;n++){if(n)link(posts[n],posts[n-1],'이전 글');if(n+1<posts.length)link(posts[n],posts[n+1],'다음 글');}
   return {lists,posts};
  }
  const cluster=board('community',concentrated,participation,'opinion');
  for(const n of shuffle(Array.from({length:concentrated},(_,i)=>i),seed+909).slice(0,12)){cluster.posts[n].scenario='concentrated';cluster.posts[n].adCount=1;}
  board('residents',normalCount,variant%2?hub:participation,'residents');
  for(let i=0;i<8;i++){
   const kind=['guide','notice','post','cards','directory','list','faq','frame'][i],p=add('distributed'+i,['지원 절차','운영 공지','주민 기록','문화 프로그램','담당 업무','자료 목록','자주 묻는 질문','시민 의견 모음'][i],kind,['welfare','notice','records','culture','office','documents','help','voice'][i]);
   const parent=[hub,admin,participation,hub,admin,archive,hub,admin][i];link(parent,p);p.parent=parent.key;p.scenario='dispersed';p.adCount=1;
   if(variant>=4&&i%3===0)link(map.get('guide'+((i*3)%breadth)),p,'관련 서비스');
  }
  for(const [branch,length]of lengths.entries()){
   let parent=variant%2?archive:participation;
   for(let n=0;n<length;n++){const p=add('route'+branch+'step'+n,['기관 자료','참여 절차','지역별 안내','자료 열람'][n%4],'hub',variant%2?'resources':'community');link(parent,p,n%2?'내용 확인':'관련 안내');p.parent=parent.key;parent=p;
    if(variant>=4&&n===2){const side=add('route'+branch+'side','업무 참고 자료','guide','resources');link(p,side,'참고 사항');side.parent=p.key;}
   }
   const b=board('historical'+branch,4,parent,branch?'history':'records');
   for(let n=0;n<2;n++){b.posts[n].scenario='deep';b.posts[n].adCount=2;}
  }
  for(const [branch,length]of deadLengths.entries()){
   let parent=[hub,archive,admin][branch%3];
   for(let n=0;n<length;n++){const p=add('procedure'+branch+'step'+n,['자료 이용','행정 절차','분야별 안내','관련 정보'][n%4],n%3===1?'guide':'hub','procedure');p.dead=true;link(parent,p,n%2?'자세히 보기':'안내 계속');p.parent=parent.key;parent=p;
    if(variant>=4&&n===2){const leaf=add('procedure'+branch+'side','처리 기준 안내','notice','procedure');leaf.dead=true;link(p,leaf);leaf.parent=p.key;}
   }
   const last=add('procedure'+branch+'end','이용 절차 안내 완료','guide','procedure');last.dead=true;link(parent,last);last.parent=parent.key;
  }
  // Same-origin cross links, repeated navigation and fragments are intentional.
  if(variant>=4){link(hub,admin,'관련 시정 소식');link(archive,participation,'주민 참여');link(participation,archive,'기관 자료');}
  const surfaces=['title','body','comment','author','signature','link'];let adIndex=0;
  for(const p of pages){
   const slots=p.kind==='frame'?['body','comment']:['title','body','comment','author','signature','link'];
   const preferred=surfaces[(p.no+variant)%surfaces.length],adSlots=p.kind==='frame'?['comment']:p.adCount===2?['body','comment']:[preferred];
   for(const [j,surface]of slots.entries()){
    const isAd=!!p.adCount&&adSlots.includes(surface),tech=isAd?['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'][adIndex++%4]:['NONE','NONE','NONE','HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'][(p.no+j)%7];
    const normal=surface==='title'?p.title:surface==='author'?'시민 '+(p.no%89+1):surface==='signature'?'지역 생활을 함께 개선해 주세요.':surface==='link'?'서비스 이용 안내':surface==='comment'?'시설 이용 방법을 확인했습니다. 안내해 주셔서 감사합니다.':'지역 주민을 위한 '+p.title+' 자료입니다. 접수 방법과 이용 시간을 확인하고 담당 부서에 문의해 주세요. 자료 번호 '+p.no+'를 안내합니다.';
    let text=isAd?offers[(p.no+j)%offers.length]:normal;
    if(!isAd&&surface==='body'&&p.no%11===0)text='예방 교육 자료입니다. 다음 광고는 이용하지 말고 신고하세요. 「'+offers[p.no%4]+'」';
    if(!isAd&&surface==='body'&&p.no%23===0)text+=' '+('신청 자격과 운영 기준을 확인하며 개인정보 보호와 안전한 시설 이용을 안내합니다. '.repeat(110));
    if(tech==='JAMO')text=text.normalize('NFD');if(tech==='HOMOGLYPH')text='CASINО · '+text;
    const eid='n'+hash(seed+':'+p.key+':'+surface),frame=p.kind==='frame'&&surface==='comment';
    p.nodes.push({surface,text,tech,eid,frame});
    cases.push({page:origin+p.url,selector:'#'+eid,frame:frame?'iframe#feedback':null,is_ad:isAd,scenario:isAd?p.scenario:'normal',section:p.section,surface,technique:tech,text});
   }
   if(p.links.length)link(p,p.links[0].to,p.links[0].text); // duplicate destination, not a duplicate request
  }
  assert.equal(cases.filter(x=>x.is_ad).length,32);
  const files={};
  function node(p,surface){const n=p.nodes.find(n=>n.surface===surface);if(!n)return '';const style=n.tech==='TRANSPARENT'?'color:rgba(0,0,0,0)':n.tech==='OFFSCREEN'?'position:absolute;left:-10000px;top:0':'';
   const content=surface==='body'&&p.no%2===0?'<span>'+esc(n.text.slice(0,Math.floor(n.text.length/2)))+'</span><em>'+esc(n.text.slice(Math.floor(n.text.length/2)))+'</em>':esc(n.text);
   const tag=surface==='title'?'h1':surface==='link'?'a':surface==='body'&&['post','notice'].includes(p.kind)?'p':'div';
   const html=`<${tag} id="${n.eid}"${surface==='link'?' href="'+esc(map.get(p.parent).url)+'"':''} style="${style}">${content}</${tag}>`;
   return n.frame?`<iframe id="feedback" title="주민 의견" srcdoc="${esc('<!doctype html><html lang="ko"><meta charset="utf-8"><body>'+html+'</body></html>')}"></iframe>`:html;
  }
  for(const p of pages){
   const anchors=p.links.map(l=>`<a href="${esc(map.get(l.to).url)}">${esc(l.text)}</a>`);
   const links=p.kind==='list'?`<form><label>검색 조건 <select><option>제목</option><option>내용</option><option>작성자</option></select></label> <label>검색어 <input name="keyword"></label><button type="button">검색</button></form><p class="count">자료 목록</p><table><caption>번호, 제목, 작성자, 등록일, 조회수</caption><thead><tr><th>번호</th><th>제목</th><th>작성자</th><th>등록일</th><th>조회</th></tr></thead><tbody>${anchors.map((a,i)=>`<tr><td>${i+1}</td><td>${a}</td><td>주민</td><td>2026-09-01</td><td>${i*7}</td></tr>`).join('')}</tbody></table>`:p.kind==='home'||p.kind==='cards'||p.kind==='hub'?`<ul class="cards">${anchors.map(a=>'<li>'+a+'</li>').join('')}</ul>`:`<nav class="related" aria-label="관련 자료">${anchors.join(' ')}</nav>`;
   const article=['post','notice'].includes(p.kind)?`<article>${node(p,'body')}<p>공개된 자료를 확인하고 필요한 사항은 담당 창구에 문의해 주세요. 기록 번호 ${p.no}입니다.</p></article>`:`<section class="content">${node(p,'body')}</section>`;
   const parent=map.get(p.parent),nav=[hub,admin,participation,archive].filter(q=>q.key!==p.key).map(q=>`<a href="${esc(q.url)}">${esc(q.title)}</a>`).join('');
   const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)} | 온누리시</title><link rel="stylesheet" href="/site.css"></head><body><a class="skip" href="#main">본문 바로가기</a><div class="fixture">가상 공공기관 · 탐색 알고리즘 측정용 합성 사이트 · 실제 기관/서비스가 아닙니다</div><header><a class="brand" href="/">온누리시 <small>ONNURI CITY</small></a><nav aria-label="주 메뉴">${nav}</nav></header><div class="layout"><aside><h2>시민 서비스</h2>${nav}<p>안내 · 참여 · 자료</p></aside><main id="main"><nav class="breadcrumb"><a href="/">홈</a> / <a href="${esc(parent.url)}">${esc(parent.title)}</a></nav>${node(p,'title')||'<h1>'+esc(p.title)+'</h1>'}<div class="meta">${node(p,'author')}<time datetime="2026-09-01">2026.09.01</time> · 조회 ${p.no%1000}</div>${article}${links}<section class="comments"><h2>의견과 답글</h2>${node(p,'comment')}</section><div class="signature">${node(p,'signature')}${node(p,'link')}</div><nav class="bottom"><a href="${esc(parent.url)}">목록으로</a> <a href="${esc(p.url)}#main">맨 위로</a></nav></main></div><footer>가상 온누리시 시민지원과 · 이 페이지는 성능 측정용으로 제작되었습니다. <a href="https://external.example.invalid/">외부 관련 기관</a></footer></body></html>`;
   const filename=id+'/'+hash(p.key)+'.html';fs.mkdirSync(path.join(__dirname,'public',id),{recursive:true});fs.writeFileSync(path.join(__dirname,'public',filename),html);files[p.url]=filename;
  }
  // Shortest distances are evaluation-only and include repeated global menus/backlinks.
  const edges=p=>[...new Set(['root',p.parent,...[hub,admin,participation,archive].map(q=>q.key),...p.links.map(l=>l.to)])],depth={root:0},q=['root'];
  for(let i=0;i<q.length;i++)for(const to of edges(map.get(q[i])))if(depth[to]===undefined){depth[to]=depth[q[i]]+1;q.push(to);}
  assert.equal(q.length,pages.length);assert(pages.length>=120&&pages.length<=200,'Page count '+id+': '+pages.length);
  for(const label of cases){const p=pages.find(p=>origin+p.url===label.page);label.depth=depth[p.key];label.dead_end_branch=!!p.dead;}
  assert(cases.filter(x=>x.is_ad&&x.scenario==='shallow').every(x=>x.depth<=2));assert(cases.filter(x=>x.is_ad&&x.scenario==='deep').every(x=>x.depth>=5));
  labels[id]={cases,page_meta:pages.map(p=>({url:origin+p.url,depth:depth[p.key],kind:p.kind,scenario:p.scenario,dead:!!p.dead}))};
  catalog.push({id,split:id.startsWith('dev')?'dev':'confirmation',origin,entry:origin+'/',port:19010+idx,pages:pages.length,files});
 }
 fs.writeFileSync(path.join(__dirname,'public','site.css'),`*{box-sizing:border-box}body{margin:0;color:#243447;background:#f6f8fb;font:16px/1.7 system-ui,'Malgun Gothic',sans-serif}a{color:#155898;text-decoration:none}a:hover{text-decoration:underline}a:focus-visible{outline:3px solid #ffad2f}header{background:white;border-bottom:2px solid #226da4;padding:24px 6%;display:flex;gap:45px;align-items:center}.brand{font-size:30px;font-weight:800;white-space:nowrap}.brand small{display:block;font-size:11px;letter-spacing:3px}nav a{display:inline-block;margin:5px 12px 5px 0}header nav a{margin-right:22px}.fixture{padding:8px 6%;background:#153d65;color:white;font-size:13px}.layout{max-width:1240px;margin:32px auto;display:grid;grid-template-columns:220px 1fr;gap:34px;padding:0 20px}aside{background:white;padding:20px;align-self:start;border:1px solid #d5dfe9}aside a{display:block;padding:12px 0;border-bottom:1px solid #edf1f6}main{min-width:0;background:white;padding:32px;border:1px solid #d5dfe9;position:relative;overflow:hidden}.breadcrumb,.meta{font-size:13px;color:#6b7f92}.meta{display:flex;gap:15px;padding:12px 0;border-block:1px solid #ddd}h1{font-size:29px;line-height:1.45}h2{font-size:19px}.content,article{padding:25px 0}em{font-style:normal}.cards{list-style:none;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.cards li{border:1px solid #dce4ec;padding:16px;background:#f8fbff}table{width:100%;border-collapse:collapse;font-size:14px}caption{text-align:left;font-size:12px;color:#718297}th{background:#eef4f9}td,th{padding:12px 6px;border-bottom:1px solid #dbe2ea;text-align:left}form{padding:16px;background:#f2f5f8}input,select,button{font:inherit;padding:6px;max-width:100%}.comments{margin-top:28px;border-top:2px solid #3e6989;padding:12px 0}.signature{color:#52697c;font-size:14px}.bottom{margin-top:24px;border-top:1px solid #ddd}.skip{position:absolute;top:-80px}.skip:focus{top:0;background:white;z-index:9}iframe{width:100%;height:160px;border:1px solid #ddd}footer{padding:30px 6%;background:#e4ebf2;font-size:13px}@media(max-width:800px){.layout{grid-template-columns:1fr}aside{display:none}.cards{grid-template-columns:1fr 1fr}header{display:block}main{padding:20px}}`);
 fs.writeFileSync(path.join(__dirname,'private','catalog.json'),JSON.stringify(catalog,null,2));fs.writeFileSync(path.join(__dirname,'private','labels.json'),JSON.stringify(labels,null,2));
 console.log(JSON.stringify(catalog.map(({id,pages,port})=>({id,pages,port})),null,2));return catalog;
}
if(require.main===module)build();module.exports={build};
