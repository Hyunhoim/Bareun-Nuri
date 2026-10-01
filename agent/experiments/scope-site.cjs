// Development/evaluation fixture only. Labels never appear in served HTML.
const http=require('node:http'),crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,10),esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;');
const shell=(title,body)=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title></head><body><header><span>시민 소통 누리집</span></header><main>${body}</main></body></html>`;
function site(index,origin,frameOrigin){
 const routes=new Map(),frames=new Map(),labels=[],entry=origin+'/portal/start';
 const areas=['/guide/index','/board/list?board=free','/notice/list','/menus/services','/board/list?board=ideas','/menus/archive'];
 const names=['이용 안내','자유 의견','기관 공지','생활 정보','시민 제안','자료실'];
 const link=(url,text)=>`<a href="${esc(url)}">${text}</a>`;
 const add=(url,body)=>routes.set(new URL(url,origin).href,shell('시민 안내 '+index,body));
 let n=0;
 for(let a=0;a<6;a++){
  const items=[];
  for(let j=0;j<3;j++){
   const url=origin+(['/content/view?id=','/read?record=','/article/detail?no='][index%3])+(100+a*7+j),key='e'+hash(index+':'+a+':'+j);
   items.push(link(url,'게시물 '+(j+1)));
   if(j===1){add(url,`<h2>생활 소식</h2><p>주민을 위한 문화 프로그램이 열립니다. 참여 방법은 안내 창구에서 확인할 수 있습니다.</p>${link(entry,'처음으로')}`);continue;}
   const tech=['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'][n%4];
   const base=index===0?'사설 카지노 회원을 모집합니다. 가입 후 지금 충전하면 추가 포인트를 드립니다. 아래 연락처로 신청하세요.':'불법 온라인 경마 회원 가입을 받습니다. 지금 입금하고 배팅에 참여하세요. 상담 주소로 연락하면 이용 방법을 알려드립니다.';
   const raw=tech==='JAMO'?base.normalize('NFD'):tech==='HOMOGLYPH'?base.replace(index===0?'카지노':'온라인','ＣＡＳＩＮＯ'):base;
   const style=tech==='TRANSPARENT'?'color:transparent':tech==='OFFSCREEN'?'position:absolute;left:-9999px':'';
   const tag=j===0?(a%2?'h2':'p'):'p',selector=tag+'#'+key;
   let payload=`<${tag} id="${key}" style="${style}">${raw}</${tag}>`,location=selector;
   const useFrame=j===2&&a%2===0;
   if(useFrame){const src=(a===0?frameOrigin:origin)+'/widget/'+key;
    const inside=shell('이용자 의견',`<aside role="comment">${payload}</aside>`);
    (a===0?frames:routes).set(src,inside);payload=`<iframe src="${src}"></iframe>`;location=`iframe[src="${src}"] >>> ${selector}`;
   }
   const normalKey='n'+key,normalText='다음은 예방 교육용 예시이며 이용을 권유하는 글이 아닙니다: '+raw;
   add(url,`<article><h1>시민 게시물</h1>${j===0?payload:''}</article>${j===2?'<aside role="comment">'+payload+'</aside>':''}<section><blockquote id="${normalKey}">${normalText}</blockquote></section>${link(entry,'처음으로')}`);
   labels.push({page:url,location,selector,text:raw,is_ad:true,techniques:[tech],category:a===5?'deep':useFrame?'frame':j===0?'body_or_title':'comment'});
   labels.push({page:url,location:'blockquote#'+normalKey,selector:'blockquote#'+normalKey,text:normalText,is_ad:false,techniques:[],category:'prevention'});n++;
  }
  const body=`<h1>${names[a]}</h1><p>${a%2?'시민 누구나 의견을 작성할 수 있습니다.':'기관의 정보를 확인하는 공간입니다.'}</p>`+(a%2?`<table><tbody><tr><td>${items.join(' ')}</td></tr></tbody></table>`:`<nav>${items.join(' ')}</nav>`)+link(entry,'홈');
  if(a===5){let current=areas[a];for(let d=0;d<2+index;d++){const next='/archive/route?step='+d;add(current,`<h1>자료 안내</h1>${link(next,'다음 자료')}`);current=next;}add(current,body);}
  else add(areas[a],body);
 }
 const order=index?[3,1,5,0,4,2]:[0,1,2,3,4,5];
 add(entry,`<h1>열린 소통</h1><nav>${order.map(a=>link(areas[a],names[a])).join(' ')}</nav>${link(frameOrigin+'/unrelated','외부 기관')}`);
 return {id:'mixed-'+index,entry,routes,frames,labels};
}
async function start(){
 const frameOrigin='http://127.0.0.1:18986',sites=[0,1].map(i=>site(i,'http://127.0.0.1:'+(18984+i),frameOrigin));
 const create=routes=>http.createServer((req,res)=>{const url=new URL(req.url,'http://'+req.headers.host).href,body=routes.get(url);res.writeHead(body?200:404,{'Content-Type':'text/html; charset=utf-8'});res.end(body||'Not found');});
 const servers=[...sites.map(s=>create(s.routes)),create(new Map(sites.flatMap(s=>[...s.frames])))];
 try{for(let i=0;i<servers.length;i++)await new Promise((r,j)=>{servers[i].once('error',j);servers[i].listen(18984+i,'127.0.0.1',r);});}
 catch(e){for(const s of servers)s.close();throw e;}
 return {sites,close:async()=>{for(const s of servers){s.closeAllConnections();await new Promise(r=>s.close(r));}}};
}
module.exports={start,site};
