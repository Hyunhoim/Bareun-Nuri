// Controlled development/confirmation pages; gold stays outside served HTML.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createCollector}=require('../src/core/collect.cjs');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const texts={
 dev:{ad:'사설 스포츠 베팅방 회원을 받습니다. 가입하고 충전하면 현금 배당 게임을 이용할 수 있습니다.',
  warning:'피해 상담 기록에 등장한 권유 문장을 자료로 옮겼습니다. 아래 인용은 홍보가 아니며 돈을 보내면 피해를 입을 수 있습니다.',
  linked:'다음 연결은 사설 도박방의 가입 창구입니다. 충전할 회원은 이곳을 이용하세요.',link:'입장 창구 열기',
  normal:'주민 도서교환 행사 신청은 동네 도서관에서 받습니다. 참가비는 없습니다.',unknown:'상세 내용 확인'},
 confirmation:{ad:'비공개 카지노 모임에 새 참가자를 초대합니다. 계정을 만든 뒤 판돈을 입금하고 현금 인출 게임을 시작하세요.',
  warning:'디지털 시민교육에서 위험한 모집 사례를 소개합니다. 다음 발췌문은 경고를 위한 예시이고 해당 서비스 이용을 권장하지 않습니다.',
  linked:'비공개 현금 배팅 모임으로 연결하는 신청 버튼입니다. 판돈을 낼 참가자는 아래에서 등록하세요.',link:'참가 접수로 이동',
  normal:'시민 문화강좌 수강생을 모집합니다. 수강료와 접수 절차는 문화센터에 문의해 주세요.',unknown:'이 항목 살펴보기'}
};
function cases(split){const t=texts[split],out=[],hold=split==='confirmation';
 for(const [scenario,ad,review]of [['quote',false,false],['warning-ad',true,false],['other-comment',true,false],['neighbor-ad',false,false],['linked',true,false],['insufficient',null,true],['direct',true,false],['ordinary',false,false]]){
  for(let variant=0;variant<4;variant++){
   const i=out.length,id='entry-'+String(i+1).padStart(2,'0'),tech=['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'][variant];
   let raw=['linked','insufficient'].includes(scenario)?t[scenario==='linked'?'link':'unknown']:['neighbor-ad','ordinary'].includes(scenario)?t.normal:t.ad;
   if(variant===0)raw=(hold?'ＷＥＬＣＯＭＥ':'ＧＵＩＤＥ')+' · '+raw;
   if(variant===1)raw=raw.normalize('NFD');
   const tag=['linked','insufficient'].includes(scenario)?'a':hold?['strong','h2','div','p'][variant]:['h3','p','span','div'][variant];
   const style=variant===2?'opacity:0':variant===3?'position:absolute;left:-9999px;top:0;width:600px':'';
   const parts=raw.split(' '),inside=variant===1?parts.map(p=>'<span>'+escape(p)+'</span>').join(' '):escape(raw);
   const target=`<div style="${style}"><${tag} id="${id}"${tag==='a'?' href="https://example.invalid/entry"':''}>${inside}</${tag}></div>`;
   const owner=hold?'section':'article',comment=hold?'role="listitem"':'role="comment"';
   let content;
   if(scenario==='quote')content=`<${owner}><p>${t.warning}</p>${hold?target:'<blockquote>'+target+'</blockquote>'}</${owner}>`;
   if(scenario==='warning-ad')content=`<aside><p>${t.warning}</p><blockquote>출처를 알 수 없는 모집 안내를 조심하세요.</blockquote></aside><${owner}><p>${hold?'별도 게시글':'다른 이용자의 글'}</p>${target}</${owner}>`;
   if(scenario==='other-comment')content=`<div role="list"><div ${comment}><p>${t.warning}</p></div><div ${comment}>${target}</div></div>`;
   if(scenario==='neighbor-ad')content=`<div role="list"><div ${comment}><p>${t.ad}</p></div><div ${comment}>${target}</div></div>`;
   if(scenario==='linked')content=`<${owner}><p>${t.linked}</p>${target}</${owner}>`;
   if(['insufficient','direct','ordinary'].includes(scenario))content=`<${owner}>${target}</${owner}>`;
   const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>시민 소통 게시판</title><style>body{background:white;color:black;font:16px sans-serif}article,section{margin:16px}header{border-bottom:1px solid #ccc}</style></head><body><header><h1>시민 소통</h1><nav>홈 · 참여 · 열린 게시판</nav></header><main>'+content+'</main><footer>시민 이용 안내</footer></body></html>';
   out.push({id,split,scenario,variant,raw,selector:tag+'#'+id,is_ad:ad,expected_review:review,observed:[tech],techniques:ad?[tech]:[],html});
  }
 }return out;
}
async function prepare(destination){
 assert(!fs.existsSync(destination),'Use a new output directory');fs.mkdirSync(destination,{recursive:true});
 const specs=[...cases('dev'),...cases('confirmation')],pages=new Map(specs.map(s=>['/'+s.split+'/'+s.id,s.html]));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');const html=pages.get(req.url);res.statusCode=html?200:404;res.end(html||'Not found');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const collector=await createCollector({channel:'msedge'});const collected={dev:{candidates:[],technique_observations:[]},confirmation:{candidates:[],technique_observations:[]}},labels={dev:[],confirmation:[]};
 try{for(const s of specs){const url=origin+'/'+s.split+'/'+s.id,snapshot=await collector.collect(url,{maxPages:1,maxNodes:1000,followLinks:false,observeTechniques:true});
   const c=snapshot.candidates.find(c=>c.selector===s.selector);assert(c,'Missing target '+s.split+'/'+s.id);assert.equal(c.raw_text,s.raw,'Text preservation');
   const observation=snapshot.technique_observations.find(o=>o.node_id===c.node_id);assert(observation);
   for(const o of observation.observations)for(const e of o.evidence)assert.equal(e.text,c.raw_text.slice(e.start,e.end));
   collected[s.split].candidates.push(c);collected[s.split].technique_observations.push(observation);
   labels[s.split].push({node_id:c.node_id,scenario:s.scenario,variant:s.variant,is_ad:s.is_ad,expected_review:s.expected_review,observed:s.observed,techniques:s.techniques});
   const folder=path.join(destination,'site',s.split);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,s.id+'.html'),s.html);
  }
  for(const split of Object.keys(collected)){fs.writeFileSync(path.join(destination,split+'-evidence.json'),JSON.stringify(collected[split],null,2));fs.writeFileSync(path.join(destination,split+'-labels.json'),JSON.stringify(labels[split],null,2));}
  fs.writeFileSync(path.join(destination,'collection.json'),JSON.stringify({origin,targets:specs.length,source:'real browser; controlled synthetic HTML',created_at:new Date().toISOString()},null,2));
  console.log(JSON.stringify({destination,targets:specs.length}));
 }finally{await collector.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={cases,prepare};if(require.main===module)prepare(path.resolve(process.argv[2]||'.runtime/context-ownership-data-v1')).catch(e=>{console.error(e);process.exitCode=1});
