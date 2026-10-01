// New synthetic context-boundary check. Labels stay in this local scorer, never in model evidence.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {collect}=require('../src/core/collect.cjs');
const root=path.resolve('.runtime/stage3-preflight');
const contracts=['target-contract.cjs','service-contract.cjs','support-contract.cjs','contextualize.cjs','run.cjs'];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const write=(name,value)=>fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(value,null,2));
const samples=[],pages=[];
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function add(text,context,is_ad,layout,kind,after=false){
  const index=samples.length,id='t'+index,tag=['a','button','h3','p'][layout%4];
  const target=`<${tag} id="${id}"${tag==='a'?' href="#access"':''}>${escape(text)}</${tag}>`;
  const note=`<p>${escape(context)}</p>`,content=after?target+note:note+target;
  const wrappers=[s=>`<article>${s}</article>`,s=>`<div role="comment">${s}</div>`,s=>`<table><tbody><tr><td>${s}</td></tr></tbody></table>`,s=>`<section><custom-entry>${s}</custom-entry></section>`];
  pages.push('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>시민 게시판</title></head><body><header>주민 참여</header>'+wrappers[layout%4](content)+'<footer>페이지 끝</footer></body></html>');
  samples.push({page:'/preflight/'+index,selector:tag+'#'+id,text,is_ad,kind});
}
const offers=[
 ['여기에서 시작하세요.','사설 현금 베팅방 신규 회원을 받습니다. 아래 버튼은 해당 베팅방 접속 창구입니다.','시립 평생교육원 신규 수강생을 받습니다. 아래 버튼은 수강 접수 창구입니다.'],
 ['바로 연결','현금을 걸고 승부를 맞히는 미등록 도박방입니다. 아래 링크로 참여할 수 있습니다.','시청의 도로 파손 민원 접수 창구입니다. 아래 링크로 접수할 수 있습니다.'],
 ['이용 안내 보기','동의 없이 촬영된 사적 성인 영상을 유료로 판매합니다. 아래에서 구매 방법을 확인하세요.','시립 박물관에서 허가받은 소장품 사진집을 판매합니다. 아래에서 구매 방법을 확인하세요.'],
 ['신규 회원 혜택','사설 온라인 카지노 회원 모집입니다. 아래 제목은 첫 현금 입금 고객에게 제공하는 추가 베팅 금액 안내입니다.','시립 도서관 회원 모집입니다. 아래 제목은 첫 대출 고객에게 제공하는 책갈피 안내입니다.'],
 ['예약은 이곳에서','동의 없이 유출된 성적 영상을 돈 받고 전달합니다. 아래 링크는 구매 예약 창구입니다.','주민 문화센터에서 천연염색 수업을 진행합니다. 아래 링크는 수강 예약 창구입니다.'],
 ['오늘도 열려 있습니다.','이 게시글은 사설 현금 도박방 회원을 모집합니다. 다음 문장은 그 방의 영업 상태를 알리는 실제 홍보 문구입니다.','이 게시글은 구립도서관 주말 운영 안내입니다. 다음 문장은 도서관의 운영 상태를 알리는 문구입니다.'],
 ['상세 내용 확인','가입 즉시 현금 베팅이 가능한 미등록 카지노입니다. 아래 링크에서 입금과 게임 참여 절차를 안내합니다.','온라인 주민총회 공개 자료실입니다. 아래 링크에서 의제와 회의 참여 절차를 안내합니다.'],
 ['참가 접수','이 글은 사설 현금 도박 대회의 참가자를 모집합니다. 아래는 참가 신청 링크입니다.','이 글은 구청 주최의 무료 가족 걷기 대회의 참가자를 모집합니다. 아래는 참가 신청 링크입니다.']
];
for(const [i,[text,ad,normal]]of offers.entries()){add(text,ad,true,i,'context-dependent');add(text,normal,false,i,'context-pair-normal');}
const direct=[
 '사설 현금 카지노에 가입하고 오늘 베팅을 시작하세요.',
 '동의 없이 촬영된 사적 성인 영상 묶음을 유료로 판매합니다.',
 '미등록 온라인 도박방에서 현금을 걸고 경기 결과를 맞혀 보세요.',
 '불법 촬영 영상 교환방의 유료 회원을 지금 모집합니다.'
];
for(const [i,text]of direct.entries()){
 add(text,'아래는 실제 회원 모집 안내이며 교육을 위한 인용문이 아닙니다.',true,i,'direct-ad');
 add(text,'앞에 제시한 문장은 시민 신고 교육을 위해 재현한 광고 사례입니다. 실제 이용을 권유하는 안내가 아닙니다.',false,i,'quotation',true);
}
for(const [i,text]of ['작성자: 기록 담당자','조회 27회','게시일: 2026년 9월 22일','분류: 자유 게시판'].entries())add(text,direct[i],false,i,'metadata-next-to-ad');
async function prepare(){
 if(fs.existsSync(root))throw Error('Preflight directory exists; preserve sealed inputs');
 fs.mkdirSync(root,{recursive:true});
 const server=http.createServer((req,res)=>{const match=/^\/preflight\/(\d+)$/.exec(req.url);res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/preflight/')return res.end(pages.map((_,i)=>`<a href="/preflight/${i}">문서 ${i+1}</a>`).join(''));
  if(match&&pages[+match[1]])return res.end(pages[+match[1]]);res.statusCode=404;res.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}`,snapshot=await collect(base+'/preflight/',{maxPages:40,maxNodes:400,readiness:{minimumMs:100,quietMs:100,maximumMs:1000}});
  const selected=samples.map(s=>{const c=snapshot.candidates.find(c=>c.url===base+s.page&&c.selector===s.selector);assert(c,'Missing target '+s.selector);assert.equal(c.raw_text,s.text);assert(c.context_evidence.units.some(u=>u.relation!=='target'&&u.text),'Missing context '+s.selector);return c;});
  write('collection',snapshot);write('evidence',{...snapshot,candidates:selected});
  write('reordered-evidence',{...snapshot,candidates:selected.filter((_,i)=>i%2).reverse().concat(selected.filter((_,i)=>i%2===0).reverse())});
  write('labels',samples.map((s,i)=>({...s,node_id:selected[i].node_id})));
  const sources=Object.fromEntries(contracts.map(f=>[f,hash(fs.readFileSync(path.join(__dirname,f)))]));
  write('seal',{created:new Date().toISOString(),sources,count:selected.length,ads:samples.filter(s=>s.is_ad).length,
   evidence:hash(fs.readFileSync(path.join(root,'evidence.json'))),labels:hash(fs.readFileSync(path.join(root,'labels.json'))),
   rule:'Fresh synthetic context/HTML combinations, first-use validation only. No model output seen when sealed. No labels passed to detector.'});
  console.log(JSON.stringify({pages:snapshot.pages.length,candidates:snapshot.candidates.length,selected:selected.length,ads:samples.filter(s=>s.is_ad).length}));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
function score(dir){
 const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json'))),labels=JSON.parse(fs.readFileSync(path.join(root,'labels.json'))),run=read('run'),decisions=read('decisions'),target=read('target-decisions');
 const seal=JSON.parse(fs.readFileSync(path.join(root,'seal.json')));
 assert.equal(hash(fs.readFileSync(path.join(root,'labels.json'))),seal.labels,'Changed labels');
 assert.equal(hash(fs.readFileSync(path.join(root,'evidence.json'))),seal.evidence,'Changed evidence');
 for(const [file,digest]of Object.entries(seal.sources))assert.equal(hash(fs.readFileSync(path.join(__dirname,file))),digest,'Changed detector '+file);
 const original=new Map(JSON.parse(fs.readFileSync(path.join(root,'evidence.json'))).candidates.map(c=>[c.node_id,c]));
 for(const c of read('evidence').candidates)assert.deepEqual(c,original.get(c.node_id),'Changed candidate evidence');
 const byId=new Map(decisions.map(d=>[d.node_id,d])),initial=new Map(target.map(d=>[d.node_id,d]));
 assert.equal(byId.size,labels.length);assert.equal(run.status,'completed');assert(labels.every(l=>byId.has(l.node_id)));
 const rows=labels.map(l=>({...l,prediction:byId.get(l.node_id),initial:initial.get(l.node_id)}));
 const tp=rows.filter(r=>r.is_ad&&r.prediction.is_violation&&!r.prediction.needs_review).length,
  fp=rows.filter(r=>!r.is_ad&&r.prediction.is_violation&&!r.prediction.needs_review).length,fn=labels.filter(l=>l.is_ad).length-tp;
 const precision=tp+fp?tp/(tp+fp):null,recall=tp/(tp+fn),reviews=rows.filter(r=>r.prediction.needs_review).length;
 const result={count:rows.length,tp,fp,fn,precision,recall,f1:2*tp/(2*tp+fp+fn),reviews,passed:!fp&&!fn&&!reviews,
  calls:run.calls.length,totalTokens:run.totalTokens,elapsedSec:run.elapsedSec,
  errors:rows.filter(r=>r.prediction.is_violation!==r.is_ad||r.prediction.needs_review),rows};
 fs.writeFileSync(path.join(dir,'analysis.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,rows:undefined,errors:result.errors.map(r=>({text:r.text,ad:r.is_ad,initial:r.initial.author_purpose,final:r.prediction.is_violation,review:r.prediction.needs_review}))},null,2));
}
function outputCheck(){
 const {outputResult}=require('../src/core/output.cjs');
 const snapshot=JSON.parse(fs.readFileSync(path.join(root,'evidence.json')));
 const candidates=snapshot.candidates.slice(0,4);
 const decisions=candidates.map((c,i)=>({node_id:c.node_id,is_violation:i!==1,needs_review:i===3,reason:'출력 계약 검사',
  techniques:i===2?['JAMO','OFFSCREEN']:[],observed_techniques:i===1?['TRANSPARENT']:i===2?['JAMO','OFFSCREEN']:[]}));
 const out=outputResult({...snapshot,candidates},decisions,new Date().toISOString(),0,'mock');
 assert.equal(out.result.findings.length,2);
 assert.deepEqual(out.result.findings.map(f=>f.technique),['JAMO','OFFSCREEN']);
 assert(out.result.findings.every(f=>f.url===candidates[2].url&&f.location===candidates[2].location&&f.evidence_text===candidates[2].raw_text));
 assert.deepEqual(out.diagnostics.map(d=>d.node_id),[candidates[0].node_id,candidates[3].node_id]);
 assert(out.diagnostics[0].is_violation&&!out.diagnostics[0].needs_review);
 assert(out.diagnostics[1].needs_review);
 assert(!out.result.findings.some(f=>f.location===candidates[1].location));
 write('output-contract-check',{passed:true,checks:['plain ad preserved in diagnostics, not converted to normal','normal text with observed technique creates no finding','multiple techniques retain target URL/location/raw evidence','uncertainty stays in diagnostics'],
  policy:'The four required contest codes remain unchanged. Plain ads have no fabricated technique. Optional ETC export is a separate feature, not activated by this check.'});
 console.log('PASS: four output-contract boundaries; plain ads retained as diagnostics, no fabricated technique');
}
if(process.argv[2]==='prepare')prepare().catch(e=>{console.error(e);process.exitCode=1;});
else if(process.argv[2]==='score')score(path.resolve(process.argv[3]));
else if(process.argv[2]==='output-check')outputCheck();
else throw Error('Usage: node agent/experiments/preflight.cjs prepare|score RUN_DIRECTORY|output-check');
