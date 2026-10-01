// Experimental single-factor comparison; production collector and C remain untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{contract}=require('../src/core/judgment.cjs');
const {normalizeText}=require('../src/core/jamo.cjs'),{signalsFor}=require('../src/core/collect.cjs');
const {runComparison,estimate}=require('./semantic-search-run.cjs');
const root=path.resolve('.runtime/own-link-v1'),read=f=>JSON.parse(fs.readFileSync(f));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function rows(split){
 const goods=split==='dev'?['허가 없는 경륜 도박','동의 없이 촬영한 성인 영상']:['불법 현금 마작','유출된 성인 사생활 파일'];
 const texts=split==='dev'?['참가 신청','자료 주문','계좌 안내','유료 회원 등록','이용 창구','구매 신청','안내 확인','문의 남기기']:['참여 접수','파일 구입','요금 납부','구독 결제','예약하기','배송 요청','접속 안내','상담 연결'];
 const urls=['/entry?room=72','https://service.invalid/casino/join','/payment?return=%2Fnotice','https://files.invalid/adult/order','../portal?id=84','https://archive.invalid/report?source=casino','/form?step=2#apply','https://public.invalid/%EC%95%88%EB%82%B4'];
 const out=[];
 for(let i=0;i<8;i++)for(const expected of [true,false]){
  const text=texts[i],service=goods[i%2],before=expected?`제가 제공하는 ${service}의 유료 이용 창구입니다. 아래에서 비용을 보내고 신청하세요.`:(i<4?`${service} 모집 수법을 설명하는 피해예방 자료입니다. 아래 링크 문구와 주소는 신고 대상 원문을 인용한 것입니다.`:`시민 ${i%2?'영상제':'보드게임 교실'} 신청 안내입니다. 정상 행사 접수이며 도박·불법 영상 거래와 관계없습니다.`),after=expected?'실제 가입과 구매를 접수합니다.':i<4?'접속하거나 결제하지 마세요. 신고 자료로만 제시합니다.':'행사는 무료이며 공공 문화 프로그램입니다.';
  out.push({expected,text,before,after,href:urls[i],wrapper:['article','section','aside','div'][i%4],quote:i<4&&!expected});
 }
 for(let i=0;i<4;i++)out.push({expected:null,text:['전용 안내','가입 창구','자료 받기','별도 상담'][i],before:'서비스의 상세 설명은 제공되지 않았습니다.',after:'',href:urls[i],wrapper:'section',quote:false});
 return out.map((r,i)=>({...r,id:'n_'+hash(split+'-own-link-'+i).slice(0,16)})).sort((a,b)=>a.id.localeCompare(b.id));
}
function readers(){const source=fs.readFileSync(require.resolve('../src/core/collect.cjs'),'utf8'),start=source.indexOf('function readDocument()'),end=source.indexOf('\nfunction observeDocument()',start);assert(start>=0&&end>start);const a=source.slice(start,end).trim(),old="[...node.querySelectorAll('a[href]')]",replacement="[...(node.matches('a[href]') ? [node] : []), ...node.querySelectorAll('a[href]')]";assert.equal(a.split(old).length,2);return {a,b:a.replace(old,replacement),sourceHash:hash(source)};}
async function prepare(){assert(!fs.existsSync(root),'Fresh output required');fs.mkdirSync(root,{recursive:true});
 const {a,b,sourceHash}=readers(),browser=await chromium.launch({channel:'msedge',headless:true}),groups=[];let nodes=0,changed=0,blocked=0;
 try{const context=await browser.newContext();await context.route('**/*',route=>{blocked++;return route.abort();});const page=await context.newPage();
  for(const split of ['dev','eval']){const candidates=[],labels=[];
   for(const r of rows(split)){const html=`<!doctype html><html lang="ko"><head><base href="https://public.invalid/board/view"><title>시민 참여 안내</title></head><body><${r.wrapper} role="article"><p>${esc(r.before)}</p>${r.quote?'<blockquote>':''}<a id="${r.id}" href="${esc(r.href)}">${esc(r.text)}</a>${r.quote?'</blockquote>':''}<p>${esc(r.after)}</p></${r.wrapper}></body></html>`;
    await page.setContent(html);fs.writeFileSync(path.join(root,r.id+'.html'),html);
    const A=await page.evaluate('('+a+')()'),B=await page.evaluate('('+b+')()');assert.equal(A.nodes.length,B.nodes.length);assert.deepEqual(A.links,B.links);assert.deepEqual(A.iframes,B.iframes);
    for(let i=0;i<A.nodes.length;i++){nodes++;const x=A.nodes[i],y=B.nodes[i],{links:al,...ax}=x,{links:bl,...bx}=y;assert.deepEqual(ax,bx);if(JSON.stringify(al)!==JSON.stringify(bl)){changed++;assert.equal(x.own_style.tag,'a');assert.equal(bl.length,al.length+1);assert.deepEqual(bl.slice(1),al);}}
    const target=A.nodes.find(n=>n.selector==='a#'+r.id),fixed=B.nodes.find(n=>n.selector===target?.selector);assert(target&&fixed);assert.equal(target.links.length,0);assert.equal(fixed.links.length,1);assert.equal(fixed.links[0].url,new URL(r.href,'https://public.invalid/board/view').href);
    const c={...target,node_id:r.id,url:'https://public.invalid/board/view',location:target.selector,page_title:A.title,frame_urls:[],normalized_text:normalizeText(target.raw_text)};c.signals=signalsFor(c);c.own_link_result=fixed.links;candidates.push(c);labels.push({node_id:r.id,is_ad:r.expected});
   }groups.push({name:split,labels,snapshot:{candidates}});
  }
  await page.setContent('<base href="https://public.invalid/"><article><p id="parent">문장 <a href="/inside"><span>내부 링크</span></a></p><a id="empty">주소 없는 표시</a></article><iframe srcdoc="&lt;a href=\'https://frame.invalid/path?q=1\'&gt;프레임&lt;/a&gt;"></iframe>');
  for(const frame of page.frames()){const A=await frame.evaluate('('+a+')()'),B=await frame.evaluate('('+b+')()');assert.deepEqual(A.links,B.links);for(let i=0;i<A.nodes.length;i++){const x=A.nodes[i],y=B.nodes[i];assert.deepEqual({...x,links:y.links},y);if(x.own_style.tag!=='a'||!y.links.length)assert.deepEqual(x,y);}if(frame===page.mainFrame()){assert.deepEqual(A.nodes.find(n=>n.selector==='p#parent'),B.nodes.find(n=>n.selector==='p#parent'));assert.deepEqual(A.nodes.find(n=>n.selector==='a#empty'),B.nodes.find(n=>n.selector==='a#empty'));}else assert.equal(B.nodes[0].links[0].url,'https://frame.invalid/path?q=1');}
  await context.close();
 }finally{await browser.close();}
 const previous=read('.runtime/attribution-next-v1/replica-evidence.json');groups.push({name:'replica',labels:read('.runtime/attribution-next-v1/replica-labels.json'),snapshot:previous});
 fs.writeFileSync(path.join(root,'prepared.json'),JSON.stringify({groups,checks:{nodes,changed,blocked,sourceHash,assertions:'passed'}},null,2));return groups;
}
function contracts(){const A=contract();return {A,L:{...A,initialEvidence:c=>({...A.initialEvidence(c),links:c.own_link_result||c.links})}};}
async function main(){if(process.argv.includes('--prepare')){await prepare();console.log('PASS real DOM paired extraction and boundary checks');return;}
 const {groups}=read(path.join(root,'prepared.json')),cs=contracts(),methods=Object.fromEntries(Object.entries(cs).map(([k,v])=>[k,{contract:v,batchSize:4,maxTokens:512}]));let calls=0,reserved=0;
 for(const g of groups)for(const m of Object.values(methods))for(let i=0;i<g.labels.length;i+=4){calls+=2;reserved+=2*(await estimate(g.snapshot.candidates.slice(i,i+4),{provider:'hcx',maxTokens:512,temperature:0,seed:42,reasoningEffort:'none'},m.contract)).tokens;}
 assert(calls<=90&&reserved<=450000);console.log(JSON.stringify({calls,reserved}));if(!process.argv.includes('--live'))return;
 await runComparison({root:path.join(root,'live'),groups,modes:['A','L'],rounds:2,maxTokens:512,methodSpecs:methods,sourceFiles:[__filename,require.resolve('../src/core/judgment.cjs'),require.resolve('../src/core/jamo-reading.cjs'),require.resolve('../src/core/jamo.cjs'),require.resolve('../src/core/collect.cjs'),path.join(root,'prepared.json'),'docs/own-link-plan.md'],limits:{calls:90,tokens:450000,seconds:3600}});
}
module.exports={contracts,readers};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
