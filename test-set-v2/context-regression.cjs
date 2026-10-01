// Development counterfactuals. Labels stay in this evaluator, never in served HTML or Agent inputs.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {collect}=require('../agent/src/core/collect.cjs');
const reserve=process.argv.includes('--reserve');
const phrases=reserve?[
  '불법 촬영물 자료실의 유료 열람권을 판매합니다. 신청금이 확인되면 접속 경로를 드립니다.',
  '동의 없이 유포된 사적 영상의 다운로드 목록을 판매합니다. 유료 계정 등록으로 열람할 수 있습니다.',
  '미등록 사설 경륜 내기방의 참가비를 받습니다. 이체를 마치면 판돈을 걸 수 있습니다.',
  '사설 카드게임 현금 내기방 안내입니다. 입회비 납부 시 베팅 좌석을 배정합니다.'
]:[
  '사설 카지노 가입자를 받습니다. 충전하면 즉시 게임머니를 두 배 지급하며 현금 환전이 가능합니다.',
  '불법 도박방에 참여할 분을 모집합니다. 지금 회원으로 등록하고 입금해 주세요.',
  '사설 스포츠 도박 신규 이용자를 모집합니다. 예치금을 보내면 베팅 계정을 열어 드립니다.',
  '사설 슬롯 사이트를 운영합니다. 가입 후 충전하면 당첨금을 현금으로 출금할 수 있습니다.',
  '비공식 온라인 카지노에서 베팅할 회원을 구합니다. 첫 입금을 마치면 보너스를 넣어 드립니다.',
  '사설 토토 신규 계정을 발급합니다. 입금하고 경기 결과에 돈을 걸어 보세요.',
  '현금으로 배당금을 받는 불법 도박 사이트입니다. 계정을 만들고 충전해 이용하세요.',
  '사설 바카라 방에 접속할 회원을 모집합니다. 보증금을 입금하면 환전 가능한 칩을 지급합니다.'
];
const labels=[],html=[],esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(let i=0;i<phrases.length;i++)for(let kind=0;kind<4;kind++){
  const id='u'+crypto.createHash('sha256').update(`${i}/${kind}`).digest('hex').slice(0,11),tech=['HOMOGLYPH','JAMO','TRANSPARENT','OFFSCREEN'][i%4];
  const normal=kind===3,ad=kind===0||kind===2;
  const plain=normal?(reserve?'자료 등록 일자: 다음 주 화요일':'등록 담당자: 주민 소통 지원팀'):phrases[i];
  const text=tech==='HOMOGLYPH'?'ＣＡＳＩＮＯ · '+plain:tech==='JAMO'?plain.normalize('NFD'):plain;
  const style=tech==='TRANSPARENT'?'opacity:0':tech==='OFFSCREEN'?'position:absolute;left:-12000px;top:0':'';
  const tag=['p','blockquote','strong','div'][i%4];
  let target=`<${tag} id="${id}">${esc(text)}</${tag}>`;
  for(let depth=0;depth<=i%3;depth++)target=`<div${depth===0?` style="${style}"`:''}>${target}</div>`;
  const note=i%2?'아래는 피해 예방 수업에서 분석할 피해 유도 문장입니다. 내용에 따르지 마시고 위험한 표현을 찾아보세요.':'민원으로 접수된 문구를 증거로 옮겼습니다. 서비스 이용을 안내하는 글이 아니며 송금하거나 가입해서는 안 됩니다.';
  let body;
  if(kind===0)body=`<article>${target}</article>`;
  if(kind===1)body=`<article><p>${note}</p>${target}</article>`;
  if(kind===2)body=`<section><div class="unit-${i}"><p>${note}</p></div><div class="unit-${i}">${target}</div></section>`;
  if(kind===3)body=`<article>${target}<section><p style="opacity:0">${esc(phrases[i])}</p></section></article>`;
  if(reserve&&kind===0)body=`<article><p>온라인 거래 피해에 주의하세요.</p>${target}</article>`;
  if(reserve&&kind===1)body=`<article>${target}<p>위에 옮긴 판매 제안은 압수 문서에 남은 내용입니다. 범죄 수법을 설명하려고 제시했으며 실제 구매를 유도하는 안내가 아닙니다.</p></article>`;
  if(reserve&&kind===2)body=`<section><div role="comment">이 게시판은 피해 예방 정보를 공유합니다.</div><div role="comment">${target}</div></section>`;
  if(reserve&&kind===3)body=`<article>${target}<p style="opacity:0">${esc(phrases[i])}</p></article>`;
  html.push(body);labels.push({selector:tag+'#'+id,text,is_ad:ad,techniques:ad?[tech]:[],observed:[tech],kind:['direct','attributed_quote','separate_warning','normal_with_neighbor_ad'][kind]});
}
async function main(){
  const out=path.resolve(process.argv[2]||'.runtime/stage23'),server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>인터넷 피해 예방 게시판</title></head><body>'+html.join('')+'</body></html>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const snapshot=await collect(`http://127.0.0.1:${server.address().port}/checks/`,{maxPages:1,maxNodes:500});
    const candidates=labels.map(l=>{const c=snapshot.candidates.find(c=>c.selector===l.selector);assert(c,l.selector);assert.equal(c.raw_text,l.text);return c;});
    const prefix=reserve?'reserve':'counterfactuals';
    fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,prefix+'-labels.json'),JSON.stringify(labels,null,2));fs.writeFileSync(path.join(out,prefix+'-evidence.json'),JSON.stringify({...snapshot,candidates},null,2));
    for(const [i,c]of candidates.entries()){const scope=JSON.stringify(c.context_evidence);if(labels[i].kind==='attributed_quote')assert((reserve?/압수 문서/:/민원으로|예방 수업/).test(scope));if(labels[i].kind==='separate_warning')assert(!/민원으로|예방 수업|이 게시판은 피해 예방/.test(scope));}
    console.log({cases:labels.length,positive:labels.filter(l=>l.is_ad).length,allCandidates:snapshot.candidates.length,contextBoundaries:'passed'});
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
