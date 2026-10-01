// Synthetic structural fixtures. Gold is separate from all observable page features.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {rng,shuffle}=require('../agent/experiments/navigation.cjs');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,14),esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function build(root=__dirname){
 fs.mkdirSync(path.join(root,'public'),{recursive:true});fs.mkdirSync(path.join(root,'private'),{recursive:true});const catalog=[],gold={};
 for(const seed of [101,102,103,201,202,203]){
  const confirmation=seed>=200,split=confirmation?'confirmation':'dev',id=split+'-'+seed,base='http://'+id+'.fixture.test',r=rng(seed);
  const pages=[],map=new Map(),cases=[],kinds=shuffle(['normal_board','user','guide','admin','deep_user','normal_board','user','deep_user'],seed);
  const url=key=>key==='root'?base+'/':base+'/'+hash(seed+':route:'+key);
  const add=(key,title,intro,body='',category='navigation',links=[])=>{const p={key,url:url(key),title,intro,body,category,links,template:Math.floor(r()*4)};pages.push(p);map.set(key,p);return p;};
  add('root','시민 서비스 포털','지역 생활과 기관 정보를 제공합니다.');
  const targetGroups=[];
  for(let g=0;g<8;g++){
   const kind=kinds[g],target='g'+g+'p0';targetGroups.push(target);
   const heading=['user','deep_user','normal_board'].includes(kind)?'주민 의견 게시판':kind==='admin'?'기관 알림':'생활 안내';
   const intro=['user','deep_user','normal_board'].includes(kind)?'누구나 글을 작성하고 의견을 남길 수 있습니다.':'공공 서비스 정보를 안내합니다.';
   for(let pg=0;pg<3;pg++)add('g'+g+'p'+pg,heading,intro,'','navigation');
   const ads=new Set(kind==='normal_board'?[]:shuffle(Array.from({length:12},(_,i)=>i),seed*31+g).slice(0,4));
   const commentAd=[...ads][0];
   for(let d=0;d<12;d++){
    const key='g'+g+'d'+d,ad=ads.has(d),comment=ad&&d===commentAd;
    const normal=`지역 시설 이용에 대한 의견 ${g+1}-${d+1}입니다. 이용 시간과 이동 동선을 개선하고 누구나 편리하게 참여하도록 안내해 주세요.`;
    const offer=(confirmation?'불법 온라인 경마 회원을 모집합니다. 계정을 만들고 참가금을 보내 배당 게임에 참여하세요.':'사설 카지노 가입자를 모집합니다. 지금 입금하고 유료 게임에 참여하세요.');
    let body='';
    for(let j=0;j<2;j++){
     const positive=ad&&(j===1)===comment,tech=['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'][(d+g+j)%4];
     let text=positive?offer:j===0?normal:d%3===0?'예방 교육용 인용입니다. 다음 광고는 이용하지 말고 신고하세요: 「'+offer+'」':'정상적인 시설 운영 의견입니다. 다른 주민들과 행사 안내를 함께 확인합니다.';
     if(tech==='JAMO')text=text.normalize('NFD');if(tech==='HOMOGLYPH')text='ＡＢＣ · '+text;
     const eid='e'+hash(seed+':element:'+key+j),tag=j===0&&d%4===0?'h2':'p';
     const style=tech==='TRANSPARENT'?'opacity:0':tech==='OFFSCREEN'?'position:absolute;left:-9999px':'';
     const middle=Math.floor(text.length/2),content=d%3===1?'<span>'+esc(text.slice(0,middle))+'</span><em>'+esc(text.slice(middle))+'</em>':esc(text);
     body+=(j===1?'<section role="comment"><h3>주민 답글</h3>':'')+`<${tag} id="${eid}" style="${style}">${content}</${tag}>`+(j===1?'</section>':'');
     cases.push({page:url(key),selector:tag+'#'+eid,is_ad:positive,category:kind,surface:j===1?'comment':tag==='h2'?'title':'body',techniques:positive?[tech]:[],text});
    }
    if(confirmation&&d%2===0)body='<div role="article">'+body+'</div>';else if(!confirmation)body='<article>'+body+'</article>';
    const p=add(key,'생활 기록 '+(g+1)+'-'+(d+1),'작성일 2026-09-01 · 지역 주민',body,kind);
    p.links=[{to:'g'+g+'p'+Math.floor(d/4),text:'목록으로',nav:true}];
    if(confirmation&&d<11)p.links.push({to:'g'+g+'d'+(d+1),text:'다른 기록',nav:true});
   }
   for(let pg=0;pg<3;pg++){
    const p=map.get('g'+g+'p'+pg);p.template=(g+seed)%4;
    p.links=Array.from({length:4},(_,i)=>({to:'g'+g+'d'+(pg*4+i),text:(g%3===0?'게시글 보기':confirmation?'자료 확인':'생활 자료')+' '+(pg*4+i+1),nav:false}));
    if(pg<2)p.links.push({to:'g'+g+'p'+(pg+1),text:'다음 목록',nav:true});
    if(confirmation&&pg===2)p.links.push({to:'g'+((g+3)%8)+'p0',text:'연결 서비스',nav:true});
   }
   if(kind==='deep_user'){
    const depth=confirmation?5:3;for(let k=depth-1;k>=0;k--)add('g'+g+'x'+k,'이용 안내','관련 서비스를 선택해 주세요.','','navigation',[{to:k===depth-1?target:'g'+g+'x'+(k+1),text:confirmation?'안내 내용':'참여 안내',nav:true}]);
    targetGroups[g]='g'+g+'x0';
   }
  }
  if(confirmation){
   for(let n=0;n<4;n++)add('gateway'+n,'통합 서비스','분야별 정보를 확인합니다.','','navigation',targetGroups.slice(n*2,n*2+2).map(to=>({to,text:n%2?'업무 안내':'소통 서비스',nav:true})));
   map.get('root').links=shuffle(Array.from({length:4},(_,n)=>({to:'gateway'+n,text:n%2?'생활 안내':'시민 참여',nav:true})),seed+9);
  }else map.get('root').links=shuffle(targetGroups.map((to,g)=>({to,text:g%3===0?'시민 게시판':g%3===1?'공공 서비스':'관련 안내',nav:true})),seed+9);
  const files={};
  for(const p of pages){
   const content=p.links.filter(l=>!l.nav).map(l=>`<a href="${url(l.to)}">${esc(l.text)}</a>`);
   const list=p.template===0?'<table><tbody>'+content.map(x=>'<tr><td>'+x+'</td></tr>').join('')+'</tbody></table>':p.template===1?'<article><ul>'+content.map(x=>'<li>'+x+'</li>').join('')+'</ul></article>':p.template===2?'<section><ol>'+content.map(x=>'<li><span>'+x+'</span></li>').join('')+'</ol></section>':'<div role="list">'+content.map(x=>'<div role="listitem">'+x+'</div>').join('')+'</div>';
   const nav='<nav>'+p.links.filter(l=>l.nav).map(l=>`<a href="${url(l.to)}">${esc(l.text)}</a>`).join(' ')+'</nav>';
   const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${p.title}</title></head><body><header><a href="${url('root')}">포털 홈</a></header><main><h1>${p.title}</h1><p>${p.intro}</p>${p.body}${list}${nav}</main><footer>가상 기관의 탐색 검증용 사이트</footer></body></html>`;
   const file=id+'/'+hash(p.key)+'.html';fs.mkdirSync(path.join(root,'public',id),{recursive:true});fs.writeFileSync(path.join(root,'public',file),html);files[p.url]=file;
  }
  const resources={};
  for(const condition of ['none','full','partial','stale']){
   const res={},save=(route,body)=>{const file=id+'/'+condition+'-'+route.slice(1);fs.writeFileSync(path.join(root,'public',file),body);res[base+route]=file;};
   save('/robots.txt',condition==='none'?'User-agent: *\nAllow: /\n':'User-agent: *\nAllow: /\nSitemap: '+base+'/sitemap.xml\n');
   if(condition!=='none'){
    save('/sitemap.xml','<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[1,2].map(n=>'<sitemap><loc>'+base+'/part'+n+'.xml</loc></sitemap>').join('')+'</sitemapindex>');
    let urls=shuffle(pages.map(p=>p.url),seed+555);
    if(condition==='partial')urls=urls.filter(u=>parseInt(hash(u).slice(0,6),16)%2===0);
    if(condition==='stale'){urls=urls.filter(u=>parseInt(hash(u).slice(0,6),16)%4===0);urls=shuffle([...urls,...Array.from({length:32},(_,i)=>base+'/'+hash('gone:'+seed+':'+i))],seed+91);}
    for(let n=1;n<=2;n++)save('/part'+n+'.xml','<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.filter((_,i)=>i%2===n-1).map(u=>'<url><loc>'+esc(u)+'</loc></url>').join('')+'</urlset>');
   }resources[condition]=res;
  }
  catalog.push({id,split,entry:base+'/',scope:'/',files,resources});gold[id]={cases,pages:pages.map(p=>({url:p.url,category:p.category}))};
 }
 fs.writeFileSync(path.join(root,'private/catalog.json'),JSON.stringify(catalog,null,2));fs.writeFileSync(path.join(root,'private/labels.json'),JSON.stringify(gold,null,2));return catalog;
}
if(require.main===module)console.log(build().map(s=>({site:s.id,pages:Object.keys(s.files).length})));
module.exports={build};
